// Round 2 reviewer probes for plan 154 — appended into registration.rs's test module by apply-r2.py.
// Read-only in intent: every probe prints, asserts nothing it cannot prove.

#[tokio::test]
async fn reviewer_r2_retired_paneless_attribute_shapes() {
    // F001 fix accepts a retired same-session paneless row as the target, then
    // runs the pre-existing "subagent" guard against it. Enumerate which retired
    // attribute shapes that guard still rejects.
    for shape in ["pane", "relay", "native-delivery", "spawn-id", "clean"] {
        let mut old = SeatDescriptor::new(
            "pij-retired-shape",
            Harness::Claude,
            "/isolated/native-registration",
        );
        old.proc = Some(HOST);
        old.harness_session = Some(SESSION.into());
        old.tombstoned_at = Some(154);
        old.tombstone_reason = Some("observed-dead".into());
        match shape {
            "pane" => old.pane = Some("%137".into()),
            "relay" => old.relay = true,
            "native-delivery" => old.native_extension_delivery = true,
            "spawn-id" => old.spawn_id = Some("launch-154".into()),
            _ => {}
        }
        let (service, _registry) = native_service(vec![old.clone()], paneless_liveness()).await;
        let outcome = pull_register(&service, paneless_claim(Harness::Claude), SESSION, false).await;
        match outcome {
            Ok((seat, _)) => println!(
                "PROBE R2a {shape}: RESUMED id={} tombstoned={:?}",
                seat.id, seat.tombstoned_at
            ),
            Err(error) => println!("PROBE R2a {shape}: REFUSED {error}"),
        }
    }
}

#[tokio::test]
async fn reviewer_r2_paneless_dead_host_and_live_host() {
    // My round-1 F001 probes, re-run verbatim against the fix.
    for harness in [Harness::Claude, Harness::Codex, Harness::Copilot] {
        for host in ["dead", "live"] {
            let mut old = SeatDescriptor::new(
                "pij-retired-paneless-probe",
                harness,
                "/isolated/native-registration",
            );
            old.harness_session = Some(SESSION.into());
            old.tombstoned_at = Some(154);
            old.tombstone_reason = Some("observed-dead".into());
            old.parent = Some("pij-original-parent".into());
            old.proc = Some(if host == "live" {
                HOST
            } else {
                ProcIdentity {
                    pid: 9_999,
                    proc_start: 1,
                }
            });
            let (service, _registry) = native_service(vec![old.clone()], paneless_liveness()).await;
            let outcome = pull_register(&service, paneless_claim(harness), SESSION, false).await;
            match outcome {
                Ok((seat, _)) => println!(
                    "PROBE R2b {harness:?}/{host}-host: Ok(id={}, tombstoned={:?}, parent={:?}, harness={:?})",
                    seat.id, seat.tombstoned_at, seat.parent, seat.harness
                ),
                Err(error) => println!("PROBE R2b {harness:?}/{host}-host: {error}"),
            }
        }
    }
}

#[tokio::test]
async fn reviewer_r2_cross_harness_rungs() {
    // My round-1 F002 probes, re-run verbatim: pi on the process rung and
    // claude on the spawn rung, both against a retired omp row.
    for (label, harness) in [("process-rung", Harness::Pi), ("spawn-rung", Harness::Claude)] {
        let mut old = SeatDescriptor::new("pij-retired-cross", Harness::Omp, "/abs/tree");
        old.harness_session = Some("the-original-omp-session".into());
        old.tombstoned_at = Some(154);
        old.tombstone_reason = Some("observed-dead".into());
        old.proc = Some(HOST);
        old.spawn_id = Some("launch-154".into());
        let mut claim = native_claim("pij-retired-cross");
        claim.harness = harness.as_str().to_string();
        claim.folder = "/abs/tree".into();
        claim.pane = None;
        if label == "process-rung" {
            claim.pid = Some(HOST.pid);
            claim.proc_start = Some(HOST.proc_start);
            claim.spawn_id = None;
        } else {
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            claim.spawn_id = Some("launch-154".into());
        }
        let (service, registry) = native_service(vec![old.clone()], native_liveness()).await;
        let outcome = service
            .register_with_harness_session(claim, Some("a-totally-different-session".into()))
            .await;
        match outcome {
            Ok((seat, _)) => println!(
                "PROBE R2c {label} cross-harness: Ok(id={}, harness={:?}, tombstoned={:?})",
                seat.id, seat.harness, seat.tombstoned_at
            ),
            Err(error) => println!("PROBE R2c {label} cross-harness: {error}"),
        }
        println!(
            "PROBE R2c {label} row-unchanged={}",
            registry.get(&old.id).await.unwrap() == Some(old)
        );
    }
}

#[tokio::test]
async fn reviewer_r2_same_harness_rungs_still_lift() {
    // The complement: identical claims, matching harness, must still lift.
    for (label, harness) in [("process-rung", Harness::Omp), ("spawn-rung", Harness::Omp)] {
        let mut old = SeatDescriptor::new("pij-retired-same", harness, "/abs/tree");
        old.harness_session = Some("the-original-omp-session".into());
        old.tombstoned_at = Some(154);
        old.tombstone_reason = Some("observed-dead".into());
        old.proc = Some(HOST);
        old.spawn_id = Some("launch-154".into());
        let mut claim = native_claim("pij-retired-same");
        claim.harness = harness.as_str().to_string();
        claim.folder = "/abs/tree".into();
        claim.pane = None;
        if label == "process-rung" {
            claim.pid = Some(HOST.pid);
            claim.proc_start = Some(HOST.proc_start);
            claim.spawn_id = None;
        } else {
            claim.pid = Some(OTHER_HOST.pid);
            claim.proc_start = Some(OTHER_HOST.proc_start);
            claim.spawn_id = Some("launch-154".into());
        }
        let (service, _registry) = native_service(vec![old.clone()], native_liveness()).await;
        let outcome = service
            .register_with_harness_session(claim, Some("a-totally-different-session".into()))
            .await;
        match outcome {
            Ok((seat, _)) => println!(
                "PROBE R2d {label} same-harness: Ok(id={}, harness={:?}, tombstoned={:?})",
                seat.id, seat.harness, seat.tombstoned_at
            ),
            Err(error) => println!("PROBE R2d {label} same-harness: {error}"),
        }
    }
}
