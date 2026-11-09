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
