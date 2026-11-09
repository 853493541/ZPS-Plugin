# JX3BOX buff integration reference

This editor needs searchable buff details without changing the user's MY or JX configuration format. The contract below comes from JX3BOX's own frontend source, inspected on 2026-11-09. Live service behavior remains unverified because this environment's network proxy rejected the connection.

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

The component does not establish whether IDs and levels arrive as strings or numbers. It does not establish a complete buff schema. In particular, duration, stacking, dispel flags, and effect attribute names must not be invented. A robust application can display the verified fields and all remaining keys in a raw-record details view. Missing fields are unknown, rather than zero or false. A search-result count can use `list.length` when an authoritative total is absent.

JX3BOX maintains the [category-code labels](https://github.com/JX3BOX/jx3box-editor/blob/master/src/assets/data/detach_type.json), including physical, yang, mixed-yuan, yin, poison, acupoint, food, medicine, and banquet categories. An unknown code can remain visible as its numeric value.

## Game flavors and icons

[The shared configuration](https://github.com/JX3BOX/jx3box-common/blob/master/data/jx3box.json) names `std` as 旗舰, `origin` as 缘起, `wujie` as 无界, and `all` as 全端. The buff component defaults to `std`. This configuration proves those identifiers exist, but does not prove that the buff API accepts all four. A conservative initial editor exposes `std` and `origin` and verifies additional flavors against live responses before adding them. These client identifiers are not historical game patch versions.

[The official icon helper](https://github.com/JX3BOX/jx3box-common/blob/master/js/utils.js) produces `https://icon.jx3box.com/icon/{IconID}.png` for standard and non-origin clients. For `origin`, it produces `https://icon.jx3box.com/origin_icon/{IconID}.png`. Missing, invalid, or `-1` IDs use `https://img.jx3box.com/image/common/nullicon.png`.

## Authentication and caching evidence

The resource-search service uses plain `axios.get` without an explicit token. The [shared `$node` helper](https://github.com/JX3BOX/jx3box-common/blob/master/js/https.js) instead sets `withCredentials` and Basic authentication with an optional stored token as the username. The source alone does not prove that anonymous desktop requests are currently accepted. There is no reason to embed an account token in the application.

The Buff component caches one record in `sessionStorage` under `buff-{client}-{id}-{level}`. It defines no expiration. An editor can keep a separate application cache keyed by client, query, and level, store the original record, and show the fetch time. Such persistence and expiration are editor policy, not an API guarantee. Offline results must identify themselves as cached.

## Verification limits

The default sandbox failed before the request because its proxy at port 8080 was unreachable. A retried public request with sandbox escalation reached the proxy, which rejected the HTTPS CONNECT request with HTTP 403. GitHub connector reads succeeded. No real buff JSON fixture was captured, and no request volume or update performance was measured. A local mock can verify application handling but cannot establish live API compatibility.

## Windows release recommendation

For an Electron implementation, the practical release pair is an NSIS installer built by `electron-builder` and updates handled by `electron-updater` in the main process. The upstream [auto-update guide](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md) lists Windows NSIS support, generated `latest.yml` metadata, download events, and signature validation. Its [publish guide](https://github.com/electron-userland/electron-builder/blob/master/website/docs/publish.md) describes GitHub Releases and generic HTTPS hosting.

A release pipeline can build and test on Windows, package an x64 NSIS installer, and retain the installer, blockmap, and generated update metadata as reviewable artifacts. Tag-triggered publication can use GitHub Releases. Generic HTTPS hosting is an alternative when the target users cannot reliably reach GitHub. Packaging and publishing are separate actions. A publisher token belongs in CI secrets, never in the packaged application or update configuration.

The application can check for updates after startup and through a menu, report progress, and ask the user to restart only after their configuration edits are saved. It must handle unavailable update hosting without blocking local editing. A production release needs a real publisher configuration and Windows signing credentials. Installer execution and an installed-version update on Windows are the final verification, rather than a Linux packaging check.

The upstream documentation reflects its current default branch. A project must pin compatible package versions and follow those versions' updater APIs, including any required cross-origin header policy.
