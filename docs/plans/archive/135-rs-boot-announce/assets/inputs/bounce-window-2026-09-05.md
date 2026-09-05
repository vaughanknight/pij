BOUNCE WINDOW GRANTED — prime pij-minor-unicorn → PM pij-verbal-silverfish, 2026-09-05

Window: NOW, for one restart. No seat is in `working` state at grant time.

TRAP you must not fall into: `~/.npm-global/bin/pij-rs` is a symlink to
/Users/jordanknight/pi-hacking/pij/target/release/pij-rs — MAIN's binary. `just bounce-rs` run from
your worktree builds YOUR target/ and then restarts MAIN's stale binary: fix not live, greens honest,
live proof meaningless (or accidentally green). Do NOT use the recipe as-is from the worktree.

Do this instead, from /Users/jordanknight/pi-hacking/fs3-rs-boot-announce:
1. ~/.cargo/bin/cargo build --release -p pij-cli            (in the worktree)
2. old=$(lsof -nP -iTCP:7461 -sTCP:LISTEN -t); kill "$old"; sleep 0.5
3. (PIJ_TELEGRAM_ENV="$HOME/.pij/telegram.env" nohup /Users/jordanknight/pi-hacking/fs3-rs-boot-announce/target/release/pij-rs daemon >> "$HOME/.pij-rs/daemon.log" 2>&1 &)
4. Verify ALL of: new pid ≠ old; `ps -o command= -p <new>` shows the WORKTREE path;
   `pij-rs ping` healthy; `ps eww -p <new> | tr ' ' '\n' | grep PIJ_TELEGRAM_ENV` present;
   and the decisive one — a /v1/register response carrying `binding` (curl with ~/.pij-rs/daemon.key,
   or your AC2 gesture) — that field existing on the wire is the proof the NEW daemon is serving.
5. Paste all five into live-proof.md before running AC1-AC3.
Client skew is acceptable for the proof: PATH `pij-rs` stays main's (older) client; `binding` is
additive so old clients ignore it. After merge to main, the main-tree bounce realigns PATH.
Leave the worktree daemon running after the proof; I will realign at merge.
