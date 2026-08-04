# Native Modules

Native scanner code should stay behind small TypeScript service boundaries. Add a local Expo module here only when the scanner proof of concept needs Swift or Kotlin.

## Phase 02 Scanner Proof Of Concept

The current Phase 02 path uses Expo development builds with config plugins instead of committed `android` or `ios` directories.

Native scanner dependencies are isolated behind TypeScript services:

- `expo-camera` provides the camera preview and still capture surface.
- `@infinitered/react-native-mlkit-text-recognition` processes captured still images.
- `expo-image` is installed for the ML Kit Expo module peer dependency.
- `src/features/scanner/NativeOcrService.ts` hides the native OCR package.
- `src/features/scanner/ScannerService.ts` sends OCR text into the offline card resolver.

This proof of concept intentionally does not mutate deck data. Scanner UI should produce candidates first; deck mutation belongs to the deck-builder workflow.
