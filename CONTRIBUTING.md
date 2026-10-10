# Contributing to WiKeep

Thanks for wanting to help — WiKeep is a solo-built macOS app that would genuinely benefit from collaborators. This guide covers how to set up, the conventions to follow, and how to get a change merged.

By participating you agree to keep discussions respectful and constructive.

---

## Ways to contribute

- **Bug reports** — include macOS version, chip (Apple Silicon/Intel), and the relevant Recovery Log lines.
- **Fixes & features** — see the roadmap in the [README](README.md); good first areas are `CoreWLAN` migration, automated tests, new chart types, and localization.
- **Docs & screenshots** — replace the placeholders in [`docs/screenshots/`](docs/screenshots/README.md).
- **Triage** — reproducing and confirming issues is valuable on its own.

> Please **open an issue first** for anything larger than a small fix so we can agree on the approach before you spend time.

---

## Development setup

### Prerequisites
- macOS 12+
- Node.js 18+
- Rust stable + Xcode Command Line Tools
- [Tauri v1 prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Run it

```bash
git clone git@github.com:FehintoluSamuel/NetKeeper.git
cd WiKeep
npm install
npm run tauri dev
```

---

## Before you open a PR

Run all three checks and make sure they pass:

```bash
npx tsc --noEmit                 # TypeScript type-check (strict)
cd src-tauri && cargo check      # Rust compile check
npm run build                    # Full frontend production build
```

> `tsconfig.json` sets `noUnusedLocals` and `noUnusedParameters` to `true` — remove unused variables/imports or the build will fail.

If you changed real Wi-Fi/repair behavior, **also verify on macOS hardware** and describe what you observed (CI cannot test the radio).

---

## Coding conventions

### General
- Match the surrounding code style; keep diffs focused and minimal.
- **No comments** unless they explain non-obvious *why*.
- Don't add dependencies casually — this project deliberately keeps its charting dependency-free. Discuss new deps in an issue first.

### Rust (`src-tauri/src/main.rs`)
- Any command that shells out or does file/network IO **must** be `#[tauri::command(async)]` so it runs off the macOS main thread. Only AppKit work (e.g. `set_dock_visible`) stays synchronous.
- Commands return `Result<T, String>`; put user-visible failures in the `Err` message.
- Register new commands in the `generate_handler![]` macro.
- Never assume the interface is `en0` — use the `detect_wifi_interface()` helper.
- Never store or log Wi-Fi passwords or admin credentials.

### TypeScript / React (`src/App.tsx`)
- Keep state in `useState`, but use `useRef` for values read inside intervals to avoid stale closures (`settingsRef`, `qualityRef`, `doScanRef`, …).
- Route all scans through `doScan(force?)`; do not call `invoke("scan_wifi")` directly from loops. Background loops must read `lastScanDataRef`.
- If you add a new guided-tour step, add the matching `data-tour="…"` attribute to the target and push a step to `TOUR_STEPS`.
- Charts stay hand-rolled SVG (`AreaChart`, `BarChart`, `DonutChart`) — no chart libraries.
- `src/Help.tsx`, `src/main.js` and `src/style.css` are **legacy and unused** — don't build on them.

---

## Commit & PR guidelines

- Write small, focused commits with a clear message, e.g. `fix: offload scan_wifi to async to stop UI freezes`.
- One logical change per PR where possible.
- In the PR description, include:
  - **What** changed and **why**
  - **How** you tested it (commands run, hardware tested)
  - Relevant **screenshots** for UI changes
- Link the issue it closes (`Closes #123`).
- Don't commit secrets, build output (`dist/`, `target/`), or `.DS_Store` — they're git-ignored.

---

## Reporting bugs

Include:
1. macOS version and chip.
2. WiKeep version (shown in the title/window).
3. Steps to reproduce.
4. Expected vs actual behavior.
5. Recovery Log excerpts (`~/.config/wikeep/logs.jsonl`).
6. Screenshots/video if the UI is involved.

---

## License

No `LICENSE` file exists yet, so contribution terms are not formally defined. If you'd like to contribute under a specific license (MIT is the suggested default), please raise it in an issue first so it can be added.

Thanks for helping make WiKeep better.
