# ZPS Plugin

A tool for creating and editing data consumed by the existing MY and JX game addons.

The existing addons are the reference. The project aims to make their data authoring easier, while leaving the
addons themselves unchanged. The repository contains the addon baseline, user-created sample data and a
verification tool. An editor has not been implemented yet.

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
