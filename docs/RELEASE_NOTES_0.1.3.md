# ZPS Studio 0.1.3

This update makes the active data file clear and keeps several datasets open within each plugin feature.

- The header shows the active filename and declared data version. Separate dataset tabs let you switch files without replacing another file's edits, drafts, or undo history.
- Import can open multiple files. Reopening the same source selects its existing dataset. Different paths with the same filename remain separate.
- New dataset, new type, add Buff, new monitor, and add keyword actions have explicit names and locations.
- Record details open in a large centered modal for JX, MY team rules, and chat. Escape closes the modal and retains drafts.
- Corrupt icon streams are rejected consistently on Node 22 and newer runtimes, including previously saved cache files.
- Repeated headings and technical notes are removed. File information contains source path, modification time, content fingerprint, and the plugin import destination.

A version label distinguishes a user's datasets. It does not establish game compatibility. Imported files without a declared version say that the version is not labeled. A new dataset's label is included in the suggested export filename.

Dataset tabs belong to the current application session. Export files to retain your data before closing. Closing a dirty dataset or installing an update protects applied edits and unapplied drafts across all open datasets. Original samples and addon files remain protected.

The existing automatic updater downloads this version in the background and installs through guarded close or explicit restart. The installer remains unsigned. MY target-monitor binary editing and game-client acceptance remain outside this update.
