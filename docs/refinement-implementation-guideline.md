# Refinement Implementation Guideline

Last updated: 2026-08-05

This document is the source of truth for the next refinement pass after the barebones decklist MVP. The app is currently being tested through the Expo development build / Metro flow, not Expo Go, because scanner work depends on native camera and OCR modules.

## Current Baseline

- Runtime: Expo SDK 57, React Native 0.86, TypeScript, npm workspaces.
- Development commands remain rooted at the repo:
  - `npm run mobile:start`
  - `npm run mobile:android`
  - `npm run mobile:ios`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
- Core screen entry points:
  - `apps/mobile/app/index.tsx` currently renders `DeckBuilderHomeScreen`.
  - `apps/mobile/app/scanner.tsx` renders `ScannerMvpScreen`.
  - `apps/mobile/app/export.tsx` renders the export workflow.
  - `apps/mobile/app/_layout.tsx` owns the Expo Router stack titles.
- Deck builder source:
  - `apps/mobile/src/features/deck-builder/screens/DeckBuilderHomeScreen.tsx`
  - This one screen currently owns deck list, active deck selection, deck editing, manual catalog search, validation, snapshots, scanner routing, and export routing.
- Scanner source:
  - `apps/mobile/src/features/scanner/screens/ScannerMvpScreen.tsx`
  - `apps/mobile/src/features/scanner/ScannerService.ts`
  - `apps/mobile/src/features/scanner/ScannerSession.ts`
  - `apps/mobile/src/features/scanner/OcrTextExtraction.ts`
  - `apps/mobile/src/domain/card-resolution/CardResolver.ts`
- Catalog matching source:
  - `apps/mobile/src/data/catalog/GrandArchiveApiClient.ts`
  - `apps/mobile/src/data/catalog/CatalogService.ts`
  - `apps/mobile/src/data/catalog/CatalogRepository.ts`
  - `apps/mobile/src/data/catalog/normalization.ts`

## Product Priorities

The next pass should prioritize functional correctness and scanning ergonomics before a major visual redesign.

1. UI/UX can improve, but broad visual polish is deferred until core flows are reliable.
2. Deck list and deck editor must become separate pages.
3. Deck section selection must default to Material, not Main.
4. OCR output does not need to be fully corrected yet, and rarity does not need to be tracked. The requirement is that scanned text can produce searchable card candidates, and that these candidates can be used to send queries and receive responses with data from the Grand Archive index API component.
5. Scanner capture should feel automatic. Manual snap-to-recognize is unintuitive, and the current batch loop delay feels cumbersome.

## Phase 1: Navigation And Screen Separation

Goal: Split deck selection from deck editing without changing deck data behavior.

### Scope

- Create a deck list page as the app's first deck workspace surface.
- Create a dedicated deck editor route.
- Preserve scanner and export deep links with deck context.
- Add predictable back navigation between list, editor, scanner, export, and settings.

### Proposed Route Shape

- `/` or `/decks`: deck list page.
- `/decks/[deckId]`: deck editor page for a single deck.
- `/scanner?deckId=<id>&section=<section>`: scanner for a selected deck and target section.
- `/export?deckId=<id>`: export workflow for a selected deck.
- `/settings`: settings and diagnostics.

Expo Router can support this by adding files under `apps/mobile/app/decks/` and updating `apps/mobile/app/_layout.tsx`.

### Implementation Notes

- Extract `DeckListPanel` into a real screen component, for example:
  - `apps/mobile/src/features/deck-builder/screens/DeckListScreen.tsx`
- Extract editor-only logic from `DeckBuilderHomeScreen` into:
  - `apps/mobile/src/features/deck-builder/screens/DeckEditorScreen.tsx`
- Keep shared presentational pieces near the feature until the UI stabilizes:
  - section tabs
  - card rows
  - search add panel
  - validation panel
  - snapshot panel
  - card detail sheet
- Use route params as the source of active deck identity on editor, scanner, and export pages.
- On deck creation, navigate directly to the new deck editor.
- On deck archive from the list page, stay on the list page.
- On deck archive from editor, navigate back to the list page.
- For missing, archived, or unknown `deckId`, show a recoverable empty state with an action back to deck list.
- Use stack back behavior for scanner and export when launched from editor. Add explicit header back affordances only if native stack back is insufficient in the development build.

### Acceptance Criteria

- Opening the app shows saved decks and a create-deck action, not the editor.
- Selecting a deck opens a separate editor page.
- Back from editor returns to deck list.
- Scan from editor opens scanner with the current deck ID and active section.
- Back from scanner returns to the editor.
- Export from editor opens export with the current deck ID.
- Back from export returns to the editor.
- Unknown deck IDs do not crash.

### Test Targets

- Component or integration tests for deck selection route param behavior where practical.
- Manual Metro/dev-build smoke test:
  - create deck
  - open deck
  - back to list
  - scanner round-trip
  - export round-trip

## Phase 2: Section Defaults And Deck Editing Flow

Goal: Make Material the default target wherever the user is choosing what part of the deck to fill.

### Scope

- Change default active section from `main` to `material` in deck editor.
- Change scanner target section default from `main` to `material` when no valid route param is provided.
- Preserve explicit section context when navigating from editor to scanner.

### Current Source Anchors

- `DeckBuilderHomeScreen` currently initializes `activeSection` as `'main'`.
- `ScannerMvpScreen` currently initializes `targetSection` as `requestedSection ?? 'main'`.
- `deckSections` in scanner already orders Material first.
- `deckSectionMetadata` should be checked before changing any shared section ordering assumptions.

### Implementation Notes

- Define a shared constant if the default is used in more than one place:
  - `DEFAULT_DECK_SECTION: DeckSection = 'material'`
- Prefer placing it in an existing domain or deck-builder model module if that avoids cross-feature imports.
- Update tests that assumed `main` as the initial target.
- Ensure manual add buttons still allow adding to all three sections.
- When coming from deck editor to scanner, the scanner should honor the editor's active section instead of forcing Material.

### Acceptance Criteria

- Fresh editor sessions open with Material selected.
- Fresh scanner sessions open with Material selected.
- Scanner launched from Main opens with Main selected.
- Scanner launched from Sideboard opens with Sideboard selected.
- Manual search add behavior remains section-aware.

### Test Targets

- Unit test for route param parsing and default section selection.
- Existing scanner workflow tests should pass after expectation updates.

## Phase 3: OCR-To-Grand-Archive Searchability

Goal: Keep the OCR engine as-is, but make its imperfect text usable for searchable candidates that can query the Grand Archive index API component and return card data.

### Problem Statement

The attached Guo Jia scan shows OCR text reaching the app, but the resolver reports `no_match | 0 candidates`. The visible OCR begins with `Lv.3o ja, Heaven's Favored` and later contains useful fragments such as `Guo Jia Lineage`. The current resolver primarily attempts:

- exact footer match from parsed set prefix and collector number
- exact normalized `nameText`
- fuzzy matching against normalized `nameText`

If `nameText` is polluted by level text or a misread first name, the resolver can fail even though the raw OCR contains enough searchable information. Once candidates exist, they must be usable as query inputs for the Grand Archive index API component so the app can receive structured card data instead of stopping at OCR logs. Rarity should be ignored for now.

### Scope

- Improve candidate generation, not OCR recognition.
- Feed multiple plausible search strings into the resolver.
- Route generated candidates through the existing Grand Archive API-facing catalog component where live/index-backed data is required.
- Strip obvious non-name prefixes like level and cost labels from candidate name strings.
- Use raw OCR lines as fallback search material.
- Do not add rarity to the deck model or matching contract yet.

### Implementation Notes

Add a resolver preprocessing step before fuzzy matching:

- Candidate text sources:
  - extracted `nameText`
  - first readable OCR lines
  - raw OCR lines containing title-like commas or apostrophes
  - raw OCR lines near known card-name fragments
- Cleanup rules:
  - remove leading `Lv.`, `LV`, `Level`, and OCR-prone variants like `Lv.3o`
  - remove leading numeric/card stat noise
  - remove rules text labels such as `COST`, `Tamer`, `Champion`, `On Enter`
  - preserve punctuation enough for names like `Guo Jia, Heaven's Favored`
  - normalize through existing `normalizeSearchText`
- Matching strategy:
  - try exact normalized card name for each candidate string
  - try local catalog search for each candidate string
  - use the same candidate strings to query the Grand Archive index API component, starting with autocomplete/name search behavior exposed through `GrandArchiveApiClient`
  - hydrate API responses through the existing Grand Archive card mapping path before presenting or adding cards
  - score fuzzy matches against actual normalized card names
  - merge local and API-backed results by stable card UUID
  - boost candidates where multiple OCR fragments point to the same card
  - keep offline/local results available when the API request fails or the device is offline
  - keep confirmation required unless footer resolves exactly
- Logging:
  - add debug reasons such as `ocr_name_candidate`, `raw_line_candidate`, `fragment_candidate`, and `search_fallback`
  - add API-related debug reasons such as `grand_archive_query`, `grand_archive_result`, and `grand_archive_unavailable`
  - include the normalized query strings in scanner debug output only if it does not make the UI too noisy

### Guo Jia Scenario

Add a fixture card for `Guo Jia, Heaven's Favored` in `catalogFixtures.ts` or test-local fixtures. Use OCR input based on the screenshot:

```text
Lv.3o ja, Heaven's Favored
THERING
COST
Champion
Tamer Human
Guo Jia Lineage
On Enter: You may put three quest counters on Guo Jia If you don't, recover 3.
25
```

Expected behavior:

- The scanner resolver returns at least one candidate for `Guo Jia, Heaven's Favored`.
- The generated candidate query can be sent to the Grand Archive index API component.
- The API-backed path can receive and normalize returned Grand Archive card data for the candidate.
- Exact footer is not required.
- Rarity is ignored.
- The candidate may require confirmation.
- The debug log should no longer be `no_local_candidate` for this input.

### Acceptance Criteria

- OCR text with imperfect first-line recognition can still produce local candidates when enough title or name fragments exist.
- OCR-derived candidates can be used to query the Grand Archive index API component and receive structured card data.
- API-backed results are merged with local results without duplicating the same card.
- Manual search still works with normal typed queries.
- Exact footer matching remains the highest-confidence path.
- Resolver returns no more than the existing small candidate list limit unless intentionally changed.
- API failures degrade gracefully to local/offline matching.
- No deck writes happen on low-confidence ambiguous matches without confirmation.

### Test Targets

- `OcrTextExtraction.test.ts` for polluted first-line cleanup.
- `CardResolver.test.ts` for Guo Jia fuzzy/search fallback.
- `GrandArchiveApiClient` or `CatalogService` tests with a fake fetch/client proving candidate queries return mappable Grand Archive card data.
- `ScannerSession.test.ts` to ensure ambiguous candidates require confirmation and are not auto-added.

## Phase 4: Automatic Scanner Capture

Goal: Replace button-first scanning with an automatic capture loop that feels fast but controlled.

### Scope

- Scanner should begin observing automatically when the camera is ready, permission is granted, and an active deck exists.
- Manual scan button can remain as a secondary fallback/debug action.
- Batch mode should become a fast continuous scanning mode rather than a slow button-like loop.
- Prevent duplicate adds while the same physical card remains in frame.

### Current Source Anchors

- `ScannerMvpScreen.captureAndRecognize` takes a still photo, runs OCR, resolves candidates, then records a session decision.
- The current batch loop waits `900ms` before each capture attempt.
- `ScannerSession` already has stable detection and duplicate prevention:
  - `requiredStableDetections`
  - `duplicateCooldownMs`
  - `awaitingClear`

### Implementation Notes

Introduce an auto-capture controller in the scanner screen or a small hook:

- Suggested hook name:
  - `useScannerCaptureLoop`
- Inputs:
  - `activeDeck`
  - `cameraReady`
  - `cameraRef`
  - `deckWriteState`
  - selected section
  - quantity
  - scanning mode
- Outputs:
  - active/paused status
  - last capture time
  - start/stop controls
  - optional manual trigger

Suggested timing:

- idle auto-capture interval: 350-500ms after camera ready
- after `no_card_seen`: 350-500ms
- after `too_blurry` or `too_dark`: 500-700ms
- after `needs_confirmation`: pause until user confirms, skips, clears, or resumes
- after auto-add: pause until card presence clears, then resume
- after deck write: resume only after query invalidation finishes

Avoid a fixed long batch delay. The loop should schedule the next capture based on the last decision status.

### UX Behavior

- Replace primary `Scan Card` prominence with an automatic scanner state:
  - `Looking`
  - `Reading`
  - `Hold Steady`
  - `Matched`
  - `Needs Confirmation`
  - `Move Card Away`
- Keep `Start/Stop` or `Pause/Resume` as the main explicit control.
- Keep `Scan Now` as a smaller fallback.
- Provide an obvious undo action after auto-add.
- Recent adds should update immediately after auto-add.

### Duplicate Prevention

- Continue using `ScannerSession.recordAdd`.
- Treat a card as cleared only after empty/no-card OCR or a sufficiently different candidate is observed.
- If the same candidate stays in frame after add, show `Move Card Away` or equivalent status rather than adding repeatedly.
- Do not lower confidence thresholds simply to make automatic scanning feel faster.

### Acceptance Criteria

- User can point the camera at cards and get scanner decisions without pressing a capture button each time.
- Batch scanning has noticeably shorter idle delay than the current 900ms loop.
- Same-card duplicate prevention still works.
- Low-confidence and multi-candidate scans pause for confirmation.
- User can pause/resume scanning.
- Undo last add still restores the previous deck quantity.

### Test Targets

- Unit tests for capture-loop scheduling if implemented as a pure helper.
- `ScannerSession.test.ts` for repeated candidate, card clear, and duplicate cooldown behavior.
- Manual dev-build smoke test using Metro:
  - automatic scan starts
  - match requires confirmation when ambiguous
  - auto-add happens only after stable high-confidence read
  - same card is not repeatedly added
  - next card can be scanned after removing/replacing the previous card

## Phase 5: Stabilization, Diagnostics, And Deferred UX Polish

Goal: Make the new flow dependable before investing in a larger UI redesign.

### Scope

- Consolidate scanner debug information so OCR/matching failures are diagnosable.
- Add targeted test coverage around routing, defaults, resolver candidates, and auto-capture state.
- Keep UI polish deliberately narrow.
- Update docs as the implementation lands.

### Implementation Notes

- Keep the debug panel available in development builds.
- Consider hiding or collapsing raw OCR text behind a diagnostics toggle later.
- Record enough metadata in scanner logs to diagnose:
  - raw OCR text
  - extracted `nameText`
  - candidate query strings
  - Grand Archive API query status
  - Grand Archive API result count
  - candidate count
  - decision status
  - decision reasons
  - target section
- Add route-level empty states for:
  - no decks
  - deck not found
  - catalog not synced
  - camera permission denied
- Do only practical UI cleanup required by the functional changes:
  - clear page titles
  - stable back behavior
  - clear scanner state labels
  - less prominent manual capture
  - no full visual redesign yet

### Acceptance Criteria

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test` passes.
- Development build scanner flow works through Metro.
- Documentation matches the implemented route names and scanner behavior.
- Remaining visual/UX redesign items are tracked separately and are not mixed into scanner correctness work.

## Non-Goals For This Refinement Pass

- Do not redesign the full visual language yet.
- Do not add rarity tracking to decks or scanner results.
- Do not replace the OCR engine.
- Do not require the Grand Archive API for every scanner success when a local offline match is already sufficient.
- Do not add cloud sync or account workflows.
- Do not change export formats except as needed to preserve route context.
- Do not commit generated `android` or `ios` directories unless native-directory policy changes.

## Suggested Work Order

1. Land route split and deck ID ownership first.
2. Change section defaults to Material and update scanner/editor route handoff.
3. Improve OCR-to-Grand-Archive candidate generation with Guo Jia regression coverage.
4. Add automatic capture scheduling and scanner pause/resume states.
5. Run full verification and update development docs to reflect the new flow.
