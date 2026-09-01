# Ruling — adopt IS consent for pij delivery — 2026-09-01

Jordan, verbatim: "iIDGAF if pij as consent, can it just send anyway? it will only ever send to
things reigsterd in pij and adopt is giving consent"

Effect: pij's sender-side gate (`cross_session_inbound_accept`) is satisfied BY REGISTRATION —
adopting/registering a Claude seat into pij IS the consent act. Registration stamps Some(true);
no reading of the recipient's session file is required. Supersedes the read-the-consent-file
mechanism in the first cut of the s121 brief (amended same day, by excision). The recipient
CLI's own crossSessionInbound gate is condition B and is handled by the standing 2026-08-31
"accept ON at all times" ruling via operator settings; pij still never emits from-mode=bypass
(uds.rs:925 pin stands unless Jordan separately rules otherwise).
