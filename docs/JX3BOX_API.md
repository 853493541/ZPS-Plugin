# JX3BOX buff integration reference

This editor needs searchable buff details without changing the user's MY or JX configuration format. The contract below combines JX3BOX's own frontend source with public API responses captured on 2026-11-09. This session reached both the homepage and the buff API through its inherited proxy with TLS validation enabled.

## Verified requests

The official [resource service](https://github.com/JX3BOX/jx3box-editor/blob/7125515069293a5a74dbc01086a76c124ff16184/src/service/database.js) uses these requests. The configured base URL is `https://node.jx3box.com/` in [JX3BOX's shared configuration](https://github.com/JX3BOX/jx3box-common/blob/master/data/jx3box.json).

| Purpose | Method and path | Query parameters observed in source |
| --- | --- | --- |
| Buff ID and optional level | `GET /buff/id/{id}` | `client`, `level` |
| Search by name | `GET /buff/name/{query}` | The service forwards its `params` object unchanged. |
| Search by numeric query | `GET /buff/id/{query}` | The service forwards its `params` object unchanged. |
| Database statistics | `GET /` | `client` |

The service chooses `name` or `id` using `isNaN(query)`. The documented application request can encode the query as one URL path segment. `page`, `per`, and `strict` occur in resource-query callers, but their accepted ranges and exact semantics are not verified for buffs. No maximum page size, rate limit, historical patch selector, or server-side cache lifetime was established.

## Verified response fields

The official [Buff component](https://github.com/JX3BOX/jx3box-editor/blob/7125515069293a5a74dbc01086a76c124ff16184/src/Buff.vue) reads `res.data.list[0]`. Here, `res` is Axios's response object. The HTTP JSON body therefore contains `list`. The component uses these fields on each record.

| Field | Use in the official component |
| --- | --- |
| `BuffID` | Buff identifier |
| `Level` | Buff level |
| `Name` | Display name |
| `Desc` | Description, rendered as text |
| `IconID` | Icon identifier |
| `DetachType` | Category code |

The captured `std` record for buff 12784 has numeric `BuffID`, `Level`, `IconID`, and `DetachType`, string `Name` and `Desc`, boolean `CanCancel` and `IsStackable`, numeric `MaxStackNum`, and null `ScriptFile`. The record also contains `Count`, `Interval`, and effect attributes. Their presence does not establish duration units, complete stacking rules, dispel semantics, or a complete schema for every record. A robust application can display the verified fields and all remaining keys in a raw-record details view. Missing fields are unknown, rather than zero or false. A search-result count can use `list.length` when an authoritative total is absent.

JX3BOX maintains the [category-code labels](https://github.com/JX3BOX/jx3box-editor/blob/master/src/assets/data/detach_type.json), including physical, yang, mixed-yuan, yin, poison, acupoint, food, medicine, and banquet categories. An unknown code can remain visible as its numeric value.

## Game flavors and icons

[The shared configuration](https://github.com/JX3BOX/jx3box-common/blob/master/data/jx3box.json) names `std` as 旗舰, `origin` as 缘起, `wujie` as 无界, and `all` as 全端. The buff component defaults to `std`. Live anonymous requests for buff 12784 at level 1 returned one matching record for each of `std`, `origin`, and `wujie`. The editor exposes those three. The `all` client was not tested. These client identifiers are not historical game patch versions.

[The official icon helper](https://github.com/JX3BOX/jx3box-common/blob/master/js/utils.js) produces `https://icon.jx3box.com/icon/{IconID}.png` for standard and non-origin clients. For `origin`, it produces `https://icon.jx3box.com/origin_icon/{IconID}.png`. Missing, invalid, or `-1` IDs use `https://img.jx3box.com/image/common/nullicon.png`.

## Authentication and caching evidence

The resource-search service uses plain `axios.get` without an explicit token. The [shared `$node` helper](https://github.com/JX3BOX/jx3box-common/blob/master/js/https.js) instead sets `withCredentials` and Basic authentication with an optional stored token as the username. The live diagnostic verified anonymous HTTPS requests without an application account token. The browser preview also passed through the same catalog service used by the desktop application. Native Windows live transport was not rerun in this session. There is no reason to embed an account token in the application.

The Buff component caches one record in `sessionStorage` under `buff-{client}-{id}-{level}`. It defines no expiration. An editor can keep a separate application cache keyed by client, query, and level, store the original record, and show the fetch time. Such persistence and expiration are editor policy, not an API guarantee. Offline results must identify themselves as cached.

## Live verification and limits

`python tools/probe_jx3box.py` returned HTTP 200 for both the homepage and `https://node.jx3box.com/buff/id/12784?client=std&level=1`. The buff body contained `total: 1` and one record named 逃兵. The default sandbox could not reach the inherited proxy. The approved execution retry succeeded without changing proxy routing or TLS validation. The earlier session's CONNECT 403 was specific to that instance.

The public regression fixtures in `app/tests/fixtures/jx3box/` retain the exact JSON bodies plus capture time, query, and source URL. They cover `std`, `origin`, and `wujie` for buff 12784 at level 1, the empty `std` level 2 response, a 逃兵 name search with five results, and an empty 真传 name search. Tests verify raw-field preservation, disk-cache reuse, empty responses, and stale offline fallback. A name search for 真传 returning no records does not establish whether the game mode is supported.

`node --use-env-proxy tools/check_jx3box_coverage.mjs` queried all 177 buff IDs in the supplied JX 真传 preset at `std` level 1. Every response contained a matching ID and level, with no missing records, failures, or stale cache results. [The coverage snapshot](JX3BOX_COVERAGE.json) records the sample hash, capture interval, IDs, source URL template, and counts. The full public response report remains in ignored `artifacts/jx3box-coverage.json`. Repeated checks can use the catalog cache and report network, cached, and stale counts separately.

This proves level 1 record availability for this sample. It does not prove historical 真传 semantics, coverage of all configured positive levels, or all MY name references. The preset's level zero is preserved as configuration and is not interpreted as an API level. The service's `std`, `origin`, and `wujie` values remain editions rather than historical patch versions. Duration units and icon downloads remain unverified.

The browser preview now calls `createCatalog` instead of returning a hardcoded network-policy error. On Node 24 with environment-proxy support, start it with `node --use-env-proxy tools/preview.mjs`, then run `node tools/smoke-ui.mjs`. The Chromium smoke verified a network result followed by a cache result, the displayed 逃兵 name, the complete raw payload, and unchanged preset contents, dirty state, and undo history. Local editing, undo, MY creation, and read-only binary handling also passed without page errors. Preview caches stay under ignored `artifacts/`; `PREVIEW_CACHE_DIR` can select an isolated cache.

## Windows release recommendation

For an Electron implementation, the practical release pair is an NSIS installer built by `electron-builder` and updates handled by `electron-updater` in the main process. The upstream [auto-update guide](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md) lists Windows NSIS support, generated `latest.yml` metadata, download events, and signature validation. Its [publish guide](https://github.com/electron-userland/electron-builder/blob/master/website/docs/publish.md) describes GitHub Releases and generic HTTPS hosting.

A release pipeline can build and test on Windows, package an x64 NSIS installer, and retain the installer, blockmap, and generated update metadata as reviewable artifacts. Tag-triggered publication can use GitHub Releases. Generic HTTPS hosting is an alternative when the target users cannot reliably reach GitHub. Packaging and publishing are separate actions. A publisher token belongs in CI secrets, never in the packaged application or update configuration.

The application can check for updates after startup and through a menu, report progress, and ask the user to restart only after their configuration edits are saved. It must handle unavailable update hosting without blocking local editing. A production release needs a real publisher configuration and Windows signing credentials. Installer execution and an installed-version update on Windows are the final verification, rather than a Linux packaging check.

The upstream documentation reflects its current default branch. A project must pin compatible package versions and follow those versions' updater APIs, including any required cross-origin header policy.
