export type OcrTextLine = {
  text: string;
  frame?: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
};

export type StillImageOcrResult = {
  blockCount: number;
  lines: OcrTextLine[];
  platform: string;
  processedAt: string;
  rawText: string;
  source: 'ml-kit-text-recognition';
  uri: string;
};

export type NativeOcrService = {
  recognizeStillImage(uri: string): Promise<StillImageOcrResult>;
};

type MlKitTextRecognitionResult = {
  text: string;
  blocks: {
    text: string;
    lines: {
      text: string;
      frame?: {
        bottom: number;
        left: number;
        right: number;
        top: number;
      };
    }[];
  }[];
};

export function createNativeOcrService(): NativeOcrService {
  return {
    async recognizeStillImage(uri) {
      const { recognizeText } =
        await import('@infinitered/react-native-mlkit-text-recognition');
      const result = (await recognizeText(uri)) as MlKitTextRecognitionResult;

      return mapMlKitTextRecognitionResult(
        uri,
        result,
        new Date().toISOString(),
        'native',
      );
    },
  };
}

export function mapMlKitTextRecognitionResult(
  uri: string,
  result: MlKitTextRecognitionResult,
  processedAt = new Date().toISOString(),
  platform = 'unknown',
): StillImageOcrResult {
  return {
    blockCount: result.blocks.length,
    lines: result.blocks.flatMap((block) =>
      block.lines.map((line) => ({
        frame: line.frame
          ? {
              height: line.frame.bottom - line.frame.top,
              left: line.frame.left,
              top: line.frame.top,
              width: line.frame.right - line.frame.left,
            }
          : undefined,
        text: line.text,
      })),
    ),
    platform,
    processedAt,
    rawText: result.text.trim(),
    source: 'ml-kit-text-recognition',
    uri,
  };
}
