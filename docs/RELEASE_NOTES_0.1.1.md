# ZPS Studio 0.1.1

This Windows testing release improves buff loading and update delivery.

- Saved buff names load before network requests and remain available between feature tabs.
- Official buff icons are cached on disk and reused after restart or offline. Corrupt images are rejected; failed downloads remain retryable.
- Selected and filtered buff lookups take priority over the remaining background list.
- Updates are checked on startup, every five minutes while open, and when returning to the app with a cooldown. Verified installers download in the background.
- A banner offers restart when an update is ready. Closing the app normally installs a ready update silently after the existing edit/draft close checks. It does not reopen the app unexpectedly.

Version 0.1.0 users may need to use the update button once to download and install this release. After that, the automatic behavior applies to future versions. Unsaved edits and unapplied drafts retain their existing protection.

The installer is unsigned. Missing source icons, historical 真传 coverage, actual game-client acceptance, and read-only MY binary presets retain the documented limitations.
