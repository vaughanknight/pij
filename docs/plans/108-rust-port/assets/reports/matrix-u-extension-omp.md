> **INVALIDATED 2026-08-31 — DO NOT CITE THIS AS PROOF.**
>
> This matrix is green for a surface that has been broken since wave 4. The
> extension cannot register against pij-rs at all: `adapters/daemon-http.ts`
> types `/v1/seats` as an array while the daemon returns
> `FederatedRoster { seats, unavailable }`, so `rust-runtime.ts` dies with
> `seats.find is not a function` and the authority shows no registration.
> `5a2a2c09` updated the Rust client and not the TypeScript one.
>
> The transcript still passed because **a host swallows a dead extension and
> exits 0 with the expected model reply** — reproduced twice, once with the
> extension not loaded at all. So a matrix leg without an **authority
> observation** cannot distinguish *registered* from *never loaded*, and this
> archive is the proof that it never could.
>
> Re-run required against a fixed client, and no leg counts without a
> registration observed at the authority. (E-025: nothing re-ran these after the
> surface moved.)

# u-extension matrix — OMP

## Isolation

- Host: `/Users/jordanknight/.npm-global/bin/omp`.
- Extension: the same `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-extension/.pi/extensions/pij/index.ts` used by the Pi run.
- Launch isolation: `omp --no-extensions -e <extension>`; inherited `PIJ_*` identity variables removed.
- Throwaway daemon: `pij-rs` from the composed Rust worktree, `127.0.0.1:17461`.
- Throwaway state/store: `/tmp/pij-w3-extension-daemon/{daemon.key,pij.sqlite}`.
- Throwaway legacy home: `/tmp/pij-w3-extension-omp-home` (remained absent after the run).
- The live TS daemon and canonical `/Users/jordanknight/pi-hacking/pij/.pi/**` were not touched.

## Generation and registration

Host status named `pij-minimal-koala`; the extension generation probe matched the same authenticated v1 health envelope as Pi.

Authority response from `pij-rs --json ... list`:

```json
{"id":"pij-minimal-koala","harness":"omp","pane":"%616","proc":{"pid":40320,"proc_start":20260830110231},"folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-extension","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"model":"github-copilot/gpt-5.6-sol-fast-1m","provider":"github-copilot","effort":"high"}
```

This run found and fixed a real host discriminator: OMP's launcher runs the extension under Bun, so `process.execPath` is not `omp`. Final detection uses the Bun runtime (plus the existing `OMPCODE`/argv signals), and the authority recorded `harness: "omp"`.

## Pushed turn and reply

Submit:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"omp-matrix-1","outcome":{"outcome":"queued"},"at":1788051835066}}
```

Host received and acted on:

```text
[pij from pij-matrix-sender-pi] Matrix proof: use the pij_send tool to send exactly OMP_MATRIX_REPLY to pij-matrix-sender-pi, then answer done.
pij_send -> queued 2fb039ba-9d93-4f11-baf1-b2756650ae7c -> pij-matrix-sender-pi
done
```

Daemon event frames:

```json
{"machine":"JordansacStudio.localdomain","cursor":10,"event":{"v":1,"at":1788051835066,"kind":"message.pushed","seat":"pij-minimal-koala","payload":"{\"msg_id\":\"omp-matrix-1\",\"from\":\"pij-matrix-sender-pi\",\"body\":\"Matrix proof: use the pij_send tool to send exactly OMP_MATRIX_REPLY to pij-matrix-sender-pi, then answer done.\"}"}}
{"machine":"JordansacStudio.localdomain","cursor":12,"event":{"v":1,"at":1788051840803,"kind":"message.pushed","seat":"pij-matrix-sender-pi","payload":"{\"msg_id\":\"2fb039ba-9d93-4f11-baf1-b2756650ae7c\",\"from\":\"pij-minimal-koala\",\"body\":\"OMP_MATRIX_REPLY\"}"}}
```

## Store restart

The same SQLite store was restarted on `127.0.0.1:17462`; `pij-rs list` returned `count=5`, `pi=true`, `omp=true`. Both matrix registrations survived daemon restart.
