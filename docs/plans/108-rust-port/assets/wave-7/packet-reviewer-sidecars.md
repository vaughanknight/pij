# Reviewer packet — u-sidecars (wave 7)
Review the u-sidecars unit on branch s108/rust-port in THIS worktree against its packet
(packet-u-sidecars-final.md) and ../wave-4/REVIEWER.md's method: verify by BEHAVIOUR, apply
mutations yourself, never read the coder's transcript as evidence. Priorities: (1) bg cancel
kills the FULL process group and the cancelled receipt exists only AFTER every pid is observed
gone — run the witness live, then mutate it (skip the await) and watch it fail; (2) each
consumer's LOOP survives a transient failure (E-030) — run the loop test and one mutation;
(3) any count field reports the OBSERVED value, not a configured limit — find one place they
could differ and test it; (4) fix-names-its-path: every fix branch reachable in the shipped
pipeline. Rounds with the coder direct (it is on this branch); verdict APPROVE/FIX_REQUIRED
with findings to pij-revolutionary-lungfish and pij-dominant-vicuna. Write nothing outside
docs/plans/108-rust-port/assets/wave-7/reports/.
