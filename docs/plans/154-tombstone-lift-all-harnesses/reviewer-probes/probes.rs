// Reviewer probes for plan 154 — appended into `mod tests` of
// crates/daemon/src/registration.rs by reviewer-probes/apply.py.
// Run: cargo test -p pij-daemon --lib reviewer_probe -- --nocapture --test-threads 1

    // Bar 2 — the shipped refusal test uses `refused()`, which accepts ANY
    // RegistrationError::Refused. This probe asserts the exact message, so a
    // shape that is refused for an unrelated reason (admission, tuple shape)
    // cannot masquerade as continuity enforcement.
    #[tokio::test]
    async fn reviewer_probe_every_refusal_shape_names_the_tombstone() {
        let mut verdict = Vec::new();
        for shape in [
            "foreign-session",
            "missing-session",
            "empty-spawn",
            "missing-process",
            "foreign-harness",
            "recycled-pid",
        ] {
            let mut old = native_seat("pij-retired-refusal");
            old.harness = Harness::Omp;
            old.native_extension_delivery = false;
            old.tombstoned_at = Some(154);
            old.tombstone_reason = Some("observed-dead".into());
            let mut claim = native_claim(old.id.as_str());
            claim.harness = "omp".into();
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            let mut session = Some("foreign-session".to_string());
            match shape {
                "missing-session" => {
                    old.harness_session = None;
                    session = None;
                }
                "empty-spawn" => {
                    old.spawn_id = Some(String::new());
                    claim.spawn_id = Some(String::new());
                }
                "missing-process" => {
                    old.proc = None;
                    claim.pid = None;
                    claim.proc_start = None;
                }
                "foreign-harness" => {
                    claim.harness = "pi".into();
                    session = old.harness_session.clone();
                }
                "recycled-pid" => {
                    old.proc = Some(ProcIdentity {
                        pid: OTHER_HOST.pid,
                        proc_start: OTHER_HOST.proc_start - 1,
                    });
                }
                _ => {}
            }
            let (service, _) = native_service(vec![old.clone()], native_liveness()).await;
            let error = service
                .register_with_harness_session(claim, session)
                .await
                .expect_err("every shape must be refused");
            verdict.push(format!("{shape}: {error}"));
        }
        for line in &verdict {
            println!("PROBE {line}");
        }
        let expected = "seat pij-retired-refusal is retired (observed-dead, 154); a different session may not take it";
        let off_target: Vec<&String> = verdict
            .iter()
            .filter(|line| !line.ends_with(expected))
            .collect();
        assert!(
            off_target.is_empty(),
            "these shapes are refused by an unrelated guard, so they do not witness the continuity ladder: {off_target:#?}"
        );
    }

    // Bar 1/2 — the paneless selection path. `paneless_target`
    // (registration.rs:1022) filters `tombstoned_at.is_none()`, so a retired
    // paneless address is invisible to its own returning session. AC2's
    // claude/codex witnesses pass an explicit id, so they never reach it.
    #[tokio::test]
    async fn reviewer_probe_retired_paneless_address_is_abandoned_not_resumed() {
        for harness in [Harness::Claude, Harness::Codex, Harness::Copilot] {
            // (b) the realistic shape: the old host died, the sweep retired the
            // row, a new host for the SAME session comes back.
            let (service, registry) = native_service(Vec::new(), paneless_liveness()).await;
            let (first, _) = pull_register(&service, paneless_claim(harness), SESSION, false)
                .await
                .expect("first paneless registration");
            let mut retired = registry.get(&first.id).await.unwrap().unwrap();
            retired.tombstoned_at = Some(154);
            retired.tombstone_reason = Some("observed-dead".into());
            retired.proc = Some(ProcIdentity {
                pid: 9_999,
                proc_start: 1,
            });
            registry.put(retired).await.unwrap();
            let (second, _) = pull_register(&service, paneless_claim(harness), SESSION, false)
                .await
                .expect("the same session returns on a new host");
            let orphan = registry.get(&first.id).await.unwrap().unwrap();
            println!(
                "PROBE dead-host {harness:?}: first={} second={} resumed={} orphan_tombstoned_at={:?}",
                first.id,
                second.id,
                first.id == second.id,
                orphan.tombstoned_at
            );
            assert_eq!(second.tombstoned_at, None, "invariant half (a) holds");

            // (a) the same host is still the recorded owner (manual retirement,
            // recycled-pid sweep): the returning session cannot register at all.
            let (service, registry) = native_service(Vec::new(), paneless_liveness()).await;
            let (first, _) = pull_register(&service, paneless_claim(harness), SESSION, false)
                .await
                .expect("first paneless registration");
            let mut retired = registry.get(&first.id).await.unwrap().unwrap();
            retired.tombstoned_at = Some(154);
            retired.tombstone_reason = Some("observed-dead".into());
            registry.put(retired).await.unwrap();
            let blocked = pull_register(&service, paneless_claim(harness), SESSION, false).await;
            println!(
                "PROBE live-host {harness:?}: {:?}",
                blocked.as_ref().map(|(seat, _)| seat.id.to_string())
            );
            if let Err(error) = blocked {
                println!("PROBE live-host {harness:?} refusal: {error}");
            }
        }
    }

    // Bar 2 — the ladder's spawn and process rungs are NOT harness-gated. Only
    // the session rung is. Probe what that admits.
    #[tokio::test]
    async fn reviewer_probe_spawn_and_process_rungs_cross_harness_boundaries() {
        // (a) foreign harness, foreign session, matching live process tuple.
        let mut old = native_seat("pij-retired-cross");
        old.harness = Harness::Omp;
        old.native_extension_delivery = false;
        old.harness_session = Some("saved-omp-session".into());
        old.proc = Some(OTHER_HOST);
        old.tombstoned_at = Some(154);
        old.tombstone_reason = Some("observed-dead".into());
        let (service, _) = native_service(vec![old.clone()], native_liveness()).await;
        let mut claim = native_claim(old.id.as_str());
        claim.harness = "pi".into();
        claim.pid = Some(OTHER_HOST.pid);
        claim.proc_start = Some(OTHER_HOST.proc_start);
        let lifted = service
            .register_with_harness_session(claim, Some("a-totally-different-session".into()))
            .await;
        println!(
            "PROBE process-rung cross-harness: {:?}",
            lifted.as_ref().map(|(seat, _)| (
                seat.id.to_string(),
                seat.harness,
                seat.tombstoned_at,
                seat.harness_session.clone()
            ))
        );

        // (b) foreign harness, foreign session, matching spawn_id, different process.
        let mut old = native_seat("pij-retired-spawn");
        old.harness = Harness::Omp;
        old.native_extension_delivery = false;
        old.harness_session = Some("saved-omp-session".into());
        old.spawn_id = Some("launch-154".into());
        old.tombstoned_at = Some(154);
        old.tombstone_reason = Some("observed-dead".into());
        let (service, _) = native_service(vec![old.clone()], native_liveness()).await;
        let mut claim = native_claim(old.id.as_str());
        claim.harness = "claude".into();
        claim.spawn_id = Some("launch-154".into());
        claim.pid = Some(OTHER_HOST.pid);
        claim.proc_start = Some(OTHER_HOST.proc_start);
        let lifted = service
            .register_with_harness_session(claim, Some("a-totally-different-session".into()))
            .await;
        println!(
            "PROBE spawn-rung cross-harness: {:?}",
            lifted.as_ref().map(|(seat, _)| (
                seat.id.to_string(),
                seat.harness,
                seat.tombstoned_at,
                seat.harness_session.clone()
            ))
        );
    }
