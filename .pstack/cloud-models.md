# Cloud model configuration

# budget: custom (main high; workers medium)

User limits: main coordinator GPT-6.1 Sol (`gpt-6.1-sol`), high reasoning; workers GPT-6.1 Sol (`gpt-6.1-sol`), medium reasoning. Main context budget 300,000 tokens; worker context budget 150,000 tokens. Use compact fresh worker briefs with `fork_turns="none"`, `model="gpt-6.1-sol"`, and `reasoning_effort="medium"`. Do not inherit full history. The runtime does not expose a hard context-window limit or a tool to change the coordinator model; enforce context budgets through scoped reads and checkpoints, and report that limitation. Never exceed these model/reasoning caps.

The upstream Claude/Grok defaults are not available in this environment. For collaboration calls, use the explicit worker model and reasoning limits above. Panel roles use two independent parent-model agents. These are independent checks, not diverse-model checks. The arena cross-judge pool has no different-family candidate; follow the skill's same-family or unavailable-judge fallback and report that limitation.

feature, refactoring: gpt-6.1-sol
bug-fix: gpt-6.1-sol
perf-issue: gpt-6.1-sol
hillclimb: gpt-6.1-sol
judgment and prose: gpt-6.1-sol
hardest tasks: gpt-6.1-sol
how explorer: gpt-6.1-sol
how explainer: gpt-6.1-sol
why investigators: gpt-6.1-sol
why synthesizer: gpt-6.1-sol
reflect tooling: gpt-6.1-sol
reflect judgment, divergent, synthesizer: gpt-6.1-sol
arena runners: gpt-6.1-sol, gpt-6.1-sol
arena cross-judge pool: gpt-6.1-sol
swarm workers: gpt-6.1-sol
architect runners: gpt-6.1-sol, gpt-6.1-sol
interrogate reviewers: gpt-6.1-sol, gpt-6.1-sol
