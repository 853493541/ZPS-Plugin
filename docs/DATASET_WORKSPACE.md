# Dataset workspace

A plugin feature owns a collection of open datasets. Each dataset has a generated identity, source identity, filename, declared version, bytes, saved baseline, undo history, and draft state. `feature-sessions.mjs` owns these datasets. The renderer keys its selections, search and unapplied forms by dataset identity.

The selected design keeps open dataset tabs above the editor. A separate library page was considered. Tabs preserve the editing context when switching a few files and avoid another full-page navigation step. Tabs scroll when many files are open. The filename is prominent in the header. Duplicate filenames include source information in their tab labels.

Imports add datasets. Canonical file paths and exact sample keys identify an already-open source. Reopening activates that source without rereading over edits. Different paths with identical names remain distinct. Batch imports validate every document before installing any dataset. Creation always adds a new dataset and requires the format's filename extension.

Mutations and draft notifications carry dataset identity. Native operations remain serialized. Lifecycle guards inspect every dataset, including inactive files from the same feature. Saving an inactive dataset preserves the active selection. Closing the final dataset keeps its feature selected and empty. Returning to that feature does not automatically reload the sample.

All record editors use a centered native dialog. Escape closes it while retaining the draft. Focus returns to the invoking row or control. Background metadata keeps its existing edition, level, generation and focus guards. The modal names the owning file.

Declared versions are user labels, not inferred game patches. Imported unknown versions remain explicit. Source metadata and a current content fingerprint are available in file information. This update does not persist open tabs or custom labels across application restarts. Exported filenames include the version in the suggestion, and bytes remain in the plugin's existing format.

Run `npm test` for dataset ownership, atomic import, duplicate sources, independent edits and undo, explicit mutation targets, inactive export, and lifecycle guards. Run `PREVIEW_URL=http://127.0.0.1:4190 node tools/smoke-datasets.mjs` against a fresh preview process for same-name datasets, independent drafts, creation, centered details, guarded close and the empty-feature state. Browser fixtures use captured metadata and controlled icon failure, not live JX3BOX access.
