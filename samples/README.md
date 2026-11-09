# User-created sample data

[【丝路风雨】真传插件数据包](真传模式/【丝路风雨】真传插件数据包/) is the user's existing export package,
copied from `插件数据/绝境战场/真传模式` on 2026-11-09. It is an example of the data the future editor needs to
help author. The surrounding research, quick-setting and expired-version folders are not included.

The package contains 14 original files: four `.jx3dat` exports, three text files, and seven screenshots. Its
original names and folder layout are preserved, including the import instructions and reference images.
The exports cover 剑心目标增强, 目标监控, 团队气劲 and 茗伊聊天监控 settings.

The files are copied byte for byte. No export is parsed, converted, corrected or imported into a running addon.
They are separate from the unchanged addon code under `vendor/interface/` and from live account settings stores.
`SAMPLES.json` records the source package and each copied file's size and SHA-256 hash.

## Verify

Run this command from the repository root. It checks both the addon baseline and every sample file.

```sh
python tools/snapshot_addons.py
```
