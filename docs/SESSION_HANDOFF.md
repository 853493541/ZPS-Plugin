# Continue API verification in an accessible session

The Windows editor, tests, installers and research are committed to `853493541/ZPS-Plugin` on `main`. Use that checkout; do not rebuild the editor from scratch or overwrite unrelated local work.

Read `AGENTS.md`, `.pstack/cloud-models.md`, and `docs/WORK_STATUS.md`. Inspect active work and local changes first. Coordinator cap is GPT-6.1 Sol high, workers GPT-6.1 Sol medium; context budgets are 300k/150k. Do not publish or deploy.

The supplied screenshot establishes that another session accessed the JX3BOX homepage. It does not establish buff API access. Run the committed diagnostic using that session's normal inherited proxy and CA settings:

```sh
python tools/probe_jx3box.py
```

It separately tests `https://jx3box.com/` and `https://node.jx3box.com/buff/id/12784?client=std&level=1`. A successful buff request must return JSON containing `list`. The script writes the real public response to ignored `artifacts/jx3box-live.json` and returns nonzero if the API request fails. Do not disable proxy routing or TLS validation.

If the API works, inspect the actual response, verify its fields against `app/services/catalog.cjs`, test through the app, and investigate 真传 coverage before claiming complete buff details. Preserve the public response as a sanitized regression fixture where appropriate, including edition, level, source URL and capture date. Keep preset settings separate from metadata. Do not fabricate missing duration, stack or historical-version fields.

If only the homepage works, report the API failure distinctly and continue through the platform's supported network-settings flow. Do not route requests around denied policy. If the diagnostic fails because the agent command cannot reach its inherited proxy, retry with the platform's approved execution permission flow; a proxy 403 remains a policy denial.

The older session's live proxy at 2026-11-09T19:10:14Z reported mode `allowlist`, `allow_all_domains: false`, and no JX3BOX host rule. Available environment tools in that session were read-only status and diagnostics. Changes to a reusable configuration did not demonstrably reach its running proxy. This is a session-specific configuration limitation, not evidence that JX3BOX is down.

Checkpoint verified work and update WORK_STATUS. Do not repeat passed Windows installer checks unless code changes make them relevant.

## Accessible-session result

The continuation on 2026-11-09 verified homepage and buff API access through the inherited proxy using approved execution permission. All 177 supplied JX preset IDs matched `std` level 1 records. The browser preview now uses the production catalog and its smoke checks actual 逃兵 metadata, cache reuse, and an unchanged preset. Public fixtures and a coverage snapshot are committed alongside the rerunnable coverage tool. See `docs/WORK_STATUS.md` and `docs/JX3BOX_API.md` for verification and remaining limits. Historical 真传 equivalence and exhaustive level coverage are still open. Do not repeat the old network diagnosis unless fresh requests fail.

The subsequent icons-and-names change adds automatic metadata display and official icon images. Read the latest WORK_STATUS section before continuing. The 177 sample IDs comprise 160 public names and 17 explicitly labeled internal-name fallbacks. Screenshot paths and deterministic/live browser checks are recorded in JX3BOX_API.md.

The user subsequently authorized publication. Read the newest WORK_STATUS publication section and RELEASING.md. Source remains private; the generic updater targets a proposed public release-only repository. Repository creation is blocked by the GitHub connection's HTTP403, and the user was asked to create/connect that destination. Windows installer and update acceptance are in progress. Do not describe the release as published until public assets and feed have been verified.

Final release preparation passed Windows run 42711968771 at f61b10d, including actual installed upgrade and retained-file hashes. Exact unsigned 0.1.0 assets are in artifacts/release-0.1.0 and the windows-desktop CI artifact. Public publication is blocked only by creation/access to the proposed release-only repository. Read the last WORK_STATUS section for artifact ID, ZIP digest, and the next publication actions.

The user then selected the existing ZPS-Plugin repository and explicitly approved making it public. The separate-release-repository plan is superseded. Runtime and packaging now use ZPS-Plugin releases. A v0.1.0 draft exists against 8bdd6e1, and Windows run42721383886 validates that build. GitHub denied the visibility PATCH with403; the user was asked to set Public manually. Follow the newest WORK_STATUS entry, not the older keep-private plan.
