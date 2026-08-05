import { AppDatabase } from '../database/Database';
import { migrateDatabase } from '../database/schema';
import {
  CardType,
  Deck,
  DeckCard,
  DeckSection,
} from '../../domain/validation/types';

export type DeckListOptions = {
  includeArchived?: boolean;
};

export type CreateDeckInput = {
  name: string;
  formatId?: string;
  championIdentityCardUuid?: string | null;
  notes?: string | null;
};

export type UpdateDeckInput = Partial<CreateDeckInput>;

export type UpsertDeckCardInput = {
  deckId: string;
  section: DeckSection;
  cardUuid: string;
  editionUuid?: string | null;
  quantity: number;
  sortOrder?: number | null;
};

export type DeckSnapshot = {
  id: string;
  deckId: string;
  label: string;
  exportText: string;
  deck: Deck;
  createdAt: string;
};

export type DeckService = {
  initialize(): Promise<void>;
  createDeck(input: CreateDeckInput): Promise<Deck>;
  getDeck(deckId: string): Promise<Deck | null>;
  listDecks(options?: DeckListOptions): Promise<Deck[]>;
  updateDeck(deckId: string, input: UpdateDeckInput): Promise<Deck>;
  archiveDeck(deckId: string): Promise<Deck>;
  duplicateDeck(deckId: string, name?: string): Promise<Deck>;
  upsertDeckCard(input: UpsertDeckCardInput): Promise<Deck>;
  removeDeckCard(deckCardId: string): Promise<void>;
  moveDeckCard(deckCardId: string, section: DeckSection): Promise<void>;
  createSnapshot(input: {
    deckId: string;
    label: string;
    exportText?: string;
  }): Promise<DeckSnapshot>;
  getSnapshot(snapshotId: string): Promise<DeckSnapshot | null>;
  listSnapshots(deckId: string): Promise<DeckSnapshot[]>;
  restoreSnapshot(snapshotId: string): Promise<Deck>;
};

type DeckRow = {
  id: string;
  name: string;
  format_id: string;
  champion_identity_card_uuid: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type DeckCardRow = {
  id: string;
  card_uuid: string;
  edition_uuid: string | null;
  section: DeckSection;
  quantity: number;
  sort_order: number | null;
  card_name: string;
  card_cost_type: string | null;
  card_cost_value: string | null;
  card_level: string | null;
  card_power: string | null;
  card_life: string | null;
  card_durability: string | null;
  card_speed: string | null;
  card_effect_raw: string | null;
  card_flavor: string | null;
  edition_set_prefix: string | null;
  edition_collector_number: string | null;
  edition_image_path: string | null;
  created_at: string;
  updated_at: string;
};

type SnapshotRow = {
  id: string;
  deck_id: string;
  label: string;
  export_text: string;
  raw_json: string;
  created_at: string;
};

export class SqliteDeckService implements DeckService {
  constructor(
    private readonly db: AppDatabase,
    private readonly createId: (prefix: string) => string = createLocalId,
  ) {}

  async initialize() {
    await migrateDatabase(this.db);
  }

  async createDeck(input: CreateDeckInput) {
    const now = new Date().toISOString();
    const deckId = this.createId('deck');

    await this.db.execute(
      `
        INSERT INTO decks (
          id,
          name,
          format_id,
          champion_identity_card_uuid,
          notes,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        deckId,
        input.name,
        input.formatId ?? 'standard',
        input.championIdentityCardUuid ?? null,
        input.notes ?? null,
        now,
        now,
      ],
    );

    return this.requireDeck(deckId);
  }

  async getDeck(deckId: string) {
    const row = await this.db.getFirst<DeckRow>(
      'SELECT * FROM decks WHERE id = ?',
      [deckId],
    );

    if (!row) {
      return null;
    }

    return this.hydrateDeck(row);
  }

  async listDecks(options: DeckListOptions = {}) {
    const rows = await this.db.getAll<DeckRow>(
      `
        SELECT *
        FROM decks
        ${options.includeArchived ? '' : 'WHERE archived_at IS NULL'}
        ORDER BY updated_at DESC, name COLLATE NOCASE
      `,
    );

    return Promise.all(rows.map((row) => this.hydrateDeck(row)));
  }

  async updateDeck(deckId: string, input: UpdateDeckInput) {
    const deck = await this.requireDeck(deckId);
    const now = new Date().toISOString();

    await this.db.execute(
      `
        UPDATE decks
        SET
          name = ?,
          format_id = ?,
          champion_identity_card_uuid = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        input.name ?? deck.name,
        input.formatId ?? deck.formatId,
        input.championIdentityCardUuid ?? deck.championIdentityCardUuid ?? null,
        input.notes ?? deck.notes ?? null,
        now,
        deckId,
      ],
    );

    return this.requireDeck(deckId);
  }

  async archiveDeck(deckId: string) {
    const now = new Date().toISOString();

    await this.db.execute(
      `
        UPDATE decks
        SET archived_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [now, now, deckId],
    );

    return this.requireDeck(deckId);
  }

  async duplicateDeck(deckId: string, name?: string) {
    const original = await this.requireDeck(deckId);

    return this.db.withTransaction(async () => {
      const duplicate = await this.createDeck({
        championIdentityCardUuid: original.championIdentityCardUuid ?? null,
        formatId: original.formatId,
        name: name ?? `${original.name} Copy`,
        notes: original.notes ?? null,
      });

      for (const card of original.cards) {
        await this.upsertDeckCard({
          cardUuid: card.cardUuid,
          deckId: duplicate.id,
          editionUuid: card.editionUuid ?? null,
          quantity: card.quantity,
          section: card.section,
          sortOrder: card.sortOrder ?? null,
        });
      }

      return this.requireDeck(duplicate.id);
    });
  }

  async upsertDeckCard(input: UpsertDeckCardInput) {
    await this.requireDeck(input.deckId);

    if (input.quantity <= 0) {
      const existing = await this.findExistingDeckCard(input);

      if (existing) {
        await this.removeDeckCard(existing.id);
      }

      return this.requireDeck(input.deckId);
    }

    const now = new Date().toISOString();
    const existing = await this.findExistingDeckCard(input);

    if (existing) {
      await this.db.execute(
        `
          UPDATE deck_cards
          SET quantity = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `,
        [
          input.quantity,
          input.sortOrder ?? existing.sort_order,
          now,
          existing.id,
        ],
      );
      await this.touchDeck(input.deckId, now);

      return this.requireDeck(input.deckId);
    }

    await this.db.execute(
      `
        INSERT INTO deck_cards (
          id,
          deck_id,
          section,
          card_uuid,
          edition_uuid,
          quantity,
          sort_order,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        this.createId('deck_card'),
        input.deckId,
        input.section,
        input.cardUuid,
        input.editionUuid ?? null,
        input.quantity,
        input.sortOrder ?? null,
        now,
        now,
      ],
    );

    await this.touchDeck(input.deckId, now);

    return this.requireDeck(input.deckId);
  }

  async removeDeckCard(deckCardId: string) {
    const existing = await this.db.getFirst<{ deck_id: string }>(
      'SELECT deck_id FROM deck_cards WHERE id = ?',
      [deckCardId],
    );

    await this.db.execute('DELETE FROM deck_cards WHERE id = ?', [deckCardId]);

    if (existing) {
      await this.touchDeck(existing.deck_id);
    }
  }

  async moveDeckCard(deckCardId: string, section: DeckSection) {
    const existing = await this.db.getFirst<{
      id: string;
      deck_id: string;
      section: DeckSection;
      card_uuid: string;
      edition_uuid: string | null;
      quantity: number;
      sort_order: number | null;
    }>('SELECT * FROM deck_cards WHERE id = ?', [deckCardId]);

    if (!existing) {
      return;
    }

    if (existing.section === section) {
      return;
    }

    const now = new Date().toISOString();
    const target = await this.findExistingDeckCard({
      cardUuid: existing.card_uuid,
      deckId: existing.deck_id,
      editionUuid: existing.edition_uuid,
      section,
    });

    if (target && target.id !== existing.id) {
      await this.db.execute(
        `
          UPDATE deck_cards
          SET quantity = quantity + ?, updated_at = ?
          WHERE id = ?
        `,
        [existing.quantity, now, target.id],
      );
      await this.db.execute('DELETE FROM deck_cards WHERE id = ?', [
        existing.id,
      ]);
      await this.touchDeck(existing.deck_id, now);
      return;
    }

    await this.db.execute(
      `
        UPDATE deck_cards
        SET section = ?, updated_at = ?
        WHERE id = ?
      `,
      [section, now, deckCardId],
    );
    await this.touchDeck(existing.deck_id, now);
  }

  async createSnapshot(input: {
    deckId: string;
    label: string;
    exportText?: string;
  }) {
    const deck = await this.requireDeck(input.deckId);
    const snapshot: DeckSnapshot = {
      createdAt: new Date().toISOString(),
      deck,
      deckId: input.deckId,
      exportText: input.exportText ?? '',
      id: this.createId('snapshot'),
      label: input.label,
    };

    await this.db.execute(
      `
        INSERT INTO deck_snapshots (
          id,
          deck_id,
          label,
          export_text,
          raw_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        snapshot.id,
        snapshot.deckId,
        snapshot.label,
        snapshot.exportText,
        JSON.stringify(snapshot.deck),
        snapshot.createdAt,
      ],
    );

    return snapshot;
  }

  async getSnapshot(snapshotId: string) {
    const row = await this.db.getFirst<SnapshotRow>(
      'SELECT * FROM deck_snapshots WHERE id = ?',
      [snapshotId],
    );

    return row ? mapSnapshotRow(row) : null;
  }

  async listSnapshots(deckId: string) {
    const rows = await this.db.getAll<SnapshotRow>(
      `
        SELECT *
        FROM deck_snapshots
        WHERE deck_id = ?
        ORDER BY created_at DESC
      `,
      [deckId],
    );

    return rows.map(mapSnapshotRow);
  }

  async restoreSnapshot(snapshotId: string) {
    const snapshot = await this.getSnapshot(snapshotId);

    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    await this.requireDeck(snapshot.deckId);

    return this.db.withTransaction(async () => {
      const now = new Date().toISOString();

      await this.db.execute(
        `
          UPDATE decks
          SET
            format_id = ?,
            champion_identity_card_uuid = ?,
            notes = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [
          snapshot.deck.formatId,
          snapshot.deck.championIdentityCardUuid ?? null,
          snapshot.deck.notes ?? null,
          now,
          snapshot.deckId,
        ],
      );
      await this.db.execute('DELETE FROM deck_cards WHERE deck_id = ?', [
        snapshot.deckId,
      ]);

      for (const card of snapshot.deck.cards) {
        await this.db.execute(
          `
            INSERT INTO deck_cards (
              id,
              deck_id,
              section,
              card_uuid,
              edition_uuid,
              quantity,
              sort_order,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            this.createId('deck_card'),
            snapshot.deckId,
            card.section,
            card.cardUuid,
            card.editionUuid ?? null,
            card.quantity,
            card.sortOrder ?? null,
            now,
            now,
          ],
        );
      }

      return this.requireDeck(snapshot.deckId);
    });
  }

  private async requireDeck(deckId: string) {
    const deck = await this.getDeck(deckId);

    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    return deck;
  }

  private async hydrateDeck(row: DeckRow): Promise<Deck> {
    return {
      archivedAt: row.archived_at,
      cards: await this.loadDeckCards(row.id),
      championIdentityCardUuid: row.champion_identity_card_uuid,
      createdAt: row.created_at,
      formatId: row.format_id,
      id: row.id,
      name: row.name,
      notes: row.notes,
      updatedAt: row.updated_at,
    };
  }

  private async loadDeckCards(deckId: string): Promise<DeckCard[]> {
    const rows = await this.db.getAll<DeckCardRow>(
      `
        SELECT
          dc.id,
          dc.card_uuid,
          dc.edition_uuid,
          dc.section,
          dc.quantity,
          dc.sort_order,
          dc.created_at,
          dc.updated_at,
          c.name AS card_name,
          c.cost_type AS card_cost_type,
          c.cost_value AS card_cost_value,
          c.level AS card_level,
          c.power AS card_power,
          c.life AS card_life,
          c.durability AS card_durability,
          c.speed AS card_speed,
          c.effect_raw AS card_effect_raw,
          c.flavor AS card_flavor,
          e.set_prefix AS edition_set_prefix,
          e.collector_number AS edition_collector_number,
          e.image_path AS edition_image_path
        FROM deck_cards dc
        INNER JOIN cards c ON c.uuid = dc.card_uuid
        LEFT JOIN editions e ON e.uuid = dc.edition_uuid
        WHERE dc.deck_id = ?
        ORDER BY
          CASE dc.section
            WHEN 'material' THEN 0
            WHEN 'main' THEN 1
            ELSE 2
          END,
          IFNULL(dc.sort_order, 999999),
          c.name COLLATE NOCASE
      `,
      [deckId],
    );

    const relationMaps = await this.loadCardRelationMaps(
      rows.map((row) => row.card_uuid),
    );

    return rows.map((row) => ({
      cardUuid: row.card_uuid,
      classes: relationMaps.classes.get(row.card_uuid) ?? [],
      costType: row.card_cost_type,
      costValue: row.card_cost_value,
      createdAt: row.created_at,
      durability: row.card_durability,
      editionCollectorNumber: row.edition_collector_number,
      editionImagePath: row.edition_image_path,
      editionSetPrefix: row.edition_set_prefix,
      editionUuid: row.edition_uuid,
      effectRaw: row.card_effect_raw,
      elements: relationMaps.elements.get(row.card_uuid) ?? [],
      flavor: row.card_flavor,
      id: row.id,
      level: parseNullableNumber(row.card_level),
      life: row.card_life,
      name: row.card_name,
      power: row.card_power,
      quantity: row.quantity,
      section: row.section,
      speed: row.card_speed,
      sortOrder: row.sort_order,
      subtypes: relationMaps.subtypes.get(row.card_uuid) ?? [],
      types: (relationMaps.types.get(row.card_uuid) ?? []) as CardType[],
      updatedAt: row.updated_at,
    }));
  }

  private async loadCardRelationMaps(cardUuids: string[]) {
    return {
      classes: await this.loadCardRelation('card_classes', 'class', cardUuids),
      elements: await this.loadCardRelation(
        'card_elements',
        'element',
        cardUuids,
      ),
      subtypes: await this.loadCardRelation(
        'card_subtypes',
        'subtype',
        cardUuids,
      ),
      types: await this.loadCardRelation('card_types', 'type', cardUuids),
    };
  }

  private async loadCardRelation(
    tableName:
      'card_types' | 'card_subtypes' | 'card_classes' | 'card_elements',
    columnName: 'type' | 'subtype' | 'class' | 'element',
    cardUuids: string[],
  ) {
    const map = new Map<string, string[]>();

    if (cardUuids.length === 0) {
      return map;
    }

    const placeholders = cardUuids.map(() => '?').join(', ');
    const rows = await this.db.getAll<{ card_uuid: string; type: string }>(
      `
        SELECT card_uuid, ${columnName} AS type
        FROM ${tableName}
        WHERE card_uuid IN (${placeholders})
        ORDER BY type ASC
      `,
      cardUuids,
    );

    for (const row of rows) {
      const values = map.get(row.card_uuid) ?? [];
      values.push(row.type);
      map.set(row.card_uuid, values);
    }

    return map;
  }

  private async findExistingDeckCard(input: {
    deckId: string;
    section: DeckSection;
    cardUuid: string;
    editionUuid?: string | null;
  }) {
    return this.db.getFirst<{
      id: string;
      sort_order: number | null;
    }>(
      `
        SELECT id, sort_order
        FROM deck_cards
        WHERE deck_id = ?
          AND section = ?
          AND card_uuid = ?
          AND IFNULL(edition_uuid, '') = IFNULL(?, '')
      `,
      [input.deckId, input.section, input.cardUuid, input.editionUuid ?? null],
    );
  }

  private async touchDeck(
    deckId: string,
    updatedAt = new Date().toISOString(),
  ) {
    await this.db.execute('UPDATE decks SET updated_at = ? WHERE id = ?', [
      updatedAt,
      deckId,
    ]);
  }
}

export function createDeckService(db: AppDatabase) {
  return new SqliteDeckService(db);
}

function mapSnapshotRow(row: SnapshotRow): DeckSnapshot {
  return {
    createdAt: row.created_at,
    deck: JSON.parse(row.raw_json) as Deck,
    deckId: row.deck_id,
    exportText: row.export_text,
    id: row.id,
    label: row.label,
  };
}

function createLocalId(prefix: string) {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${random}`;
}

function parseNullableNumber(value: string | null) {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}
