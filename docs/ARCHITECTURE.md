# ZPS Studio architecture

A session opens original bytes, projects format-specific records, applies validated source edits, and exports a copy. Addon configuration and external buff metadata have separate ownership.

Two independent architecture candidates considered Electron with a pure JavaScript codec and Python/PySide with a native Qt interface. Electron is selected for consistent browser verification, one language across the codec and UI, and an established NSIS updater. PySide reduces browser overhead but requires a separate native UI test path and updater integration. Both candidates agreed on byte-span edits and opaque-file protection. Cross-family judgment was skipped to honor the user's single-model cap.

- `app/core/documents.mjs` owns format detection, safe Lua literal parsing, encoding, record projection, and lossless edits. It never executes imported Lua.
- `app/services/catalog.cjs` owns edition-aware JX3BOX requests, cached payloads and offline status.
- `app/desktop/main.cjs` owns session bytes, undo, native dialogs, atomic exports, diagnostics, update state and bounded IPC.
- `app/desktop/preload.cjs` exposes explicit operations with renderer Node access disabled.
- `app/ui/` owns the library, record table, inspector and user decisions.

The acceptance checks are actual sample byte-identical no-op export, localized edits that reparse, rejection of executable Lua and unsupported encoding, unchanged baseline hashes, metadata isolation by edition/level, and browser interaction with real samples. Windows packaging and installer upgrade need Windows CI and an actual Windows run. A successful Linux browser test is not evidence of Windows or in-game execution.
