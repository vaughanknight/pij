# u-extension matrix — plain Pi

## Isolation

- Host: `/Users/jordanknight/.npm-global/bin/pi`
- Extension: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-extension/.pi/extensions/pij/index.ts`
- Launch isolation: `pi -ne -e <extension>`; inherited `PIJ_*` identity variables removed.
- Throwaway daemon: `pij-rs` from the composed Rust worktree, `127.0.0.1:17461`.
- Throwaway state/store: `/tmp/pij-w3-extension-daemon/{daemon.key,pij.sqlite}`.
- Throwaway legacy home: `/tmp/pij-w3-extension-pi-home` (remained absent after the run).
- The live TS daemon and canonical `/Users/jordanknight/pi-hacking/pij/.pi/**` were not touched.

## Generation and registration

Host output:

```text
pij: detected Rust daemon v1 at 127.0.0.1:17461; registered pij-curious-gibbon
pij-curious-gibbon · rs-v1
```

Authority response from `pij-rs --json ... list`:

```json
{"id":"pij-curious-gibbon","harness":"pi","pane":"%616","proc":{"pid":81308,"proc_start":20260830105815},"folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-extension","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"model":"github-copilot/gpt-5.6-sol-fast-1m","provider":"github-copilot","effort":"high"}
```

The registration contains the complete `(pid, proc_start)` pair and the daemon returned the bound descriptor.

## Pushed turn and reply

Submit:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"pi-matrix-1","outcome":{"outcome":"queued"},"at":1788051613773}}
```

Host received and acted on:

```text
[pij from pij-matrix-sender-pi] Matrix proof: use the pij_send tool to send exactly PI_MATRIX_REPLY to pij-matrix-sender-pi, then answer done.
pij_send -> queued 9dde04fb-adee-446c-9c69-35f30da07fe7 -> pij-matrix-sender-pi
done
```

Daemon event frames:

```json
{"machine":"JordansacStudio.localdomain","cursor":3,"event":{"v":1,"at":1788051613773,"kind":"message.pushed","seat":"pij-curious-gibbon","payload":"{\"msg_id\":\"pi-matrix-1\",\"from\":\"pij-matrix-sender-pi\",\"body\":\"Matrix proof: use the pij_send tool to send exactly PI_MATRIX_REPLY to pij-matrix-sender-pi, then answer done.\"}"}}
{"machine":"JordansacStudio.localdomain","cursor":5,"event":{"v":1,"at":1788051621893,"kind":"message.pushed","seat":"pij-matrix-sender-pi","payload":"{\"msg_id\":\"9dde04fb-adee-446c-9c69-35f30da07fe7\",\"from\":\"pij-curious-gibbon\",\"body\":\"PI_MATRIX_REPLY\"}"}}
```
