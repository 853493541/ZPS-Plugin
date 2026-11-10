# Cursor handoff: resume the one-click updater

This is the current handoff. Read it before older session notes. The user asked for this checkpoint so a Cursor agent can continue in a fresh environment. Do not rebuild the application from scratch.

## Checkout and first reads

Repository: https://github.com/853493541/ZPS-Plugin

Resume branch: `codex/one-click-update`. This branch contains the unfinished 0.1.5 work and this handoff. `main` contains shipped 0.1.4 and does not contain the one-click work.

```sh
git clone https://github.com/853493541/ZPS-Plugin.git
cd ZPS-Plugin
git fetch origin
git switch --track origin/codex/one-click-update
git status --short --branch
```

For an existing checkout, inspect and preserve local work before switching. Check that another agent or Windows acceptance run is not already working on this branch. The handoff author stopped its workers and did not open a 0.1.5 PR or start a 0.1.5 Windows run.

Read these in order:

1. `AGENTS.md`.
2. `.pstack/cloud-models.md` and `.pstack/skills/poteto-mode/SKILL.md` in full, then the triggered playbook and principles.
3. The newest sections of `docs/WORK_STATUS.md`, especially 0.1.4 delivery and the one-click handoff.
4. This file's unfinished-work section.
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

## Shipped baseline

Latest verified public release: [0.1.4](https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.4).

Released application source: `e5672a2c6eea96ebe350f4e4d3d630eec61dd4a1`. Main at the start of this work was the delivery-receipt merge `1245d6260ca36b55600810d64c4a229838c7bf68`.

Public updater feed: https://github.com/853493541/ZPS-Plugin/releases/latest/download/latest.yml

The repository is already public, with user approval including source history and addon references. Hosting works anonymously. Do not repeat the superseded separate-repository, private-visibility or initial-hosting blockers.

0.1.4 fixes the reinstall wizard. Explicit restart uses `quitAndInstall(true, true)`; normal close uses `(true, false)`. Current 0.1.1–0.1.3 users can receive 0.1.4 silently by waiting for download and closing normally. 0.1.4 still has extra updater UI and a confirmation, which is why the user requested the new flow.

0.1.4 passed 79 tests, independent review, Windows PR run 42916397976 and main run 42917034535. Publication run 42917481812 succeeded. Anonymous feed HTTP200 and asset digests were verified. Details are in WORK_STATUS.

## Work present on this branch

Package and lockfile versions are already bumped to **0.1.5**. It is not released. Do not bump again just to resume.

| File | Checkpoint state |
| --- | --- |
| `app/desktop/main.cjs` | Native version-bound install intent implemented. Public status includes `installRequested`, optional `blocked` and `message`. |
| `app/tests/desktop-updates.test.cjs` | Reworked into 16 behavior tests for one-click install, deferred completion, guards, duplicate clicks, version changes and errors. |
| `app/ui/renderer.js` | First-pass inline banner. Old check/download/install modal removed. Install works in available/downloading/ready states. Manual checking stays inline. Unverified in a browser. |
| `app/ui/index.html` | Existing `update-restart` button now labeled 安装. Legacy internal ID is retained. |
| `app/ui/styles.css` | First-pass compact blue banner and pill-shaped Install button, following the user's reference. |
| `package.json`, `package-lock.json` | 0.1.5. |

Native behavior uses an install-intent state machine with idle/requested/started/blocked phases. A click during automatic downloading arms consent for that specific version and does not launch a second download. `update-downloaded` enqueues the final same-version and all-dataset dirty check. Clean ready installation calls silent/relaunch directly with no confirmation. Edits/drafts block inline without export dialogs. Errors and a different version clear consent. Error handling restores normal close protection. Normal guarded close is otherwise unchanged.

The native worker stopped writing and reported 16/16 updater tests passing on Node 22.23.4 and Node 24.22.1. The coordinator ran the complete `npm test` suite after integration: **93 tests passed**, zero failures. Renderer syntax and `git diff --check` pass. No independent review, browser verification, packaged Windows acceptance or publication has been completed for 0.1.5. Passing unit tests do not make this a finished release.

## Known unfinished issues: start here

1. **Error-retry contract mismatch.** In the first-pass renderer, an error with a known `version` routes its Retry button to `updates('install')`. Native install currently accepts only available/downloading/ready, so that error path cannot recover. Reconcile the contract and add a meaningful regression. An error without a known version already requests a new check. Preserve the rule that old consent does not cause a surprise installation after an error.
2. **Replace the old banner smoke.** `tools/smoke-update-banner.mjs` still expects no button while downloading and a ready-only restart action. Those expectations are obsolete. Test available -> one Install request -> pending download -> ready, no update modal and no second click; test ready immediately; inline edits/drafts blocking; duplicate click protection; errors/retry; manual check without opening a modal.
3. **Review asynchronous renderer status.** `refreshUpdateBanner` skips applying responses while an action is active, but a status response started before Install can finish after that action returns. Verify that stale status does not re-enable or mislabel the action. Use request sequencing if the test exposes this.
4. **Run and inspect the UI.** Capture the compact banner, downloading-after-click and inline blocked state. Check 1050×760 and standard desktop sizes. No screenshot of the new banner has been verified yet. Existing screenshots under ignored `artifacts/` are not present in a fresh checkout.
5. **Review native intent and queue races independently.** The 16 unit cases cover same/different version, queued ready completion, new edits during download, errors and duplicate calls. Review the actual code and retain all dataset protections. No update-specific native dialogs or automatic save dialog sequence should return.
6. **Finish delivery only after checks.** Add `docs/RELEASE_NOTES_0.1.5.md`, update WORK_STATUS, obtain independent review, commit/push, open a PR, require Windows acceptance, then follow the approved main/publication flow. No 0.1.5 PR exists at this handoff.

The old updater smoke once hid the reinstall bug by overwriting installer arguments. That was fixed in 0.1.4. `tools/smoke-updater.mjs` must continue to observe/assert/forward actual app arguments unchanged. Installed acceptance exercises the normal-close path and retained-file hashes. Explicit silent/relaunch behavior is checked through native IPC tests and the updater API contract. Do not claim actual automatic relaunch was tested by a normal-close-only installed test.

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

PowerShell uses `$env:PORT='4190'` and `$env:PREVIEW_URL='http://127.0.0.1:4190'` before the corresponding commands. Some browser scripts still hardcode `/usr/bin/chromium`; use a real local Chrome/Chromium path and make the runner portable if needed. `playwright-core` does not install a browser automatically. The banner smoke currently needs the rewrite listed above before it can pass.

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

The user explicitly requested automatic delivery of implemented app changes. `AGENTS.md` records the standing approved workflow. Questions/status checks alone do not authorize releases. This handoff does not authorize publishing unfinished 0.1.5.

After verification and review, merge the exact PR head to main. Successful same-repository push acceptance on main triggers `.github/workflows/publish-after-acceptance.yml`. It publishes the exact tested five-file artifact and refuses replaced assets or a stale source head. Do not publish from PR artifacts or rebuild assets for upload. Wait for publication before merging a documentation receipt that moves main. Verify anonymous latest.yml and public digests before claiming delivery. See RELEASING.

GitHub authentication in this Cloud session is not transferable to a new Cursor environment. Use that environment's approved Git/GitHub connection. Never put credentials in the app or handoff. If automatic approval review rejects a merge/publication, do not bypass it. Check actual prior authorization and provide its evidence through the same review path; if it remains blocked, report the reason and ask the user. A prior rejection was resolved by confirming existing standing authorization, not by changing permissions.

Keep `docs/WORK_STATUS.md` current and append meaningful decisions to `.audit/editor.tsv`. The hourly ChatGPT continuation task remains paused to avoid quota waste. Do not create or reactivate recurring work. Stop this session's workers/servers before handing ownership onward; do not overlap another active run.
