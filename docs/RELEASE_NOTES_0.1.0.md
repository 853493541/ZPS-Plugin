# ZPS Studio 0.1.0

First Windows x64 testing release. The installer is unsigned; Windows may show an unknown-publisher notice.

- Separate workspaces for 剑心 BUFF增强, 茗伊团队气劲, 茗伊目标监控, and 茗伊聊天监控.
- Edit JX buff rules and categories, MY team-buff rules, and chat-monitor keywords.
- Display real JX3BOX buff names and icons, with edition-aware cached metadata and explicit missing-icon states.
- Retain edits, drafts, search, and undo when switching features.
- Export copies, preserve untouched data, and back up existing export destinations.
- Check for updates automatically, with user-controlled download and restart.

The three MY target-monitor binary presets remain read-only. Some JX3BOX records provide only an internal name or no icon. Historical 真传 equivalence and actual game-client import behavior are not fully verified.

Open a preset in its feature tab, edit and apply the desired fields, then export a copy. Use the import destination displayed in that tab to import it into the corresponding addon.

The download includes six sample presets. Private source history, the vendor reference baseline, development tests, and reference screenshots are not included. Electron's required application JavaScript is part of the installed program.

`SHA256SUMS.txt` and `release-manifest.json` identify the tested release files. `latest.yml` and the blockmap are used by the updater.
