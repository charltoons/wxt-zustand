# WXT-Zustand Examples

This folder will contain runnable WXT example extensions that demonstrate how to use `wxt-zustand` in different contexts (popup, content script, options page, multi-tab sync, etc.).

## How to Run Examples

- Build the library at the repo root first so examples can import from `dist/`:
  - `bun run build:all`
- Then, navigate to an example and run its dev server (once the example is added):
  - With a local WXT install in the example: `bun run dev`
  - Without scripts: `bun x wxt dev`
- To build an example for production:
  - With scripts: `bun run build`
  - Without scripts: `bun x wxt build`

Notes:
- WXT CLI reference: `wxt dev`, `wxt build`, `wxt zip` (see https://wxt.dev/api/cli/wxt).
- Each example is an isolated project with its own `package.json`, `tsconfig.json`, and WXT config.

## Importing the Library from Examples

Examples import the built package directly from the repo's root `dist/` folder to avoid publishing during development.

- ESM import (TypeScript/JavaScript):
  - In projects where Vite/WXT restricts resolving files outside the example root, an alias is configured in each example's `wxt.config.ts` to point `@wxt-zustand` at `../../dist/index.js`.
  - Use: `import * as wxtZustand from '@wxt-zustand'`
  - Types are resolved via a `tsconfig.json` path mapping to `../../dist/index.d.ts`.

TypeScript will pick up types from `../../dist/index.d.ts` automatically when importing the JS entry from the same folder.

## Workflow Tips

- Rebuild the library after making changes in `src/` so examples see updates: `bun run build:all`.
- Examples will be added in subsequent steps (e.g., `counter-popup`, `content-multitab`, `options-sync`).
- Root helper scripts to streamline running examples will be added later (see PLAN step 7.6).

## Requirements

- Bun installed (`bun`), and WXT available via `bun x wxt` or as a devDependency in each example project.
- Modern browsers supported by WXT. Use `wxt dev` to run and test locally.
