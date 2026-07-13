# Original ask — portable Pi models catalog

Human questions and rulings:

> what config is in ~/.pi that i might need on another machine?

> do a detailed survey please. i reckon there are config files in .pi that have been directly edited and installing pi on another machine will not get the benefit of this repo properly

> models needs to be in, auth out, skills out (we create them separately - except for pij skills which have allowance here anyway)

Selected boundary:

> Exclude local provider

Later authorization:

> may start the proposed models-portability item in an isolated worktree

## Required boundary

- Include portable model catalog entries: Copilot overrides/custom entries,
  Sakana, OpenRouter.
- Exclude machine-specific `local` provider.
- Exclude `auth.json`.
- Exclude general skills.
- Exclude sessions/history/trust/cache/runtime state.
- Do not broaden into personal settings or doctor checks without a ruling.
- Cold validate the plan and stop at build configuration.
