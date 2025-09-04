# Repository Guidelines

## Project Structure & Module Organization
- `src/`: TypeScript sources organized by domain.
  - `background/`: backend service init and broadcast logic.
  - `frontend/`: connection, readiness, and state sync.
  - `storage/`, `messaging/`, `utils/`; top-level `types.ts`.
  - Aggregated exports via `src/index.ts` and per-folder `index.ts`.
- Tests: colocated `*.test.ts` next to modules; repo helpers in `tests/` (`tests/setup.ts` is preloaded by `bunfig.toml`).
- `dist/`: build output (ESM `index.js`, CJS `index.cjs`, `*.d.ts`).

## Build, Test, and Development Commands
- `bun run build`: bundle ESM to `dist/index.js`.
- `bun run build:types`: emit declaration files to `dist/`.
- `bun run build:all`: build + types (used by `prepublishOnly`).
- `bun run test`: run Bun tests with setup (env sets `CLAUDECODE=1`).
- `bun run test:watch`: run tests in watch mode.
- `bun run typecheck`: strict TypeScript checks via `tsc`.
- `bun run dev`: watch-run `src/index.ts` during development.

## Coding Style & Naming Conventions
- TypeScript strict mode; prefer explicit types and narrow unions.
- 2-space indentation; single quotes; ES modules.
- Filenames `camelCase.ts`; tests use `*.test.ts`.
- Types/interfaces `PascalCase`; functions/variables `camelCase`.
- Re-export at folder roots via `index.ts`; keep modules small and domain-focused.

## Testing Guidelines
- Framework: `bun:test` (`describe/test/expect`).
- Name tests `*.test.ts` and colocate with code.
- `tests/setup.ts` provides browser/chrome polyfills and resets WXT fakes; do not rely on real extension APIs in unit tests.
- Keep tests deterministic and fast; use local helpers.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat(frontend): add sync retry`).
- PRs include clear summary, rationale, linked issues, and tests for behavior changes.
- Ensure `bun run build:all`, `bun run typecheck`, and `bun run test` pass before requesting review.

## Security & Configuration Tips
- Avoid importing `wxt/testing` in production paths.
- Prefer `@webext-core/proxy-service` for messaging; avoid direct `chrome.*` calls in shared code.
- Keep configuration minimal and explicit; document edge cases in code comments.

