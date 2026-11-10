# Deliver a verified Windows update

Read the approved delivery scope in `AGENTS.md`. The existing public `853493541/ZPS-Plugin` repository hosts source and updater assets. No separate release repository or visibility change is needed.

The current fresh-environment task is described in `CURSOR_HANDOFF.md`. A package version on a work branch is not a published release.

## Verify the change

1. Increment `package.json` and the lockfile together. Do not bump again when resuming an already-versioned work branch.
2. Run the required unit and relevant interaction checks. Preserve vendor/sample hashes and dataset edit/draft protections.
3. Commit and push the feature branch. Open a reviewed PR to main and require its Windows desktop acceptance to pass.
4. Windows acceptance runs tests, native Electron smoke, NSIS packaging, installed lifecycle, asset verification and installed upgrade/retention.

The installed-upgrade fixture is the current source built with version 0.0.9. Its loopback test proves replacement and retained data, not compatibility with every independently released historical build. Its normal-close mode is observed and forwarded unchanged; never force installer arguments in the harness to make a test pass. Describe separate explicit-restart test coverage honestly.

Installation/uninstallation scripts are restricted to disposable GitHub Actions Windows runners. Do not bypass their guards on a user's computer.

## Publish through the approved workflow

1. After review and PR acceptance, merge the exact expected PR head to main.
2. Require the main push Windows run to pass. PR runs cannot publish.
3. `publish-after-acceptance.yml` then checks out that exact accepted source, checks that it is still main, and invokes the immutable-asset publisher.
4. Wait for publication before moving main with a delivery-receipt commit. A newer main head makes an older acceptance run ineligible.
5. If publication fails, diagnose its logs and retry only the failed publication job when appropriate. Do not rebuild or replace already accepted/published assets just to upload again.

The release must contain exactly the tested installer, blockmap, latest.yml, release-manifest.json and SHA256SUMS.txt. The manifest source, package version, tag, configured feed and asset hashes must agree. The publisher refuses asset replacement. Keep GitHub credentials out of the app.

Generic feed: https://github.com/853493541/ZPS-Plugin/releases/latest/download/latest.yml

After publication, verify public release metadata and an anonymous HTTP200 feed response with the expected version and digest. Only then report delivery. Record acceptance/publication run IDs and verified hashes in WORK_STATUS. A docs-only receipt should use `[skip ci]` to avoid repeating passing application builds.

The installer is unsigned. Existing game-client and opaque-format limits remain separate from release acceptance. Automatic discovery/download and the current install behavior are documented in the latest release notes and WORK_STATUS; do not use historical 0.1.0 manual-publishing instructions as the current workflow.
