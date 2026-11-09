# ZPS Plugin

A tool for creating and editing data consumed by the existing MY and JX game addons.

The existing addons are the reference. The project aims to make their data authoring easier, while leaving the
addons themselves unchanged. The repository contains the addon baseline, user-created sample data and a
verification tool. ZPS Studio adds a Windows desktop editor without changing those originals.

## Original addon baseline

`vendor/interface/MY/` and `vendor/interface/JX/` contain byte-for-byte copies selected from the frozen client's
matching interface folders on 2026-11-09. Selection uses each addon's `manifest.dat`: declared files and the
manifest/signature metadata are retained. Every declared file matched its manifest SHA-1 before copying.
`vendor/BASELINE.json` records SHA-256 hashes for the complete imported baseline.

This is the current manifest-declared baseline, not a copy of every historical file left in the client folders.
Unlisted older versions and locally generated research files are omitted. The manifest hashes establish file
consistency; this import does not claim to verify publisher signatures.

The separate `MY#DATA`, `JX#DATA`, `userdata` and character settings are not imported or edited. Bundled static
resources and tables declared by an addon are retained because they belong to its packaged baseline. They are
different from user-created presets and account data.

Treat `vendor/interface/` as an unchanged reference. Future editor code and generated output belong outside it.
Some packaged Lua files may be encrypted or compiled; their original bytes are preserved, without decrypting or
rewriting them. Bundled license notices remain in their original locations. No blanket license is assigned to
the upstream packages by this repository.

## Sample data

[The sample-data folder](samples/README.md) contains the user's `【丝路风雨】真传插件数据包`, under `真传模式`.
The 14 original exports, instructions and screenshots are retained unchanged. `samples/SAMPLES.json` records
their hashes. These explicit sample exports are separate from the original addon baseline and live account stores.

## Verify

Python 3.9 or later is sufficient. There are no third-party dependencies or build steps for this initial baseline.

```sh
python tools/snapshot_addons.py
```

On the Windows machine that holds the frozen client, also compare against the source:

```powershell
python tools/snapshot_addons.py --compare-source C:/JX3ZHENCHUAN/Game/JX3/bin/zhcn_hd/interface
```

The original import command is below. It reads the client files and writes only inside this repository. Repeating
it accepts identical files and refuses to replace a different baseline.

```powershell
python tools/snapshot_addons.py --import-from C:/JX3ZHENCHUAN/Game/JX3/bin/zhcn_hd/interface
```

This private baseline is for the project's personal research. No game client is launched by these commands.

## ZPS Studio

The workspace separates four addon features into tabs: 剑心 BUFF增强, 茗伊团队气劲, 茗伊目标监控, and 茗伊聊天监控. Each tab lists only its own presets and import destination. The three target-monitor exports are grouped in the target-monitor tab and remain read-only. Editing supports JX buff rules and classes, MY team-buff text, and chat keywords. [The format map](docs/DATA_FORMATS.md) records the evidence and limitations.

Node.js 22 or later is required for development.

```sh
npm ci
npm test
npm start
```

To exercise the same UI in Chromium with the real sample library:

```sh
npm run preview
```

Open http://127.0.0.1:4173. The browser preview keeps edits in memory; native export, updates, and reports run in the desktop app.

### Export an edited preset

Open a sample or a local export, select a record, change its configuration fields, and apply the changes. **Export** saves a copy. Existing destination files receive a backup. The original sample and vendor directories are protected. **Undo** restores previous edits.

JX BUFF files keep GBK encoding. Characters that cannot encode as GBK are rejected rather than replaced. Lua files are parsed as literal tables and never executed. Unknown fields and untouched text remain intact. Levels are numeric-keyed mappings, including key zero.

Use the plugin's own import interface to check the exported copy. The game client is not available in this cloud, so in-game import remains a release gate. [The format map](docs/DATA_FORMATS.md) gives the sample's original import instructions.

### Buff details and updates

Buff names and official icons load automatically for buff records, and the JX3BOX pane exposes the full returned record with edition, level, provenance, and cache state. Internal names are labeled when no public name exists. All 177 supplied JX preset IDs matched live standard-edition level 1 records. A missing result is not proof that a buff does not exist. Historical 真传 equivalence and exhaustive level coverage remain unverified. [API research](docs/JX3BOX_API.md) documents the actual upstream frontend contract.

[ZPS Studio 0.1.0](https://github.com/853493541/ZPS-Plugin/releases/tag/v0.1.0) is the first Windows x64 testing release. The installer is unsigned. Installed builds check the update files attached to releases in this repository. Download and installation are separate actions, and unsaved work must be exported before restart. The repository must be Public for anonymous downloads and update checks. While it is private, release downloads require GitHub access and the desktop updater cannot authenticate anonymously. No GitHub token is embedded in the app.

**Report a problem** exports an inspectable local JSON report with the description you enter and application/platform metadata. It does not upload the report or automatically attach your presets.

### Build Windows

```powershell
npm ci
npm test
npm run dist:win
```

The Windows workflow builds an x64 NSIS installer, blockmap, and update metadata as downloadable CI artifacts. It then installs the actual package in a disposable Windows runner and verifies packaged startup, Chinese paths, export backups, restart, uninstall, and retained user-data hashes. Production distribution still requires signing, interactive acceptance, and an installed-version upgrade test. It does not publish releases.

The current evidence and next steps are in [WORK_STATUS](docs/WORK_STATUS.md). An hourly continuation task checks for unfinished work; scheduling cannot guarantee quota availability or an exact reset-time resume.
