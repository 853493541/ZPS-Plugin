# Cached buff names and icons

Buff metadata and icons are supplemental data. They never change preset bytes, applied edits, undo history, or unapplied drafts.

## Names

The catalog retains its existing per-edition, query and level disk files. A bounded memory cache avoids repeatedly reading the same files. Fresh entries retain the 24-hour lifetime. Expired entries are available immediately through cache-only preload and are labeled as stale while the existing throttled network path refreshes them. A successful authoritative response that no longer matches removes the old display value. Failed refreshes keep the saved result available offline.

The UI loads saved results in batches of up to 512 before asking for missing entries. Cached responses bypass unrelated pending network requests. Metadata is retained across feature switches. Cold lookups prioritize the selected or filtered records as the current request finishes. Same-key requests share their pending work; real API requests remain serialized and spaced as before.

## Icons

The desktop stores icons under its application-data icon-cache directory. The preview has its own local cache. Keys derive only from the official standard/origin icon URL and icon ID. Standard and wujie use the same official path; origin stays separate. These ID-addressed images remain available across restarts and offline. No unrelated icon is substituted for missing source data.

Only icons near the visible rows are loaded, with up to three downloads at once. Duplicate downloads share a request. User-triggered retry refreshes the saved URL. Failed refresh preserves the previous valid image. Cache writes publish content-addressed PNG bytes before metadata, so an interrupted write cannot replace a valid pointer with incomplete bytes. Memory use is bounded to 128 images; files remain available on disk after memory eviction.

Images must be PNGs, at most 1 MB encoded and 2048 pixels on each side. Complete headers, CRCs and compressed image data are decoded and validated before persistence. Invalid cached bytes trigger refetch rather than reaching the UI.

## Evidence

The original catalog reproduced head-of-line blocking: a known fresh cache hit remained unresolved while an unrelated network fetch was deliberately held open. The fixed deferred regression resolves both memory and restart/disk hits while that fetch is still pending. This proves ordering and network independence, not a claim about real Internet latency.

Catalog tests cover cache-only fresh/stale/miss results, no network on warm reads, request sharing, mutation isolation, and refresh behavior. Icon tests cover persistent offline reuse, concurrent limits, timeouts, corrupt/truncated images, recovery, and eviction. The browser regression `tools/smoke-cache-loading.mjs` verifies stale names/icons before a held refresh, tab and draft retention, authoritative empty refresh removal, and 513 cached queries loaded in batches with zero network calls. Existing metadata and feature-tab browser regressions also pass.

This cloud instance still cannot access JX3BOX. Tests use previously captured public buff fixtures and controlled PNGs. No new live-network speedup or end-user Windows timing is claimed. First-time uncached data still requires network access. The 17 sample records previously identified without a public icon remain explicitly missing, rather than being repaired with fabricated artwork.

## Windows acceptance

[Run 42751510036](https://github.com/853493541/ZPS-Plugin/actions/runs/42751510036) passed the version 0.1.1 application at `b9312cb`. It verifies the 55 automated tests, native Electron startup, installed NSIS lifecycle, production PNG dependency inclusion through packaged startup, release asset validation, and installed upgrade with retained user-data hashes. This is a test artifact; the cache changes are not merged or published as a release.
