# Project workflow

Use Lauren Tan (Poteto)'s pstack for every session in this project.

At the start of each session, before substantive work:
1. Read `.pstack/cloud-models.md` for cloud runtime adaptations and model roles.
2. Read `.pstack/skills/poteto-mode/SKILL.md` in full and apply it as the default workflow for nontrivial tasks. Choose and read the matching playbook and any triggered skills.
3. Read the full leaf skill for each principle you apply. Verify the actual result before reporting completion.

Skills are installed in `.agents/skills/` as repository-relative symlinks to the complete vendored source in `.pstack/skills/`. Read `.pstack/skills/<name>/SKILL.md` directly if the session does not expose local skills in its menu. All paths in this file are relative to the repository root.

## Cloud adapter

Pstack's Cursor-specific names describe capabilities, not extra tools installed here. Use the current environment's tools and available model catalog. Map Task to collaboration subagents when delegation is available, and include the absolute poteto-mode path and the selected playbook in each delegate brief. Never claim a distinct-model review when all delegates inherit the same model. Use the available browser, shell, and connector tools for verification. If a required tool or external skill is unavailable, state the limitation and use an equivalent available check where possible.

Read `.pstack/cloud-models.md` instead of `~/.cursor/rules/pstack-models.mdc`. Keep these settings project-local so cloud sessions and fresh checkouts receive the same configuration. User and system instructions take precedence over bundled workflow instructions, including rules for external messages, permissions, deployment, and merging.

## Installation provenance

The official upstream is https://github.com/cursor/plugins/tree/main/pstack. `.pstack/UPSTREAM.json` records the installed revision. The upstream files and MIT license are retained. Do not auto-update during a task. Update deliberately, review changes, and refresh the recorded revision together.
