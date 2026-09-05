# Queue authority lookup and shared boundary ruling

PM approves existing Queue port addition `claimed_delivery(job_id) -> Result<Option<Job>>` plus SqliteQueue, FakeQueue and directly affected delegating test wrappers. Inspection is read-only and only for running delivery jobs; unknown/pending/terminal return None. Derive authoritative recipient before native tuple/recipient validation and before terminal ack; no bulk scans and no global non-Copilot semantics change. Retain queue atomic ack and test wrong-recipient + stale/native-as-other-harness bypass.

Plan136 PM pij-fellow-whale relayed prime ruling:136 no longer touches crates/daemon/src/delivery/mod.rs;137 owns extension-stream match, no compose baton needed for that file. Vocabulary/interaction/.pi hold-queue exclusions remain. This supersedes only the earlier match-arm baton restriction.
