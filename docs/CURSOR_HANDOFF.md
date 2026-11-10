# Cursor project handoff

The one-click updater requested by the user is finished and published in **0.1.5**. This supersedes the unfinished checkpoint `3e120df` and its old retry/status TODOs. Do not repeat that work. Read the latest WORK_STATUS before starting a new user request.

## Checkout and first reads

Repository: https://github.com/853493541/ZPS-Plugin

Use `main` for the current project. The completed change came from `codex/one-click-update`; there is no remaining one-click updater task.

```sh
git clone https://github.com/853493541/ZPS-Plugin.git
cd ZPS-Plugin
git fetch origin
git switch main
git status --short --branch
```

For an existing checkout, inspect and preserve local work before switching. Check that another agent or Windows acceptance run is not already working on this branch. The 0.1.5 development workers have stopped. The recorded acceptance and publication runs have completed.

Read these in order:

1. `AGENTS.md`.
2. `.pstack/cloud-models.md` and `.pstack/skills/poteto-mode/SKILL.md` in full, then the triggered playbook and principles.
3. The newest sections of `docs/WORK_STATUS.md`, especially 0.1.5 delivery.
4. This file's verification and remaining-limit sections.
5. `docs/RELEASING.md` before merging or publishing.

Use Lauren Tan's pstack for this project. The vendored source is complete under `.pstack/skills`; `.agents/skills` uses relative symlinks. If Windows checks out symlinks as text, read `.pstack/skills/<name>/SKILL.md` directly. Do not auto-update pstack. Its upstream revision is recorded in `.pstack/UPSTREAM.json`.

User model caps remain GPT-6.1 Sol high for the coordinator and GPT-6.1 Sol medium for workers. Context budgets are 300k and 150k. Keep worker briefs fresh and scoped. Do not silently substitute a stronger model or claim that a tool enforced a context window it cannot configure.

## The product and user preferences

ZPS Studio is an Electron Windows editor for files consumed by four plugin features:

| Feature | Editable data |
| --- | --- |
| JX BUFF enhancement | Types in `tClass`; Buff membership in `tBuff[id].nClass`; levels and existing settings. |
| MY team buffs | Ordered text monitor rules. |
| MY target monitor | Opaque binary presets, read-only. |
| MY chat monitor | Ordered keyword text. |

The user wants large readable text, little repeated labeling, four feature areas in left navigation, obvious creation actions, and centered record modals. Do not restore the old right-side drawer. Each feature can hold several datasets with separate bytes, drafts, undo and source identities. Open tabs and custom version labels are session-scoped. Exported plugin files are durable; tabs do not currently restore after restart. Version labels are user declarations, not inferred game compatibility.

JX editing is type-first. Search type names or Buff names/IDs live, select a type, then edit its members. Exact empty and whitespace type names are distinct. Missing class references must stay visible. Removing membership retains the Buff rule and sets `nClass` to the empty string. Preserve numeric level keys including zero and all unknown fields.

The current request is simpler application updating. The user's reference shows one compact notification with “New update available” and one “Install” button. Required flow:

- Automatic discovery displays the inline banner.
- One Install click is enough, even if the background download is unfinished.
- Finish downloading, then update silently in place and reopen the app.
- No separate update modal, download button, restart confirmation or installer wizard.
- Protect unsaved data. Show blocking edits/drafts inline, with no update-specific native dialog or automatic export-dialog sequence. After resolving edits, the user can retry Install.

## Shipped baseline and verification

Latest verified public release: [0.1.5](https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.5).

Released application source: `48966f9b9ba8198f25396008a482540c83427688`.

Public updater feed: https://github.com/853493541/ZPS-Plugin/releases/latest/download/latest.yml

The repository is already public, with user approval including source history and addon references. Hosting works anonymously. Do not repeat superseded separate-repository, private-visibility or initial-hosting blockers.

0.1.4 fixed the installer wizard by using silent/relaunch options for explicit updates. 0.1.5 removes the remaining updater modal, separate download action, native confirmation and automatic export-dialog sequence. Discovery shows one Install button during downloading or when ready. A click arms version-bound installation intent. The matching download completion rechecks all datasets and requests silent installation/relaunch once. Unsaved edits or drafts block inline. Errors or version changes clear consent. Error Retry checks again before a fresh Install choice. Action epochs prevent an older status response from overwriting a completed action.

The native install controller has 16 behavior tests. All 93 tests pass, and the banner browser smoke passes seven scenario groups. It covers available/downloading/ready, duplicate clicks, dirty/draft blocking, retry with/without a known version, fresh consent, stale status, keyboard access and compact/desktop layout. Independent source and Chromium review passed. The prior retry mismatch and stale-response bugs were reproduced before their fixes.

Windows PR run 42922503867 and final main run 42923050302 passed tests, native smoke, packaging, installed lifecycle, asset validation and actual upgrade/retention. Publication run 42923482426 succeeded. Anonymous latest.yml returned HTTP200 and version 0.1.5; digests are recorded in WORK_STATUS. Original vendor/sample hashes remain unchanged.

Installed acceptance observes and forwards the actual normal-close `(true, false)` installer call unchanged. It must never force arguments to make a test pass. The explicit one-click request and silent/relaunch `(true, true)` call are checked through native IPC fixtures, browser behavior and the updater API contract. Do not claim that the normal-close installed smoke proves automatic relaunch through the new explicit action.

## Current state and remaining limits

There is no unfinished one-click updater work. Version 0.1.5 is released, not merely a work-branch package bump. Do not create 0.1.6 just to repeat verification. Wait for a new user change or a changed actionable gate.

Open dataset tabs and custom version labels remain session-scoped. Target-monitor binaries still lack a verified editable codec. Real in-game import acceptance is separate. Historical game-version equivalence and full JX3BOX field coverage remain unverified. Those limits must not be presented as solved by the updater release.

The user values fewer labels and steps. Preserve the compact inline update banner and centered record modals. Do not restore an update modal, download button or clean-install confirmation without a new requirement. Protect unsaved data and avoid any update triggered solely by background discovery.

## Fresh environment setup and checks

Use Git, Node 22 and npm. Node 22.23.4 was validated here; Windows CI tracks Node 22. No secret is required to build or read the public repository.

```sh
npm ci
npm test
node --check app/ui/renderer.js
python tools/snapshot_addons.py
git diff --check
```

Use `npm test` as defined. It starts separate direct Node invocations for fixture isolation. Do not replace it with one combined isolated `node --test` run without investigating the mock/module-cache behavior.

`npm start` runs Electron. For automated browser work, run a fresh preview:

```sh
PORT=4190 npm run preview
PREVIEW_URL=http://127.0.0.1:4190 node tools/smoke-update-banner.mjs
```

PowerShell uses `$env:PORT='4190'` and `$env:PREVIEW_URL='http://127.0.0.1:4190'` before the corresponding commands. Some browser scripts still hardcode `/usr/bin/chromium`; use a real local Chrome/Chromium path and make the runner portable if needed. `playwright-core` does not install a browser automatically. The banner smoke is deterministic and passes against the inline flow.

Other deterministic checks include `smoke-datasets`, `smoke-type-workspace`, `smoke-feature-tabs`, `smoke-cache-loading`, `smoke-buff-metadata`, and `smoke-icon-retry` under `tools/`. Use a fresh preview process for real-session scripts, because reopening a sample now preserves edits instead of replacing the session. Mocked metadata checks need no live JX3BOX access. `smoke-ui` and `smoke-buff-icons-live` contain live-source checks; do not report those as passing without running them against real access.

Run Windows installed acceptance through `.github/workflows/windows.yml`. Installation/uninstallation scripts are guarded for disposable GitHub Actions runners. Do not spoof those environment guards to run them on the user's machine. The Linux cloud session could not reliably run native Electron; Windows CI provided that evidence.

## Architecture pointers and constraints

- `app/core/documents.mjs` owns source parsing, including its Lua-table parser, and lossless edits. JX is GBK; preserve encoding, whitespace, unknown fields and numeric keys. Never execute imported Lua.
- `app/core/feature-sessions.mjs` owns UUID-keyed datasets, source deduplication, undo and dirty/draft state.
- `app/desktop/main.cjs` owns files, serialization, protected originals, atomic export backups, updater and lifecycle guards. `preload.cjs` exposes narrow isolated IPC.
- `app/ui/renderer.js` owns per-dataset selections, forms, live search, centered detail modal and metadata rendering.
- `app/services/catalog.cjs` and `icons.cjs` cache JX3BOX data separately from preset bytes. Keep edition/ID-or-name/level isolation, lazy icons, bounded queues and stale-data handling.
- `icons.cjs` deliberately validates IDAT with bounded public zlib before pngjs. Node 22 could accept corrupt compression through pngjs's private inflater. Do not remove that validation because Node 24 tests alone pass.
- Keep all 512 vendor files and 14 samples unchanged. `snapshot_addons.py` verifies their original hashes. Never use a whole-file serializer that loses unknown source data.

Remaining product limits are independent of this updater task. MY target-monitor binaries have no verified editable codec. Real in-game import acceptance is still separate. JX3BOX std/origin/wujie are client editions, not historical patch versions. Supplied IDs were checked at std level 1, with some internal-name fallbacks and missing source fields. Do not fabricate complete names/icons or historical equivalence. Probe fresh network access only when relevant; older Cloud allowlist failures do not prove the service is down. Do not bypass proxies or TLS validation.

## Delivery and coordination

The user explicitly requested automatic delivery of implemented app changes. `AGENTS.md` records the standing approved workflow. Questions/status checks alone do not authorize releases. This handoff is a project pickup guide, not a new release request.

After verification and review, merge the exact PR head to main. Successful same-repository push acceptance on main triggers `.github/workflows/publish-after-acceptance.yml`. It publishes the exact tested five-file artifact and refuses replaced assets or a stale source head. Do not publish from PR artifacts or rebuild assets for upload. Wait for publication before merging a documentation receipt that moves main. Verify anonymous latest.yml and public digests before claiming delivery. See RELEASING.

GitHub authentication in this Cloud session is not transferable to a new Cursor environment. Use that environment's approved Git/GitHub connection. Never put credentials in the app or handoff. If automatic approval review rejects a merge/publication, do not bypass it. Check actual prior authorization and provide its evidence through the same review path; if it remains blocked, report the reason and ask the user. A prior rejection was resolved by confirming existing standing authorization, not by changing permissions.

Keep `docs/WORK_STATUS.md` current and append meaningful decisions to `.audit/editor.tsv`. The hourly ChatGPT continuation task remains paused to avoid quota waste. Do not create or reactivate recurring work. Stop this session's workers/servers before handing ownership onward; do not overlap another active run.
