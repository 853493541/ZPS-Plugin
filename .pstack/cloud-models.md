# Cloud model configuration

# budget: large (xhigh)

Use the parent session model for all roles. This is the project default; the user may change it. Inherit its actual reasoning settings unless the runtime exposes a supported control for the requested budget. A budget label does not change the current chat's model or reasoning settings by itself.

The upstream Claude/Grok defaults are not available in this environment. For collaboration calls, omit model and reasoning overrides to inherit the parent. Panel roles use two independent parent-model agents. These are independent checks, not diverse-model checks. The arena cross-judge pool has no different-family candidate; follow the skill's same-family or unavailable-judge fallback and report that limitation.

feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, inherit-parent
