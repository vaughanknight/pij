# OMP status bar — pij session name: findings (STOPPED per constraint; no fix applied)

Agent: pij-upset-anglerfish (OMP, main pij checkout). Date 2026-09-01.

## Verdict up front

**Stop condition hit.** The task's own fence applies: *"If the consumer turns out to be
inside pij's tree, STOP and report instead — that becomes a fenced unit."*

The OMP status-bar consumer **is** pij's own extension. No change was made to any file.

Second, and more important: **the root-cause class in the brief is wrong for OMP.** The
Claude break was `--json` refusal. OMP's path never touched `--json` and never shells out
to the `pij` CLI at all — it pushes the id into OMP's native session name via the
extension API. That path is **still present and still works**; it fails **intermittently**,
and when it fails it fails **silently**.

## 1. Where the consumer is (exact file:line)

`.pi/extensions/pij/index.ts` — pij's own extension, two call sites, one per daemon
generation:

- **`.pi/extensions/pij/index.ts:321`** (rs/rust daemon path)
  ```ts
  if (runtimeBin === "omp") await pi.setSessionName(self);
  else ctx.ui.setStatus(PIJ_STATUS_KEY, `${self} · rs-v1`);
  ```
- **`.pi/extensions/pij/index.ts:364-371`** (legacy FsRegistry path), with the comment that
  states the design:
  ```ts
  // OMP's default status line includes the session_name segment but renders
  // extension statuses on a separate row. Mirror the pij identity into that
  // native segment so the peer id remains visible in the actual bar.
  if (runtimeBin === "omp") {
      await pi.setSessionName(self);
  } else {
      ctx.ui.setStatus(PIJ_STATUS_KEY, self);
  }
  ```
- Runtime discrimination: `.pi/extensions/pij/core/discovery.ts:51-57` (`detectPiRuntime`;
  OMP is detected by `OMPCODE=1`, `bun` in `process.versions`, or an `omp` argv basename).
- Introduced by commit **`38bb3218 feat(pij): show pij id in omp status bar via native session_name`**.

Consumer side (OMP, read-only, not modified):

- `dist/cli.js` segment `V_i = { id:"session_name", render(e){ let n = e.session.sessionManager?.getSessionName() || e.previewTitle; … } }`
- Extension API bridge: `setSessionName: async (c) => { await e.sessionManager.setSessionName(c, "user") }`
- `~/.omp/agent/config.yml` → `statusLine.preset: custom`, `leftSegments` includes
  `session_name`. Config is correct; nothing to fix there.

**No `--json` anywhere on this path.** `pij whoami` is never invoked by OMP. So the
plan-114/#338 refusal is *not* the cause here, and the Claude-shaped fix (parse the human
`pij session:` line) has nothing to attach to — there is no shell-out to convert.

## 2. What actually broke — evidence

### 2a. The mechanism works right now (3 live witnesses)

| witness | how started | status bar (tmux capture) |
|---|---|---|
| `pij-effective-wallaby` | bare `omp`, hand-started in tmux | `◫ 4.6%/1M ⟲ · pij-effective-wallaby · ⬢ Opus 5 (1M) · ◒ high · ⑂ detached ?5 · S0.26 ★ 1` |
| `pij-rich-duck` | `pij spawn --harness pi --bin omp --task …` | `◫ 4.6%/1M ⟲ · pij-rich-duck` |
| `pij-peculiar-quail` | `omp --auto-approve --model github-copilot/gpt-5.6-sol-fast --thinking high` (my exact argv) | `◫ 6.9%/400K ⟲ · pij-peculiar-quail · ⬢ GPT-5.6 Sol Fast (Internal only) · ◒ high · ⑂ detached ?5 · (sub)` |

Also covers the brief's negative case: an OMP with no pij seat simply renders no
`session_name` segment (`visible:!1` when the name is empty) — empty, not broken.

### 2b. But it silently misses — including in this very session

My own pane, same binary, same repo, same config:

```
◫ 11.2%/1M ⟲ · Try again · ⬢ Opus 5 (1M) · ◒ high · ⑂ detached ?5 · S2.26 ★ 1
```

`Try again` is OMP's LLM-generated auto-title, not my seat id (`pij-upset-anglerfish`).

Session file `~/.omp/agent/sessions/-pi-hacking-pij/2026-09-01T08-10-53-580Z_01a05c05-….jsonl`:

```json
{"type":"title_change","id":"e6a6612c","parentId":"e5749071","timestamp":"2026-09-01T08:11:08.650Z","title":"Try again","source":"auto"}
```

No `previousTitle` field ⇒ **there was no prior title at all**; pij never set one.
Corroborated by `~/.omp/logs/omp.2026-09-01.49592.log:41-43` — `title-generator: start` ran,
which OMP only does when `sessionManager.getSessionName()` is still empty.

The extension itself **did** boot in this session: the `pij_send` tool executed successfully
(`queued 4a6da594-… -> pij-still-weasel`), which requires the module-scoped `session` to be
assigned — i.e. `session_start` reached at least `index.ts:318`. So the handler ran and the
name still did not land.

### 2c. Frequency — census of 279 OMP session files

Reading the first `title` record + first `title_change` of every session since 2026-08-30:

```
2026-09-01T03-46-04  pij=True  dtTitleChange=0.138s src=user   'pij-bottom-limpet'
2026-09-01T04-41-58  pij=True  dtTitleChange=0.351s src=user   'pij-precise-iguana'
2026-09-01T05-16-25  pij=True  dtTitleChange=0.179s src=user   'pij-mutual-panda'
2026-09-01T06-01-34  pij=True  dtTitleChange=0.293s src=user   'pij-nutritious-gecko'
2026-09-01T06-02-53  pij=True  dtTitleChange=0.125s src=user   'pij-still-weasel'
2026-09-01T07-24-49  pij=True  dtTitleChange=0.140s src=user   'pij-xenophobe'
2026-09-01T07-25-55  pij=True  dtTitleChange=0.148s src=user   'pij-handicapped-lark'
2026-09-01T08-08-00  pij=False dtTitleChange=77.03s src=auto   'Read packet and send numbered plan'
2026-09-01T08-10-35  pij=False dtTitleChange=70.08s src=auto   'Run inbox command and pull updates'
2026-09-01T08-10-53  pij=False dtTitleChange=15.07s src=auto   'Try again'          <- me
2026-09-01T08-14-13  pij=True  dtTitleChange=0.133s src=user   'pij-effective-wallaby'
```

The distribution is **bimodal, not graded**: a session either gets its pij name at
**~0.13–0.35 s** (before the first user message), or it never gets one and the LLM
auto-titler wins tens of seconds later. There is no middle. Same pattern on 2026-08-31
(worked: `pij-empirical-caribou`, `pij-collective-locust`, `pij-evolutionary-chinchilla`,
`pij-shocked-termite`; missed: `Adopt unit u-adopt implementation`, `Review pij plan 111
packet`, `Re-derive M6 against 88ea9cc8`, and others).

**Configuration is ruled out.** Argv, model, thinking level, `--auto-approve`, spawned-vs-
hand-started, and cwd all vary *within* both buckets — and the exact-argv reproduction
(`pij-peculiar-quail`) succeeded. It is a startup race, not a setting.

### 2d. Why the failure is invisible — the real defect

OMP's bridge is `setSessionName: async (c) => { await e.sessionManager.setSessionName(c,"user") }`,
and `SessionManager.setSessionName` **returns `boolean`** with at least three silent-`false`
early exits:

```js
async setSessionName(e, t = "auto", n) {
  if (this.#x) return !1;                       // manager not in a settable state
  if (this.#l === "user" && t === "auto") return !1;
  let s = Dt.#Ie(e); if (!s) return !1;         // sanitised to empty
  …
}
```

The OMP bridge **discards that boolean**, so `pi.setSessionName()` resolves `void` whether it
worked or not. pij then does nothing else: `index.ts:321` and `:368` are fire-and-forget, and
crucially the `else` branch (`ctx.ui.setStatus(PIJ_STATUS_KEY, self)`) is **skipped entirely**
on OMP. Result: when the native segment does not take, the id has **no other surface** — no
status row, no warning, no log line. That is exactly what Jordan is seeing.

Note the interaction that makes it stick: once the auto-titler lands `source:"auto"`, a later
pij call with `source:"user"` *would* still win — but pij never calls again. The publication
is one-shot at `session_start`.

## 3. Recommended fix (NOT applied — fenced unit)

Scope: `.pi/extensions/pij/index.ts` only, both call sites (`:321`, `:364-371`).

1. **Verify, don't assume.** After `await pi.setSessionName(self)`, read back
   `pi.getSessionName()`. `getSessionName` is on the same `ExtensionAPI`
   (`dist/types/extensibility/extensions/types.d.ts:989`), so this needs no new capability.
2. **Always keep a second surface.** Stop making the OMP branch exclusive — set
   `ctx.ui.setStatus(PIJ_STATUS_KEY, self)` on OMP too (or at least whenever the read-back
   does not equal `self`). Today the `else` makes the native segment a single point of
   failure.
3. **Re-assert once the session is definitely live.** Add a cheap idempotent re-publication on
   the first `turn_end` (or on OMP's session-name-changed signal) so a lost startup write
   self-heals on the next turn instead of persisting for the whole session.
4. **Leave `pij whoami --json` alone.** Correct as-is: the rs refusal is by design, and this
   path never used it. Do not import the Claude-shaped text-parsing fix here — there is no
   subprocess to parse.

Non-goal: touching OMP itself. `~/.omp/agent/config.yml` and the `session_name` segment are
both correct; the loss is upstream of them.

## 4. Diff

**None.** No files were modified. Repo `/Users/jordanknight/pi-hacking/pij`, branch unchanged,
working tree untouched by this task apart from this report file.

## 5. Reproduction / verification commands used

```bash
readlink -f "$(which omp)"                      # oh-my-pi dist — contains no "pij" string
cat ~/.omp/agent/config.yml                     # statusLine.preset=custom, leftSegments has session_name
pij whoami                                      # pij session: pij-upset-anglerfish   (human line intact)
tmux capture-pane -p -t "$TMUX_PANE" | tail -3  # bar shows "Try again", not the seat id
tmux new-window -d -n ompwit -c /Users/jordanknight/pi-hacking/pij 'omp'
pij spawn --harness pi --bin omp --task "Say only: witness. Then stop."
tmux new-window -d -n ompw2  -c /Users/jordanknight/pi-hacking/pij \
  'omp --auto-approve --model github-copilot/gpt-5.6-sol-fast --thinking high'
```
Census script: reads the leading `title` record and first `title_change` of all 279 files under
`~/.omp/agent/sessions/*/*.jsonl`.

Witness panes (`ompwit`, `ompw2`) and the spawned peer pane `%2175` were killed after capture.
