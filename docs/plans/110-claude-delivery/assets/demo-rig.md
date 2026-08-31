# The Claude delivery demo rig — handover for plan 113 (u-bind)

Everything below was run live on 2026-08-31 and is copy-paste ready. Do not re-derive it.
**Your acceptance is exactly this rig MINUS step 4** (the hand registration): spawn, wait, send,
and the body appears as a real user turn in the recipient's transcript.

## The trap that cost me the most time — read this first

`PIJ_RS_BIND` is where the **daemon listens**. `PIJ_RS_ADDR` is what the **client talks to**.
`PIJ_RS_STATE_DIR` is where the bearer key AND the sqlite store live (`<state-dir>/pij.sqlite`).

I set only `PIJ_RS_BIND`, so my `spawn` and `list` went to the DEFAULT daemon while my `curl`
went to mine — two different stores. I nearly filed "registration does not persist" as a defect.
**Export all three, every time.**

## 1. Build and start an isolated daemon

```sh
cd <your worktree>
~/.cargo/bin/cargo build --release -p pij-cli          # binary: target/release/pij-rs
export PIJ_RS_STATE_DIR=/tmp/pij113-demo
rm -rf $PIJ_RS_STATE_DIR && mkdir -p $PIJ_RS_STATE_DIR
PIJ_RS_BIND=127.0.0.1:17620 ./target/release/pij-rs daemon --state-dir $PIJ_RS_STATE_DIR \
  > /tmp/pij113-daemon.log 2>&1 &
export PIJ_RS_ADDR=127.0.0.1:17620
```
Pick a port nobody else is on (I used 17610; the real dev daemon is 17600).
"leaving foreign tap on pane …" lines in the log are correct behaviour, not errors.

## 2. Spawn the recipient

```sh
./target/release/pij-rs spawn --harness claude --accept-inbound \
  --name s113-demo --cwd <an ALREADY-TRUSTED directory>
```
Returns the seat id, its pane, and `cross_session_inbound_accept: true`.

**`--accept-inbound` is REQUIRED**: `can_deliver` refuses unless the descriptor carries
`Some(true)`. Without it you will chase a silent `Queued` forever.

**The cwd MUST already be trusted by Claude.** A seat launched into an untrusted folder parks on
the folder-trust modal and writes its socket and peer key but NO session record — so it looks
spawn-successful and is undiscoverable. `--dangerously-skip-permissions` does NOT skip folder
trust. (This is oq-1102, closed RESOLVED-NOT-A-DEFECT; do not "fix" discovery through it.)

## 3. Resolve the recipient's real pid — NOT from the spawn response

```sh
PANE=%NNNN     # from the spawn response
PID=$(python3 -c "
import glob,json
for p in glob.glob('/Users/jordanknight/.claude/sessions/*.json'):
    try: r=json.load(open(p))
    except: continue
    if str(r.get('tmux','')).endswith('.$PANE'): print(r['pid'])")
```
**Do not use `pgrep -P <pane_pid>`** — it returned an MCP child, not claude, and I read that
child's missing record as evidence about claude. Check the session record's `tmux` field, or
check the process NAME.

Two homes exist: `~/.claude` AND `~/.claude-alt`. Glob both before concluding a record is absent.

## 4. THE STEP YOU ARE DELETING — hand registration

```sh
PS=$(python3 -c "
import subprocess,datetime
o=subprocess.run(['ps','-o','lstart=','-p','$PID'],capture_output=True,text=True).stdout.strip()
print(int(datetime.datetime.strptime(o,'%a %d %b %H:%M:%S %Y').strftime('%Y%m%d%H%M%S')))")
KEY=$(cat $PIJ_RS_STATE_DIR/daemon.key)
curl -s -X POST http://$PIJ_RS_ADDR/v1/register \
  -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d "{\"id\":\"<seat id>\",\"harness\":\"claude\",\"folder\":\"<cwd>\",\"pane\":\"$PANE\",
       \"pid\":$PID,\"proc_start\":$PS,\"spawn_id\":\"<from spawn>\",\"relay\":false}"
```
Note the `ps` format is `%a %d %b %H:%M:%S %Y` on this machine (day BEFORE month) — the obvious
`%a %b %d …` raises ValueError.

**Your unit exists to make this step unnecessary.** Its red witness is free: run steps 1-3 and 5
against a `proc: null` seat and watch the send fail. That is your pre-fix red, and it is the same
observation my live tests use.

## 5. Send, and verify from the RECIPIENT

```sh
./target/release/pij-rs send --from <you> --to <seat id> \
  --msg-id demo-1 --body "... Sentinel DEMO-113-A."
```
Expect `{"outcome":"delivered","origin":"injected-to-transport"}`.

Verify in the recipient's own transcript — never from the send response:

```sh
SID=$(python3 -c "import json;print(json.load(open('$HOME/.claude/sessions/$PID.json'))['sessionId'])")
F=$(ls ~/.claude/projects/*/$SID.jsonl | head -1)
python3 - "$F" <<'EOF'
import sys,json
from collections import Counter
c=Counter(); body=None
for ln in open(sys.argv[1]):
    if 'DEMO-113-A' in ln:
        r=json.loads(ln); c[r.get('type')]+=1
        if r.get('type')=='user':
            x=r['message']['content']
            body=x if isinstance(x,str) else ''.join(i.get('text','') for i in x)
print("record types:", dict(c))
if body: print(body.strip()[:400])
EOF
```

### The recipient-side discriminator (use this, not presence/absence)

| outcome | records carrying the sentinel |
|---|---|
| delivered | `queue-operation` + a real `type=user` turn (+ usually an `assistant` reply) |
| held → denied | `type=system` **only** — never a user turn |

Both worlds emit a positive artifact, so no arm rests on silence.

## Byte-exactness, if you need it

40 numbered lines, ~3000 bytes — over the 1022-byte macOS pty chunk where send-keys delivers only
the tail. Truncation then shows up as MISSING LINE NUMBERS rather than as a shorter blob:

```python
nums = sorted(int(m) for m in re.findall(r'line (\d+) of 40', body))
assert nums == list(range(1, 41))
```

## Ready-made live tests you can reuse rather than rewrite

`crates/transport/tests/live_held_observation.rs` (on s110/claude-delivery), all `#[ignore]`d:

| test | env var | proves |
|---|---|---|
| `an_unmarked_message_is_observed_held_on_the_live_wire` | `PIJ_LIVE_CLAUDE_PID` | Held, ~70 ms, no human needed |
| `a_long_body_reaches_an_accepting_seat_without_a_dialog` | `PIJ_LIVE_ACCEPTING_PID` | byte-exact >1022 B |
| `a_declined_message_is_observed_refused_on_the_live_wire` | `PIJ_LIVE_REFUSING_PID` | Refused — needs an operator to click Deny; **ask the prime, do not ask Jordan directly** |

Run: `PIJ_LIVE_CLAUDE_PID=<pid> cargo test -p pij-transport --test live_held_observation -- --ignored --nocapture`

## Wire-level PoC, when you need to see the raw frames

`/Users/jordanknight/pi-hacking/pij/scratch/woodpecker-poc/frommode_poc2.py` — binds its own reply
inbox, advertises a routable `from=`, timestamps every inbound line as a monotonic delta from send.
`python3 frommode_poc2.py --pid <pid> --wait 60 "body"`. Use it when you need to know what the CLI
actually sent, as opposed to what our code made of it.

## Coordination

If s110 lands first, REBASE onto its `crates/transport/src/uds.rs` rather than forking it — the
prime ruled this and it is the file we would collide on. Ping `pij-fatal-woodpecker`; I will tell
you the moment PR #330 merges.

## Everything I got wrong doing this, so you do not repeat it

1. `PIJ_RS_BIND` vs `PIJ_RS_ADDR` — talked to two daemons, nearly filed a phantom defect.
2. `pgrep -P` returned an MCP child, not claude.
3. Read a blank `tmux capture-pane` as "still booting" when the pane was showing a modal.
4. Generalised ONE stuck seat into "Claude writes its record late" — wrong, and the prime had
   already ruled on it before I retracted.
5. Committed on a RED gate because I read "commit succeeded" as "work succeeded".
