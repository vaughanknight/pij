# Jordan ruling — Copilot native delivery consent (2026-09-05, via prime pij-minor-unicorn)

Prime's question to Jordan (one sentence context, one sentence ask):
> Copilot native delivery (137) currently blocks every outgoing message behind a Copilot-specific
> "human draft present" consent gate, while omp now delivers unless you typed in the last 60 s.
> Should Copilot use the same 60 s typing rule as omp — yes or no?

Jordan: **"yes"**

Implementation reading (prime): native-owned Copilot delivery follows the omp policy from plan 136 —
deliver via the extension stream; HOLD only while the human typed within PIJ_TYPING_GRACE_MS (one
resolver: daemon `http::resolve_typing_grace_ms`, on main since be778b9c) using the 136 hold/release
wire (`/v1/hold`, `/v1/release`, spine `delivery.held`/`delivery.released`); never a draft-present-forever
veto; explicit operator Hold retained; unowned Copilot stays queued/refused with no typing.
This is NOT permission for an ungated native send: the native extension must observe typing on the
Copilot side (its own sensor, as omp uses editor.onChange) and drive hold/release exactly as omp does.
