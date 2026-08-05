# Development Setup

The mobile app lives in `apps/mobile` and uses Expo SDK 57, React Native 0.86, TypeScript, and npm workspaces.

Install Node.js 22.13 or newer. This machine has Node.js LTS installed through `winget`, with npm available on PATH.

Useful commands from the repository root:

```text
npm run mobile:start
npm run mobile:android
npm run mobile:ios
npm run mobile:config
npm run typecheck
npm run lint
npm run test
npm run eas:build:development
npm run eas:build:preview
npm run eas:build:production
```

The app is local-first. Account sync and collection mode are feature-flagged off until the Part 1 decklist workflow is stable.

Phase 02 uses Expo Continuous Native Generation through config plugins. Do not commit generated `android` or `ios` directories unless the project intentionally changes native-directory policy.

The scanner MVP requires an Expo development build because it uses native camera and OCR dependencies:

```text
npm run mobile:android
npm run mobile:ios
```

Expo Go is still useful for simple UI checks, but it is not the target runtime for scanner work.

Phase 03 scanner behavior now lives behind app-owned services:

- `NativeOcrService` wraps native OCR.
- `ScannerService` converts OCR output into offline card candidates.
- `ScannerSession` enforces confidence thresholds, confirmation, stable reads, duplicate prevention, and debug logs.
- `ScannerDeckWorkflow` adds cards to the selected deck section and restores the previous deck state on undo.

Phase 04 completes the local deck-builder workflow:

- Decks can be created, renamed, duplicated, archived, and selected from the home screen.
- Cards can be searched from the offline catalog, added by section and quantity, edited, moved, removed, sorted, and inspected.
- Standard Constructed validation, section counts, sideboard points, and issue jump targets update from local deck state.
- Tournament snapshots can be saved, compared against the active deck, restored, and copied for export.
- Scanner and export routes accept deck context from the deck builder.
