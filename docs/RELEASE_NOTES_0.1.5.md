# ZPS Studio 0.1.5

Application updates now use one inline banner and one Install button.

- An update appears automatically when found. Install is available while background downloading is still running.
- One click waits for the download, applies the update silently in place and reopens the app. No separate updater modal, download action or restart confirmation is required.
- Unsaved edits and unapplied drafts across all datasets block installation inline. The updater does not open an automatic export-dialog sequence or discard data. Resolve those changes and click Install again.
- Failed updates clear installation consent. Retry checks the update source again; a later update cannot install unexpectedly using old consent.

Normal app close retains its existing unsaved-work safeguards and silent ready-update behavior. Dataset tabs remain session-scoped, and plugin data formats are unchanged.
