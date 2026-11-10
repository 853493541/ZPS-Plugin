# ZPS Studio 0.1.4

“Restart and update” now applies the downloaded update silently in the existing installation and reopens the app. It no longer requests the interactive installer wizard. Normal app close continues to update silently without reopening.

Applied edits and unapplied drafts across all datasets retain their existing guards. The updater does not discard them to install an update.

The installed-upgrade test now observes and forwards the app's real installer arguments. It no longer forces silent mode, which masked the previous interactive restart behavior. Windows acceptance verifies the actual normal-close update path, installation replacement and retained files. A separate native IPC test verifies silent restart with relaunch.

To receive this fix through a current 0.1.1–0.1.3 build without its interactive restart action, let the update download and close the app normally. From 0.1.4 onward, the restart action also uses silent updating.
