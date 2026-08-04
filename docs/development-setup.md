# Development Setup

The mobile app lives in `apps/mobile` and uses Expo SDK 57, React Native 0.86, TypeScript, and npm workspaces.

Install Node.js 22.13 or newer. This machine has Node.js LTS installed through `winget`, with npm available on PATH.

Useful commands from the repository root:

```text
npm run mobile:start
npm run mobile:android
npm run mobile:ios
npm run typecheck
npm run lint
npm run test
npm run eas:build:development
npm run eas:build:preview
npm run eas:build:production
```

The app is local-first. Account sync and collection mode are feature-flagged off until the Part 1 decklist workflow is stable.
