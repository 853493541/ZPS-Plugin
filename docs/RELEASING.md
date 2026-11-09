# Publish a Windows release

The source, installers, and update files all use the existing `853493541/ZPS-Plugin` repository. The user explicitly approved making it public, including its source history and addon references. The GitHub connection cannot change repository visibility and returns HTTP403 for that setting. A release can be prepared and published in the existing repository while it is private, but anonymous downloads and update checks work only after the owner changes visibility to Public. No separate repository is required.

The first prepared version is `0.1.0`. It is unsigned because no publisher certificate is configured. Do not describe it as a signed or production-certified release. The editable JX, team-buff, and chat formats are supported; opaque target-monitor exports remain read-only. Real game-client import acceptance remains separate from installer tests.

## Build and verify

1. Update the version in `package.json` and `package-lock.json` together for subsequent releases.
2. Verify that `app/services/release.cjs` and `package.json` use the same ZPS-Plugin generic update URL.
3. Commit and push the exact source state. Run the Windows workflow for that branch.

```sh
gh workflow run windows.yml --repo 853493541/ZPS-Plugin --ref codex/jx3box-network-handoff
```

4. Require the tests, native desktop smoke, installer lifecycle, and release-asset verification to pass. Download that run's `windows-desktop` artifact. Do not rebuild the installer during publication.
5. Verify `release-manifest.json` records the expected source commit. Check the installer, blockmap, and `latest.yml` against its digests. `tools/verify-release.mjs` validates version, byte size, SHA-512, filenames, and feed consistency. On the Windows runner it also checks the application archive and sample-file selection.

The package excludes development tests, regression fixtures, the addon reference baseline, and reference screenshots. It includes the six sample configuration files and their manifest. Electron packages contain the application JavaScript required to run the editor; the public repository also exposes its source history as approved by the owner.

## Publish the tested bytes

1. Create a draft `v0.1.0` release in the existing ZPS-Plugin repository.
2. Upload exactly these tested files from the successful build.

- `ZPS-Studio-Setup-0.1.0.exe`
- `ZPS-Studio-Setup-0.1.0.exe.blockmap`
- `latest.yml`
- `release-manifest.json`
- `SHA256SUMS.txt`

3. State the unsigned status, supported features, read-only target-monitor limitation, and source commit in the release notes.
4. Publish the complete draft. Select it as the latest release only after all required assets exist.
5. Verify the public installer and `releases/latest/download/latest.yml` can be downloaded without application account credentials. Compare the downloaded bytes with the tested digests.

Installed applications check the public feed automatically. Download and restart remain user actions. Future updates require a higher application version and a complete tested release at the same public host. Never embed a GitHub token in the application. Unapplied drafts block update installation, and applied unsaved documents must be exported before restart.

An installer/updater check against a local disposable test feed is useful evidence, but it does not replace checking the final public feed after publication.

The installed-upgrade test builds a fixture from the same source with version `0.0.9`, installs it, and upgrades it to the current version through a loopback HTTP feed. It verifies real NSIS replacement and retained user-data/export hashes. It establishes the update mechanism, not compatibility with an independently released historical version.
