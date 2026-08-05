import {
  DeckExportFormat,
  DeckExportRow,
  DeckExportScope,
} from '@/domain/deck-export/types';
import { DeckSection } from '@/domain/validation/types';

export type ExportService = {
  buildPayload(input: BuildExportPayloadInput): DeckExportPayload;
  format(rows: DeckExportRow[], format: DeckExportFormat): string;
};

export type BuildExportPayloadInput = {
  deckName: string;
  format: DeckExportFormat;
  rows: DeckExportRow[];
  scope?: DeckExportScope;
  sourceLabel?: string;
};

export type DeckExportPayload = {
  filename: string;
  format: DeckExportFormat;
  lineCount: number;
  mimeType: string;
  scope: DeckExportScope;
  text: string;
  title: string;
  uti: string;
};

export type ExportFileSystem = {
  cacheDirectory: string | null;
  makeDirectoryAsync: (
    fileUri: string,
    options?: { intermediates?: boolean },
  ) => Promise<void>;
  writeAsStringAsync: (fileUri: string, contents: string) => Promise<void>;
};

export const exportFormatOptions: {
  fileExtension: string;
  format: DeckExportFormat;
  label: string;
  mimeType: string;
  uti: string;
}[] = [
  {
    fileExtension: 'txt',
    format: 'plainText',
    label: 'Plain Text',
    mimeType: 'text/plain',
    uti: 'public.plain-text',
  },
  {
    fileExtension: 'txt',
    format: 'countPrefix',
    label: 'Count Prefix',
    mimeType: 'text/plain',
    uti: 'public.plain-text',
  },
  {
    fileExtension: 'csv',
    format: 'csv',
    label: 'CSV',
    mimeType: 'text/csv',
    uti: 'public.comma-separated-values-text',
  },
  {
    fileExtension: 'json',
    format: 'json',
    label: 'JSON',
    mimeType: 'application/json',
    uti: 'public.json',
  },
];

const sectionOrder: DeckSection[] = ['material', 'main', 'sideboard'];

export const exportService: ExportService = {
  buildPayload(input) {
    const metadata = getExportFormatMetadata(input.format);
    const scope = input.scope ?? 'full';
    const text = this.format(input.rows, input.format);
    const title = [
      input.deckName,
      input.sourceLabel,
      getScopeExportTitle(scope),
      metadata.label,
    ]
      .filter(Boolean)
      .join(' - ');

    return {
      filename: buildExportFilename({
        deckName: input.deckName,
        extension: metadata.fileExtension,
        format: input.format,
        scope,
        sourceLabel: input.sourceLabel,
      }),
      format: input.format,
      lineCount: countExportLines(text),
      mimeType: metadata.mimeType,
      scope,
      text,
      title,
      uti: metadata.uti,
    };
  },
  format(rows, format) {
    switch (format) {
      case 'countPrefix':
        return formatCountPrefix(rows);
      case 'csv':
        return formatCsv(rows);
      case 'json':
        return formatJson(rows);
      case 'plainText':
        return formatPlainText(rows);
    }
  },
};

export async function writeExportPayloadToCache(
  payload: DeckExportPayload,
  fileSystem: ExportFileSystem,
) {
  if (!fileSystem.cacheDirectory) {
    throw new Error('Export cache directory is unavailable.');
  }

  const exportDirectory = `${fileSystem.cacheDirectory}deck-exports/`;
  const uri = `${exportDirectory}${payload.filename}`;

  await fileSystem.makeDirectoryAsync(exportDirectory, { intermediates: true });
  await fileSystem.writeAsStringAsync(uri, payload.text);

  return uri;
}

export function getExportFormatMetadata(format: DeckExportFormat) {
  return (
    exportFormatOptions.find((option) => option.format === format) ??
    exportFormatOptions[0]
  );
}

export function getScopeExportTitle(scope: DeckExportScope) {
  if (scope === 'full') {
    return 'Full Deck';
  }

  return getSectionExportTitle(scope);
}

export function countExportLines(value: string) {
  return value.split('\n').filter((line) => line.trim().length > 0).length;
}

function formatPlainText(rows: DeckExportRow[]) {
  return sectionOrder
    .map((section) => {
      const sectionRows = rows.filter((row) => row.section === section);

      if (sectionRows.length === 0) {
        return '';
      }

      return [
        getSectionExportTitle(section),
        ...sectionRows.map((row) => `${row.quantity} ${row.cardName}`),
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatCountPrefix(rows: DeckExportRow[]) {
  return rows.map((row) => `${row.quantity}x ${row.cardName}`).join('\n');
}

function formatCsv(rows: DeckExportRow[]) {
  return [
    'section,quantity,card_name,set_prefix,collector_number',
    ...rows.map((row) =>
      [
        row.section,
        row.quantity,
        escapeCsv(row.cardName),
        row.setPrefix ?? '',
        row.collectorNumber ?? '',
      ].join(','),
    ),
  ].join('\n');
}

function formatJson(rows: DeckExportRow[]) {
  return JSON.stringify(
    {
      format: 'standard',
      sections: Object.fromEntries(
        sectionOrder.map((section) => [
          section,
          rows
            .filter((row) => row.section === section)
            .map((row) => ({
              cardName: row.cardName,
              collectorNumber: row.collectorNumber ?? null,
              quantity: row.quantity,
              setPrefix: row.setPrefix ?? null,
            })),
        ]),
      ),
    },
    null,
    2,
  );
}

function getSectionExportTitle(section: DeckSection) {
  switch (section) {
    case 'main':
      return 'Main Deck';
    case 'material':
      return 'Material Deck';
    case 'sideboard':
      return 'Sideboard';
  }
}

function escapeCsv(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function buildExportFilename({
  deckName,
  extension,
  format,
  scope,
  sourceLabel,
}: {
  deckName: string;
  extension: string;
  format: DeckExportFormat;
  scope: DeckExportScope;
  sourceLabel?: string;
}) {
  const formatSuffix =
    format === 'plainText' ? '' : getExportFormatMetadata(format).label;
  const parts = [
    deckName,
    sourceLabel,
    getScopeExportTitle(scope),
    formatSuffix,
  ].filter(Boolean);
  const slug = parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${slug || 'deck-export'}.${extension}`;
}
