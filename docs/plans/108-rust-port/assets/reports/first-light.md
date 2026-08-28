# First light — `pij-rs ping` over localhost (tk-d162 / ac-0005)

**Seat**: pij-revolutionary-lungfish (PM) · 2026-08-28 ·
**Toolchain**: rustc 1.98.0 (88d9e12ae) / cargo 1.98.0 (797e8a9bc) · Avail 200Gi ·
**Binary**: `./target/debug/pij-rs` (one artifact, two composition roots)

Not an exit code: a transcript. The claim is that a CLI verb reaches a daemon it
booted, over a real socket, authenticated by a key that did not exist a second
earlier — so the evidence is the session, in order, including the refusals.

## Boot

```
$ ./target/debug/pij-rs daemon --bind 127.0.0.1:7461 --state-dir /tmp/pij-rs-firstlight &
pij-rs daemon: listening on 127.0.0.1:7461 · key /tmp/pij-rs-firstlight/daemon.key (0600) · offline=true

$ ls -l /tmp/pij-rs-firstlight/
-rw------- 1 jordanknight wheel 64 Aug 28 15:44 daemon.key
```

`offline=true` is the default config speaking: every port is a fake, so this
daemon touched no database, no tmux and no network to come up.

## The round trip, and the refusals that prove the lock is real

```
$ ./target/debug/pij-rs ping --addr 127.0.0.1:7461 --state-dir /tmp/pij-rs-firstlight
pij ping: ok — healthy
exit=0

$ ./target/debug/pij-rs ping … --json
{
  "ok": true,
  "command": "pij ping",
  "v": 1,
  "data": {
    "build": "pij-rs 0.1.0",
    "offline": true,
    "status": "healthy"
  }
}
exit=0

$ stat -f "%Sp %N" /tmp/pij-rs-firstlight/daemon.key
-rw------- /tmp/pij-rs-firstlight/daemon.key

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7461/health   # no bearer
401
$ curl -s http://127.0.0.1:7461/health   # the refusal body
{"ok":false,"command":"auth","v":1,"meta":"missing or wrong bearer token — read the per-boot key from <state-dir>/daemon.key and send it as `Authorization: Bearer <key>`"}

$ curl -s -H "Authorization: Bearer $(cat /tmp/pij-rs-firstlight/daemon.key)" http://127.0.0.1:7461/v1/events
{"build":"pij-rs 0.1.0","hello":true,"v":1}
{"v":1,"at":0,"kind":"daemon.forward-compat-probe","seat":null,"payload":"{}"}

$ curl -s -H "Authorization: Bearer wrong-key" -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7461/health
401

=== second daemon on the same port must refuse ===
$ ./target/debug/pij-rs daemon --bind 127.0.0.1:7461 --state-dir /tmp/pij-rs-firstlight2
pij-rs daemon: daemon: could not bind 127.0.0.1:7461 (Address already in use (os error 48)) — another daemon may already hold it
exit=1

=== the key is PER BOOT: restart, old token dies ===
old key: 064d8c230ed5c4d8…
new key: ed3e1b61e5f048ae…
keys differ: yes
$ curl with the OLD key
401
$ curl with the NEW key
200
```

Read in order, that is: the verb works; the same answer is available as the raw
envelope for a machine; the key is 0600 on disk; **no** key is 401 and the refusal
says what to do about it; the event stream opens with `hello` and carries an event
kind this build deliberately does not know; a wrong key is 401.

## Per-boot means per boot

```
old key: 064d8c230ed5c4d8…
new key: ed3e1b61e5f048ae…
keys differ: yes
$ curl with the OLD key   → 401
$ curl with the NEW key   → 200
```

A restart invalidates the previous key. A credential that outlives the process it
authorises is a credential nobody rotates.

## Second daemon

```
$ ./target/debug/pij-rs daemon --bind 127.0.0.1:7461 --state-dir /tmp/pij-rs-firstlight2
pij-rs: daemon: could not bind 127.0.0.1:7461 (Address already in use (os error 48)) — another daemon may already hold it
exit=1
```

The single-instance guard on day one, for free: the OS already refuses the second
bind, so the daemon's job is to say so in words an operator can act on rather than
to invent a lock file that can go stale.

## The same claims, mechanically

`crates/daemon/tests/first_light.rs` — 6 tests: the round trip, the 0600 key, the
401-with-next-action (for a missing AND a wrong token, and on both routes, because
auth is middleware over the whole router), the Hello line plus unknown-kind
survival, the second-bind refusal, and one real store selected per port while the
rest stay fake.

## What this transcript cost, and what that bought

The suite flaked once: `the_key_is_0600_and_exists_before_the_socket_can_be_reached`
passed alone and failed in a full run. Cause: the test named its temp directory
from pid + clock, and on macOS the clock granularity is coarse enough that two
tests starting together got the SAME directory — one cleaned up while the other
was still asserting. The fix is `pij_testkit::fresh_dir`, which carries the
process-local counter `FreshStore` already had. That is DL-004 exactly: the
primitive existed, a test re-derived it slightly wrong, and the difference only
showed under parallelism. Re-ran the full workspace three times: 61 passed,
0 failed, each time.

## Interfaces frozen here for later waves

- `Envelope{ok,command,v,data,meta}`, refused whole when `v` exceeds this build.
- NDJSON: Hello line first, one JSON object per line, unknown kinds decoded as
  `WireEvent::Unknown` and FORWARDED. The asymmetry is deliberate — an envelope is
  a contract this build must satisfy, an event is a fact that happened regardless.
- `Event{v, at, kind, seat, payload}` carries `v` and `at` from its first commit,
  so the reusable event stream (PRD req-0015, `u-events`) lands on it without a
  version bump.
- Auth: `Authorization: Bearer <key>`, key written 0600 BEFORE the socket binds.
