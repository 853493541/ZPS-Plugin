# ZPS Studio work status

## Goal
Build a polished Windows application to inspect, create, and edit user exports for MY and JX. Map samples to addon features. Enrich buffs from JX3BOX with version-aware cached details. Include application updates and local bug reports. Do not publish releases or deploy without authorization.

## Execution limits
Coordinator GPT-6.1 Sol high, workers GPT-6.1 Sol medium. Context budgets 300k/150k. Runtime tools cannot change the coordinator model or hard context windows. Workers use explicit model/reasoning settings and fresh scoped briefs. Honor these limits in future sessions.

## Completed implementation
- [x] Read poteto-mode Principles; research actual bytes and relevant consumers.
- [x] Compare desktop architectures. Electron selected; rationale in ARCHITECTURE.md.
- [x] Map JX buff/classes, MY team rules, target monitoring, chat keywords in DATA_FORMATS.md.
- [x] Lossless GBK Lua-table codec, numeric level maps including zero, class/buff creation, class renames, MY rule and keyword editing, undo.
- [x] Opaque binary target-monitor files are explicit read-only documents.
- [x] Desktop-owned session/files, protected originals, backup and atomic export copy, narrow isolated preload.
- [x] Chinese UI with searchable record table, categories, configuration inspector, raw data, JX3BOX lookup, new/add dialogs, update status, local report export.
- [x] Edition/level-aware JX3BOX raw response cache and offline status. Official-source contract in JX3BOX_API.md.
- [x] Windows NSIS packaging and GitHub Actions build workflow passed. Installer and update metadata are retained as CI artifacts. No release publication.
- [x] Hourly continuation task created and corrected to 150k worker context. It cannot directly detect quota resets or guarantee scheduling.

## Verification completed
`npm test` passes 15 codec and 7 catalog tests. Actual sample no-op bytes, localized edits, level zero, GBK rejection, unsafe Lua rejection, class references, raw flags, opaque import, unknown-field preservation, cache isolation and failures are covered.

`PREVIEW_URL=http://127.0.0.1:4174 node tools/smoke-ui.mjs` passed through Chromium on real samples. Verified 275 JX rows/classes, search, scalar editing, undo, visible API failure, MY creation/add, and binary read-only mode without page errors. Screenshot is local at artifacts/editor.png. Browser preview deliberately cannot save native files.

`texlua tools/verify-lua.lua /tmp/zps-edited.jx3dat` loaded an actual edited GBK export and found 177 buffs and 98 classes. This is independent Lua syntax/shape verification, not in-game import proof.

`python tools/snapshot_addons.py` confirms all 512 addon files and 14 sample files match their original hashes.

Independent GPT-6.1 Sol medium review found and prompted fixes for a new-MY filename mismatch, GBK decimal escape ambiguity, full-form nested-field submissions, and a metadata lookup race. Numeric-vs-string duplicate Lua key spellings are conservatively unsupported. Non-ASCII decimal byte escapes are rejected rather than misinterpreted.

## Windows verification

[Windows run 42600425489](https://github.com/853493541/ZPS-Plugin/actions/runs/42600425489) built commit `19f6250`. Its dependency installation, 22 behavior tests, native Electron smoke, NSIS installer build, and artifact upload all passed. The native smoke verifies preload/IPC, actual samples, byte edits, undo clean state, export to disk, MY creation, and diagnostic export. The `windows-desktop` artifact contains the installer, blockmap, and update metadata. No release was published. Installer execution and upgrading an installed version remain separate release gates.

The Linux Electron binary downloaded successfully but headless execution exits with GPU/X-display initialization errors and SIGSEGV. The Windows native test provides the desktop integration evidence instead.

## Installed Windows lifecycle verification

[Windows run 42605018666](https://github.com/853493541/ZPS-Plugin/actions/runs/42605018666) built commit `56efc3a`. All 22 behavior tests, the expanded native smoke, NSIS packaging, and the installed application lifecycle step passed. The test silently installs the actual NSIS package into a Chinese/space-containing path on a disposable Windows runner, launches the packaged executable, exports and reopens edited data, verifies overwrite backups byte-for-byte, restarts the app, and uninstalls it. SHA-256 checks confirm that the user-data probe, JX/MY exports, diagnostic report, and export backup survive uninstall unchanged. No release was published or deployment performed.

Same-model GPT-6.1 Sol medium review prompted the retained-backup and post-uninstall hash checks. The duplicate `savedBytes` property in session initialization was removed without changing behavior. Interactive installer screens and an actual player's game client are not covered by this silent CI test.

## Remaining work / blockers
1. Silent NSIS install, packaged launch/restart, Chinese paths, export backup, and uninstall retention are verified on Windows CI. Interactive installer screens and use on an end-user Windows machine remain manual acceptance checks. Do not repeat these passing CI checks without a relevant code change.
2. Live JX3BOX is blocked by cloud network policy with HTTP 403 CONNECT. No actual remote response has been captured. Obtain approved network access to node.jx3box.com, and icon.jx3box.com if icons are displayed, then verify real payloads and 真传 coverage. std/origin/wujie are edition identifiers, not historical patch versions. Do not claim full game metadata coverage until proven.
3. A live update feed and signing are not configured. Repository is private, so unauthenticated GitHub release updater cannot serve end users. Choose accessible hosting and signing, publish only after explicit authorization, then test installed-version upgrade and retained documents on Windows.
4. Import edited outputs into MY and JX on an actual Windows game client. Encrypted/opaque addon readers prevent proving runtime semantics from current source. Never label exclamation flags or visual IDs with guessed meanings.
5. MY target-monitor binary editing remains unsupported until a documented/exported codec or controlled plugin interchange is available. Original bytes are preserved. This is required for eventual complete editor coverage.

## Resume safely
Read AGENTS.md and this file, inspect git status and in-progress work before starting. Do not overlap an active run. Preserve concurrent edits. The app source lives in app/, immutable references in vendor/ and samples/. Keep decisions in .audit/editor.tsv. Check the remaining release and game/API gates before adding features. Do not tell the user the entire app is complete while the gates above remain open.

## Continuation policy

No active development run was present at the start of this continuation. The remaining substantive gates require approved JX3BOX network access, update hosting/signing decisions, a Windows game client, or a verified binary interchange format. If those inputs and code have not changed, do not repeat successful builds or claim additional work. Keep the hourly task enabled while the overall requested application remains incomplete; report new progress or changed blockers only.

## Session network diagnosis and handoff

On 2026-11-09 the user supplied a screenshot of another session successfully reaching the JX3BOX homepage. The image became readable from the attachment path. The current instance's live proxy status at 19:10:14Z still reported `mode: allowlist`, `allow_all_domains: false`, and no JX3BOX rule. Fresh homepage and buff API requests both failed at proxy CONNECT with 403. This confirms a current-instance policy difference; it does not prove API accessibility or 真传 coverage in the other session.

`tools/probe_jx3box.py` now tests the homepage and exact buff endpoint separately through inherited proxy/CA settings. Syntax validation passed and the real run correctly produced a failing report in `artifacts/jx3box-live.json` on this blocked instance. `docs/SESSION_HANDOFF.md` gives the accessible session a concrete pickup point. No app code, releases, or deployments changed. Do not disable proxy routing or TLS validation to bypass the restriction.
