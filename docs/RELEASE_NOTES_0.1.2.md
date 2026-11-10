# ZPS Studio 0.1.2

This update reorganizes JX BUFF editing around types and their member buffs.

- Four plugin areas now appear in the left navigation.
- Larger text and controls leave more room for editing. Import instructions and advanced fields are collapsed.
- Search types, buff names, or IDs as you type. Open a type to see its buffs.
- Create and rename types. Search existing buffs to move them into a type, or add a numeric buff ID.
- Open a buff to edit its type, levels, and priority, or view its complete JX3BOX response. Moving a buff out of a type preserves the rule and supports undo.
- Local types and membership appear before online enrichment. Cached names and icons remain available, and the open type's members get lookup priority.

Applied edits and unapplied drafts remain protected across plugin areas and update restarts. Renaming a type updates its buff references without changing unknown source fields.

The existing automatic updater checks on startup, periodically, and on focus. It downloads in the background and installs on guarded close or explicit restart. The installer remains unsigned. MY target-monitor binary presets remain read-only. Metadata coverage depends on JX3BOX edition and level; a missing source image or name cannot be reconstructed by caching.
