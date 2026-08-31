# Reviewer packet — u-cutover-controls (wave 7)
Review the u-cutover-controls unit on branch s108/rust-port in THIS worktree against its packet
(packet-u-cutover-controls.md) and ../wave-4/REVIEWER.md's method: behaviour over prose, own
mutations, transcripts are claims not evidence. Priorities: (1) the forceback env var actually
lands a seat on the LEGACY daemon — demand the committed transcript and re-run one leg yourself
against a throwaway instance; (2) resolution order (explicit env wins, else rs) tested as a
TABLE including malformed values erroring LOUDLY with var+value named — never silent fallback;
(3) the addr/state-dir controls work via BOTH CLI and env (verify the table's claims live);
(4) NOTHING touches the production daemon, store, or canonical .pi/extensions — check the
diff's paths against the packet's write fence. Verdict APPROVE/FIX_REQUIRED with findings to
pij-revolutionary-lungfish and pij-dominant-vicuna. Write nothing outside wave-7/reports/.
