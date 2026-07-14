# Original ask — min-release-age=7

Human direction:

> you will be working on min-release-age=7 - making sure we are not open to supply chain attacks

Initial hold:

> just check in, no more

Start authorization:

> have it work in a new worktree please. make sure we still build etc, ensure npm audit is working, this should hopefully catch any issues with zero day

## Bound interpretation

- Enforce or verify a seven-day quarantine for newly published package versions.
- Preserve the repository's build, typecheck, tests, install, and package workflows.
- Keep npm audit enabled and separately proven.
- Do not claim release age detects every zero-day/CVE; it mitigates exposure to
  newly published malicious or compromised releases.
- Research the correct npm/tooling seam before proposing files.
- Cold validate the plan and stop at build configuration.
