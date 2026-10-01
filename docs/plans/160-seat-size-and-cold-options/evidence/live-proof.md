# Plan 160 live proof (production daemon, after #466 merged as 70e15239)

Run on the canonical checkout at 70e15239 after `just bounce-rs` (ping ok), against 97 live seats.

## `pij list`: timing and ❄ rows
```
pij-rs list run 1: 306 ms, rows 97
pij-rs list run 2: 303 ms, rows 97
pij-rs list run 3: 288 ms, rows 97
pij-rs list run 4: 75 ms, rows 97
GET /v1/seats?sizes=true: 0.017744s
GET /v1/seats?sizes=true: 0.009916s
GET /v1/seats?sizes=true: 0.020216s
shim pij list: 286 ms
```
- The daemon answers `GET /v1/seats?sizes=true` for 97 seats in 10–20 ms once the cursors are warm. That is the plan's "under ~300 ms warm" with room to spare.
- The CLI times above include starting the `pij-rs` and `pij` processes; a warm `pij-rs list` took 75 ms.
- 41 rows are ❄: large, cold and not working. Each is a seat the guard would refuse. First rows:
```
  SEAT                         HARNESS  STATE  CTX   IDLE     CACHE
❄ pij-anxious-toucan           claude   idle   437k  38h53m   cold 37h53m
❄ pij-bad-tochee               claude   idle   472k  6h23m    cold 5h23m
❄ pij-bored-radovid            claude   idle   385k  6h12m    cold 5h12m
❄ pij-considerable-whale       omp      idle   653k  78h21m   cold 78h16m
❄ pij-continued-bolvar         omp      idle   417k  1h24m    cold 1h19m
❄ pij-curly-kiwi               omp      idle   449k  1h48m    cold 1h43m
❄ pij-efficient-artemis        claude   idle   825k  1h16m    cold 16m
❄ pij-exceptional-bug          claude   idle   520k  84h54m   cold 83h54m
❄ pij-exuberant-bug            claude   idle   471k  8h18m    cold 7h18m
❄ pij-fixed-roadrunner         claude   idle   503k  77h31m   cold 76h31m
❄ pij-fun-shrimp               claude   idle   859k  5h29m    cold 4h29m
❄ pij-governing-sparrow        claude   idle   557k  20h45m   cold 19h45m
```
The 7 rows with an unknown `?` CTX are exactly the harnesses that cannot report context: 3 Pi seats (unsupported) and 4 Copilot seats (Copilot records no per-call usage, a documented gap). None of them is ❄:
```
  pij-cheerful-orlandine       pi       idle   ?     ?        ?
  pij-dear-marmot              copilot  idle   ?     39h44m   cold 39h39m
  pij-free-flute               pi       idle   ?     ?        ?
  pij-irregular-apocalypse     pi       idle   ?     ?        ?
  pij-kind-alpaca              copilot  idle   ?     ?        ?
  pij-unchanged-vosill         copilot  idle   ?     38h41m   ?
  pij-worthwhile-sole          copilot  idle   ?     54h15m   cold 54h10m
```
The shim `pij list` printed the same table, with the same 41 ❄ rows.

## `pij state` on a cold large seat
`pij-rs state pij-fun-shrimp` (the tail of the card):
```
FYIs held: 2
session: model claude-opus-5-5 · context 859891/1000000 tokens · cache cold (16174s ago) · read in 0 ms
context 859k / 1M · last call 5h29m ago · cache 1h (cold 4h29m) · 8 compactions
❄ cold-wake guard: a normal send is refused; waking it costs ~$7.68 (--fyi holds it for $0 now)
```

## A real refusal shows the priced options and sends nothing
```
pij send: FAILED — E-RS-COLD-WAKE: ❄ pij-fun-shrimp is cold (859k, idle 5h29m). Options:
  --fyi                  hold for its next turn          $0 now
  --force --reason "…"   wake on its current model       ~$7.68
Estimates at list price: a 1-hour cache write of the whole context, plus about 5 calls.
after: state idle pending fyis 2
spine events in last 2 min: 0
```
The 2 pending FYIs were already held before this check; the refusal added none.
