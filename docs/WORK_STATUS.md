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
`npm test` passes 15 codec and 9 catalog tests. Actual sample no-op bytes, localized edits, level zero, GBK rejection, unsafe Lua rejection, class references, raw flags, opaque import, unknown-field preservation, cache isolation and failures are covered.

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
2. Live JX3BOX access and all 177 supplied JX preset IDs at `std` level 1 are verified in this session. Real fixtures and browser lookup/cache checks pass. Historical 真传 semantics, other configured levels, MY name coverage and duration units remain unverified. Official standard and origin icon transport, plus browser rendering, are verified. std/origin/wujie are edition identifiers, not historical patch versions. Do not claim full game metadata coverage.
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

## Accessible-session integration on 2026-11-09

Resumed `codex/jx3box-network-handoff` from its pushed checkpoint. The initial checkout was clean on main. Fetched the requested branch and preserved its existing implementation. Read AGENTS.md, the pstack runtime adapter, and the session handoff before integration.

The committed Python probe succeeded through the inherited proxy after an approved execution retry. Both homepage and actual buff API returned HTTP 200. Buff 12784 at `std` level 1 returned 逃兵. The public body matches the existing catalog contract, so no production schema conversion was added. Six real fixtures retain capture dates, source URLs, edition, level, and unmodified public JSON.

All 177 buff IDs in the supplied JX 真传 preset matched live `std` level 1 records. The check used the existing catalog sequentially and reported 177 network results, zero missing records, zero failures, and zero stale results. `docs/JX3BOX_COVERAGE.json` preserves the sample hash and ID inventory. `tools/check_jx3box_coverage.mjs` reruns the check and reports cache use explicitly. This is availability evidence, not historical-version equivalence or exhaustive level/name coverage.

Replaced the browser preview's obsolete hardcoded policy failure with the same catalog used by the desktop app. The Chromium smoke displayed 逃兵 from the network, then reused the cache, retained the complete response, and verified that metadata did not change the preset or its dirty/undo state. Existing search, edit, undo, MY creation/add, and binary read-only checks passed with zero page errors. All 24 unit tests pass. All 512 addon files and 14 sample files still match baseline hashes.

The Electron binary postinstall download failed on this Linux environment. Installed locked dependencies with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` for browser and catalog verification. Native Windows installer checks were not repeated because production desktop code did not change. No release or deployment was published. Remaining gates above still apply.

An independent same-model review found no substantive issues in the preview integration, coverage tool, fixtures, or catalog tests. The Model the Domain principle kept metadata ownership in the existing catalog. Prove It Works required actual API and browser evidence rather than inferring access from the homepage. A repeated coverage run correctly reported 177 cached results separately from the original 177 network results.

## Buff names and icons

The UI now enriches records automatically through the existing catalog. Buff names are searchable and appear alongside official icons in the list, selection heading, and API details. IDs remain visible. Metadata is an edition/query/level-keyed renderer overlay and never changes preset fields or export bytes. Background completion patches display surfaces without replacing the editable form. Requests are serial, old document and edition replies are ignored, and transport failure stops the automatic batch while allowing manual retry.

Real sample JSON contains 160 public names and positive icon IDs. The remaining 17 records have internal `BuffName` values but no public name or icon. The UI labels those fallback names 内部名 and preserves a missing-icon glyph. The real 12724 fixture preserves this null-field case. Exact-name MY references remain unresolved if ambiguous or incomplete.

Standard and origin icon URLs for ID 340 returned HTTP 200 image/png. Chromium verified real 48px images in list, selected heading, and API details. The live display smoke passed all 177 names and saved screenshots under `artifacts/buff-names-icons.png` and `artifacts/buff-icon-details.png`. Controlled browser tests also passed search, image-error fallback, typing focus, unchanged preset, stale document/edition isolation, origin paths, and automatic-stop/manual-retry behavior. The existing browser editing smoke and 24 unit tests passed. This session does not establish an installed Windows upgrade or in-game semantics. No releases or deployments were published.

Independent same-model review found that unrelated background lookups could collapse expanded API details and drop keyboard focus. The refresh now targets only the metadata query currently displayed. A browser regression verifies that the expanded disclosure and focused summary survive another buff completing. Model the Domain kept metadata outside preset state; Prove It Works required real icon decoding and displayed results.

## Four feature tabs

Separated the workspace into 剑心 BUFF增强, 茗伊团队气劲, 茗伊目标监控, and 茗伊聊天监控. The canonical feature registry maps the six actual presets into groups of 1, 1, 3, and 1. Feature-specific sample lists and import instructions replace the mixed sample library. The target tab groups 技能监控, 其他辅助, and 自用完整版 as read-only presets. New-record creation and JX3BOX controls appear only where applicable.

Desktop and preview share a byte-owned session store with independent document, undo, saved bytes, and dirty state per feature. The renderer preserves per-feature search, selection, inspector state, edition/level, and unapplied drafts. Tab activation does not discard edits. Replacing a document confirms only the dirty destination. Desktop close checks every dirty document, and update installation exports dirty sessions before restarting.

All 37 automated tests passed, including real six-file routing, shared-session behavior, and actual desktop IPC exercised with a stub Electron host. This IPC test covers inactive dirty close protection, canceled destination replacement, routing validation, preserved edits, and real export bytes. It does not launch a native window. The four-tab Chromium test passed sample filtering, all target presets, retained applied edits and unapplied drafts, independent undo/search/dirty state, and zero page errors. Existing editor, deterministic metadata, and real-icon browser checks also passed. Original addon and sample hashes remain unchanged. No releases or deployments were published.

Independent same-model review found two draft-protection gaps. A delayed apply response now preserves newer typed input. A separate draft flag reaches the session owner, so close and replacement protect unapplied drafts in inactive tabs without treating them as exported bytes. Update installation waits until drafts are applied or cleared. Regression checks cover typing during an outstanding apply and canceling a draft-only replacement. Keyboard Home, End, and arrow navigation plus rapid tab changes passed. Screenshots are saved at `artifacts/features-buff.png`, `artifacts/features-team.png`, `artifacts/features-target.png`, and `artifacts/features-chat.png`.

## Missing-icon audit and recovery

A full Chromium scroll through all 177 buff rows decoded all 160 source-provided icons. The other 17 records have null IconID and no public name. No actual icon requests failed during that scan. The ignored report `artifacts/icon-audit.json` records each row, source URL, decoded width, and failures. Category rows are configuration groups and keep their category symbol.

The renderer previously retained failed URLs for the page lifetime and offered no retry. A controlled failed download reproduced the missing recovery control. Missing source icons now display 无图, pending metadata shows 待查, completed unresolved metadata shows 未获, image downloads show an ellipsis, and failed downloads expose an accessible per-icon 重试 button. Successful retry clears the failed URL. Click and keyboard events stay inside the icon control. No unrelated icon is substituted for missing data.

`tools/smoke-icon-retry.mjs` failed before the fix because no retry button existed, then passed recovery after a controlled network failure, missing-source labeling, unchanged typed values, and clean applied/undo state. The recovered image is a deterministic PNG fixture in this regression; the separate real-icon scan uses actual JX3BOX PNGs. All 37 automated tests pass. No releases or deployments were published.

Independent review prompted two further checks: completed metadata misses no longer remain pending, and retry controls stop only activation keys so application shortcuts still work. The browser regression verifies a completed empty response and Ctrl+K from the retry control. The Fix Root Causes principle removed the permanent failure trap; missing source data stays explicit rather than receiving a guessed icon.

## Publication authorized and prepared

The user explicitly authorized publication in this session. The private source repository remains private. Runtime and packaging now agree on an anonymous generic update feed at the proposed public release-only repository `853493541/ZPS-Studio-Releases`. The package excludes application tests, regression fixtures, the vendor baseline, and reference screenshots. Six sample presets and their manifest remain included. The first version is 0.1.0 and is unsigned because no signing certificate is configured.

The authenticated GitHub connection can push source and dispatch Windows workflows, but `POST /user/repos` to create the public distribution repository returned HTTP 403, Resource not accessible by integration. The user was asked to create/connect that repository or provide an existing dedicated public destination. Do not change private source visibility or use an unrelated public project as an update host.

Run 42708396683 passed unit tests, native smoke, packaging, and installed lifecycle. Its new archive verifier used the wrong path separator on Windows; `path.join` fixes that check. Run 42709229248 then passed those checks and release-asset validation. Its real installed-upgrade test discovered that asynchronous `page.waitForFunction` polling returned early. A minimal browser experiment confirmed that a Promise resolving to false still ended that wait. The test now polls IPC status explicitly and is being rerun. No production application fix was indicated by that test failure.

`docs/RELEASING.md` records the publication process, and `docs/RELEASE_NOTES_0.1.0.md` describes the testing release and its limitations. Publish only the exact tested installer, blockmap, latest.yml, manifest, and checksum list after successful acceptance and writable public hosting. No public release has been created yet.

Run 42710632917 confirmed real update discovery, installer download, and the install/restart request. Its PowerShell pre-relaunch check compared a three-part application version against Windows' four-part PE product version and timed out. The check now compares numeric major/minor/build components, still waits for installer processes to exit, then requires the relaunched application itself to report the exact version and retained hashes. Run 42711968771 is validating commit `f61b10d`. Hosting is still blocked by the absent public distribution repository.

## Verified release artifact, public hosting still blocked

[Windows run 42711968771](https://github.com/853493541/ZPS-Plugin/actions/runs/42711968771) passed commit `f61b10d5a935134b3e41729aa57dbc155270514f`. All 37 tests, native smoke, packaging, installed lifecycle, release-asset verification, and the actual installed fixture upgrade passed. The upgraded app reported 0.1.0, retained user-data/export/backup SHA-256 hashes, reopened the edited export, and performed repeated no-update checks without downloading another installer. The fixture is the current source with version 0.0.9, not an independently released historical application.

Artifact `windows-desktop`, ID 13716905962, contains exactly the installer, blockmap, latest.yml, release-manifest.json, and SHA256SUMS.txt. Its ZIP SHA-256 is `8b56bb379b10d7edd6c1ca529fc9108bf8efd3f9f11159d69d0610364ab68a26`. The exact bytes are retained locally under ignored `artifacts/release-0.1.0/`. ZIP digest, all release checksums, source commit, and version were rechecked after download. Do not rebuild these assets before upload. The installer is unsigned.

A final lookup for the proposed public distribution repository still returned HTTP404. Creation returned integration HTTP403 earlier. The user must create a public `853493541/ZPS-Studio-Releases` repository and grant this connection write access, or provide a different dedicated public destination. The latter requires matching feed configuration and a new verified build. No public release or live update feed was published. The user already authorized publication; once the expected destination is available, upload the retained tested assets to a draft release, publish it, and verify the public installer and latest.yml without application credentials. Keep the source repository private.

## Existing repository selected and public visibility approved

The user rejected the separate-repository plan and explicitly approved making `853493541/ZPS-Plugin` public, including source history and addon reference files. This supersedes the earlier instruction to keep the source private and the proposed release-only repository. Both runtime and package feeds now point to `https://github.com/853493541/ZPS-Plugin/releases/latest/download/`.

The GitHub connection returns integration HTTP403 for changing repository visibility. The browser fallback also failed before settings could be accessed. The user was asked only to change the existing repository to Public; no new repository is needed. A draft v0.1.0 release was created successfully in ZPS-Plugin, targeting exact commit `8bdd6e1afe5622b53d1d7826cf7d7bdf1be4b9c3`. Windows run 42721383886 is validating the rebuilt installer. The release can be published in this repository even while private, but public downloads and anonymous update checks require the visibility setting to be Public.
