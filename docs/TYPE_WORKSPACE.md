# JX type workspace

JX stores display types in `tClass` and buff membership in each `tBuff` record's `nClass`. The editor projects these exact names into an ordered group list. It includes empty types, whitespace names, unassigned buffs, and references whose type has no style record. The projection never rewrites source data.

The main layout keeps type search beside the member workspace. A full-page search-results alternative was considered. The persistent list was selected because changing several types is the user's recurring task. A detail drawer opens only for an explicit buff or type-settings action.

Search matches type names and member names or IDs. A matching type shows all its members. A buff-only match narrows the member view. Metadata arrivals update names and results without replacing an active form. Search and selection stay in each feature's view state.

Membership commands call the existing lossless edit boundary. Removing membership sets `nClass` to the empty string and retains the buff. Type renames use the codec's reference rewrite. Draft membership that was untouched rebases to the renamed type, while deliberate draft moves and unrelated edits survive. Samples and vendor files stay immutable.

Names are hydrated from cache before background lookup. The visible type's members receive lookup priority. This changes which data is requested first; it does not claim a measured remote-network speedup.

Run `npm test` for projection, byte preservation, and draft rebase coverage. Run `PREVIEW_URL=http://127.0.0.1:4185 node tools/smoke-type-workspace.mjs` against a local preview for actual sample search, create, move, remove, rename, undo, draft retention, and readable compact layout. The smoke uses captured metadata and a controlled icon failure, so its screenshots do not imply live API availability.
