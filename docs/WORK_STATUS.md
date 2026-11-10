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

## Version 0.1.0 published in the existing repository

[Windows acceptance run 42721383886](https://github.com/853493541/ZPS-Plugin/actions/runs/42721383886) passed exact commit `8bdd6e1afe5622b53d1d7826cf7d7bdf1be4b9c3`, including 37 tests, native smoke, installed lifecycle, asset verification, and installed upgrade/retention checks. The artifact ID is 13719829254, ZIP SHA-256 `9589e68f5209e515abe6289936cd1c0eb1b352c65aa0dc0c8aa8b6c25c8f0357`. Correct existing-repository assets are retained at `artifacts/release-0.1.0-zps-plugin/`. Do not use the earlier separate-host installer in `artifacts/release-0.1.0/`.

Direct asset upload from the cloud connection failed with HTTP401 at uploads.github.com. A narrowly scoped GitHub Actions publication job uses its repository token instead. [Publication run 42722476025](https://github.com/853493541/ZPS-Plugin/actions/runs/42722476025) downloaded the successful acceptance artifact, checked its commit, version, feed and hashes, uploaded all five files, verified the server-side SHA-256 digests, and published [v0.1.0](https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.0). No credentials are in the app. The release is unsigned and labeled a testing release.

The repository was still Private at the final visibility check. The owner approved Public visibility, but the connection's PATCH returned integration HTTP403 and the shared-browser fallback could not access settings. The owner was asked to set Public manually. The release exists now; GitHub-authenticated users with repo access can download it. Anonymous downloads and automatic update checks become available when this same repository is Public. No additional repository or rebuilt installer is needed for that visibility change.

Publication helper hardening serializes publishing jobs, refuses asset replacement, and verifies the actual tag commit before and after publishing. The selected accepted run ID is an explicit operator input; the manifest head SHA, release target, feed, version and asset hashes must all agree.

## Public release and anonymous feed verified

The owner changed ZPS-Plugin to Public. Repository metadata confirms public visibility, and v0.1.0 remains the published latest release. Anonymous HTTPS requests, without an Authorization header, returned HTTP200 for the 102392363-byte installer, 107307-byte blockmap, and 349-byte latest.yml. SHA-256 values for all three exactly match the verified acceptance artifact from run42721383886. The report is retained at `artifacts/public-release-verification.json`.

Public installer: https://github.com/853493541/ZPS-Plugin/releases/download/v0.1.0/ZPS-Studio-Setup-0.1.0.exe
Public update feed: https://github.com/853493541/ZPS-Plugin/releases/latest/download/latest.yml

Publication and public hosting are complete in the existing repository. No separate release repository is needed. Installed 0.1.0 builds can check this anonymous feed; future tested releases must use higher versions and the same feed. Download/restart remain explicit user actions. The installer is an unsigned testing release, and existing game-client acceptance and read-only binary-format limits remain unchanged.


## Cache loading continuation

The user reported slow or missing buff names and icons. Resumed latest released source from `codex/jx3box-network-handoff` at `6500183` on isolated branch `codex/cache-loading`. No concurrent development was found. The existing catalog queues disk hits behind network requests, while tab switches clear the display cache. A deferred baseline reproduced a fresh cache hit remaining blocked behind an unrelated held request.

Prepared version 0.1.1 with cache-only bulk name hydration, bounded memory reuse, request deduplication, selected/filtered lookup priority, and persistent validated icon caching. Cached data remains query/edition/level scoped and separate from preset bytes. Expired cached names appear before refresh; successful empty refresh removes an obsolete match. Downloads are lazy and bounded, missing source icons stay explicit, and retry can replace saved image bytes. `docs/CACHE_LOADING.md` records the design and regression evidence.

All 55 current automated tests pass. Browser cache-loading, metadata, and four-feature regressions pass without page errors. Same-model review found stale-name invalidation, over-512 batch sizing, truncated-PNG acceptance, and detached icon observation issues; each was corrected with behavior checks. Windows run 42751510036 passed the application changes at `b9312cb`, including all 55 tests, native smoke, version 0.1.1 NSIS packaging, installed lifecycle, asset verification, and installed upgrade. The Windows test artifact is available from https://github.com/853493541/ZPS-Plugin/actions/runs/42751510036. PR https://github.com/853493541/ZPS-Plugin/pull/1 targets the previous released-source branch. It has not been merged or published. This documentation-only checkpoint does not change the tested application bytes. No new release or deployment is authorized by the caching request, and v0.1.0 remains the published release.


## Automatic delivery authorized

The user asked to publish the update now and make future implemented app changes automatically reach the app. This supersedes the earlier cache-only no-publication limitation. Version 0.1.1 now includes the caching fixes plus automatic background download, startup/five-minute/focus checks, a ready-update banner, and installation through normal guarded close or explicit restart. Version 0.1.0 still needs its existing manual download/install action once to receive the new updater behavior.

`AGENTS.md` records the approved behavior-change delivery workflow. A new publication workflow accepts only successful same-repository push acceptance runs on main, checks out their exact source, and uses the existing immutable-asset/tag/hash publisher. PR runs cannot publish. Local automatic-check and guarded-close tests are being verified before merge and release. No release is claimed until public assets and feed are verified.


Windows PR run 42758692696 passed the automatic-updater application at `99a128f`, including all 66 tests, native/installed lifecycle, and real automatic-download upgrade with retention checks. The following checkpoint updates documentation only. User-authorized merge and main acceptance/publication are proceeding through the automatic workflow; no public release is claimed before that succeeds.


## Version 0.1.1 delivered with automatic updates

The user authorized immediate publication and an ongoing automatic app-delivery workflow. PR 1 merged the released-source foundation, cache update, and new updater into main at `cb0804b105a1382199e63daddf410950ea12cf0a`. Main Windows acceptance run 42759149743 passed all 66 tests, native and installed lifecycle, asset verification, and actual automatic-download upgrade/retention checks.

Publication run 42759521082 initially created the draft then hit a read-after-create release-list visibility race. Retrying only its failed publication job succeeded, without rebuilding or replacing assets. Version 0.1.1 is public at https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.1. The anonymous latest.yml request returned HTTP200 and version 0.1.1. Public release metadata contains all five expected assets and the exact accepted source target. The publisher now uses the structured draft creation response instead of immediately searching a potentially stale list.

Version 0.1.0 users must use its existing update control once to check/download/install 0.1.1, or install the public 0.1.1 installer. From 0.1.1 onward, startup, five-minute and cooldown-protected focus checks download updates in the background. A ready banner offers restart. Normal app close installs a ready update silently without reopening, only through the existing unsaved-edit/draft close guards. The periodic ChatGPT task remains paused; app HTTP checks consume no ChatGPT usage.

Future requested app behavior changes follow the approved AGENTS workflow: implement, version, verify, merge to main, and publish only after main Windows acceptance succeeds. Failed tests, untrusted PR runs, stale main runs, and mismatched/replaced assets cannot publish. Questions/status checks do not trigger app changes. Remaining game-client and opaque-MY-format limitations still apply.

## Type-first UI update prepared for 0.1.2

The user requested a quieter editor, larger text, four feature areas in left navigation, and live type-or-buff search with membership editing. The new JX workspace projects exact `tClass` names and `tBuff.nClass` membership into a type list and member panel. Details open on demand. Users can create and rename types, search and assign existing buffs, add numeric IDs, move membership, or remove membership while retaining the rule. Import help and unknown fields are collapsed. MY and chat retain their existing editing behavior with larger controls.

All 72 unit tests pass. The actual-sample browser workflow passes search by captured name and ID, create/rename, move/remove/undo, draft retention, a renamed draft destination, and compact-window layout. Existing deterministic feature, metadata, cache, and icon-retry regressions pass. Review found a draft-destination rename loss and an unrelated-metadata detail reset; both were corrected and verified. Native and installed-upgrade smoke startup selectors now match the type workspace. All 512 vendor and 14 sample hashes remain unchanged.

`docs/TYPE_WORKSPACE.md` records the design and verification commands. `artifacts/editor-types.png` and `artifacts/editor-buff.png` show the original sample with captured 12784 metadata and an intentional offline icon state. These screenshots do not establish live API access. No remote speedup is claimed; local membership appears before enrichment and the open type's members receive lookup priority.

The approved delivery workflow applies to this requested behavior change. Version 0.1.2 is prepared. Windows acceptance and public publication remain pending at this checkpoint. The periodic ChatGPT task stays paused.

## Version 0.1.2 delivered

PR 3 merged the type-first UI at `3ded2eda4a13a46fe6888a16e951746c1412f430`. Independent GPT-6.1 Sol medium source review and fresh Chromium verification passed, including keyboard access, retry controls without nested buttons, cross-type rename drafts, and the 1050×760 layout. All 72 unit tests and five deterministic browser regressions passed. Both Windows PR acceptance run 42765001280 and final main acceptance run 42765437914 passed native smoke, packaging, installed lifecycle, asset verification, and actual installed upgrade/retention checks.

Automatic publication run 42765815159 succeeded without intervention and published https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.2 from the exact accepted main commit. All five public release assets are present. An anonymous latest.yml request returned HTTP200, version 0.1.2, and SHA-256 `ec343dd0f8d36add5bfb970c232630c6446a34a40b8891514a3c193e4c64945f`, matching the public asset digest. Installer SHA-256 is `3d6df359219b2e2bb5ffc262bf28b1632102a3af4eaf8f77b9e0c7c22cdd6d91`.

Public installer: https://github.com/853493541/ZPS-Plugin/releases/download/v0.1.2/ZPS-Studio-Setup-0.1.2.exe

Installed 0.1.1 apps can detect/download this update using their startup, periodic, or focus checks and install on guarded close or explicit restart. The requested UI update is complete. Do not repeat its passing builds. The periodic ChatGPT task stays paused. Original game-client acceptance, unknown target-monitor binary format, and source metadata coverage limitations remain separate from this completed UI update.

## Dataset identity and centered editing prepared for 0.1.3

The user requested fewer labels, recognizable filenames and versions, multiple datasets within each feature, explicit creation actions, and a centered modal instead of the right drawer. The native session owner now keeps UUID-keyed datasets with per-feature selection. Open/create add datasets; canonical source reopening preserves edits. Native file import supports multiple selection and validates every document before installation. Each dataset has independent applied bytes, undo, saved baseline, and drafts. Close/update guards inspect all datasets, including inactive files in the same feature. Closing the last dataset keeps an empty feature without reloading a sample.

The header shows the active filename and declared data version. Dataset tabs show source details for duplicate filenames. New dataset/type/Buff/monitor/keyword actions are explicit. Record editors use a large centered modal across features, with Escape and focus return. Repeated headings and technical notes moved out of the main workspace. File information shows source, modification time, current fingerprint, and plugin import destination. Unknown versions remain unknown; labels do not establish game compatibility. Open tabs are session-scoped and exported files retain the plugin's format.

All 76 automated tests pass, including the filename-extension boundary assertion. The new actual-session Chromium workflow passed two same-name datasets, independent drafts/bytes/undo, modal sizing, close cancellation, and final empty-feature behavior. Six existing deterministic browser regressions pass with centered-dialog and non-destructive dataset expectations. Vendor and sample SHA-256 baselines remain unchanged. Independent GPT-6.1 Sol medium source and fresh Chromium review passed, including JX and chat modal focus at 1050×760. Windows acceptance is pending. This requested behavior change follows the approved delivery workflow for 0.1.3; no publication is claimed at this checkpoint.
