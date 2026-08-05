# Native Modules

Native scanner code should stay behind small TypeScript service boundaries. Add a local Expo module here only if the scanner needs Swift or Kotlin beyond the current Expo module stack.

## Phase 03 Scanner MVP

The current scanner path uses Expo development builds with config plugins instead of committed `android` or `ios` directories.

Native scanner dependencies are isolated behind TypeScript services:

- `expo-camera` provides the camera preview and still capture surface.
- `@infinitered/react-native-mlkit-text-recognition` processes captured still images.
- `expo-image` is installed for the ML Kit Expo module peer dependency.
- `src/features/scanner/NativeOcrService.ts` hides the native OCR package.
- `src/features/scanner/ScannerService.ts` converts OCR output into resolver candidates.
- `src/features/scanner/ScannerSession.ts` handles confidence gates, confirmation states, stable reads, duplicate prevention, and debug events.
- `src/features/scanner/ScannerDeckWorkflow.ts` performs scanner/manual adds and one-tap undo through the deck service.

Collection scanning remains deferred. Scanner events store text and candidate metadata only; raw camera images are not retained by default.
