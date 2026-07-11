# s036 fleet canary records
**Keeper**: pij-1khprxk (stream orchestrator)

| Peer | Role | Model/effort claim | Mechanical proof | Nonce | Result |
|------|------|--------------------|------------------|-------|--------|
| pij-1vstguw | coder (dlg-0001) | copilot gpt-5.6-sol xhigh | pid 76867 argv: `--model gpt-5.6-sol --effort xhigh`, `--session-id d820d6d4-…` matches bound session; pane %260 | S036-DLG1-7741 (exact echo, 2026-07-11 ~09:22Z) | **PASS** — identity + input reliability proven before first packet |
| pij-eo0ibv | reviewer (dlg-0001) | copilot claude-opus-4.7-1m-internal xhigh | argv grep on bound session `1c073bbe-…`: `--model claude-opus-4.7-1m-internal --effort xhigh`; pane %261 | S036-REV1-3319 (exact echo, 2026-07-11 ~09:43Z) | **PASS** — cross-model vs coder (opus vs gpt) confirmed mechanically |
