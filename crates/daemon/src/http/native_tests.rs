use std::sync::Arc;
use std::time::Duration;

use pij_core::config::{AdapterChoice, Config};
use pij_core::delivery::delivery_kind;
use pij_core::model::{Envelope, Harness, Job, JobId, Pane, ProcIdentity, SeatDescriptor, SeatId};
use pij_testkit::FreshStore;
use pij_testkit::fakes::{FakeLiveness, FakeTmux};
use serde_json::{Value, json};

use super::tests::{config, spawn};
use super::{InboxAckRequest, router_with_config};
use crate::delivery::{DeliveryService, InboxClaim, NativeInboxIdentity};

const CONTRACT: &str = include_str!(
    "../../../../docs/plans/137-copilot-native-extension/assets/contracts/native-extension.json"
);

fn contract_identity() -> (SeatDescriptor, NativeInboxIdentity) {
    let contract: Value = serde_json::from_str(CONTRACT).expect("frozen wire fixture");
    let registration = &contract["registration"]["request_example"];
    let mut seat = SeatDescriptor::new(
        registration["id"].as_str().unwrap(),
        Harness::Copilot,
        registration["folder"].as_str().unwrap(),
    );
    seat.proc = Some(ProcIdentity {
        pid: registration["pid"].as_u64().unwrap() as u32,
        proc_start: registration["proc_start"].as_u64().unwrap(),
    });
    seat.harness_session = Some(registration["harness_session"].as_str().unwrap().into());
    seat.native_extension_delivery = true;
    let identity = NativeInboxIdentity {
        native_session: seat.harness_session.clone(),
        pid: seat.proc.map(|proc| proc.pid),
        proc_start: seat.proc.map(|proc| proc.proc_start),
    };
    (seat, identity)
}

async fn sqlite_services(store: &FreshStore) -> crate::Services {
    let mut config = Config::default();
    config.store_path = store.path();
    config.adapters.registry = AdapterChoice::Real;
    config.adapters.queue = AdapterChoice::Real;
    config.adapters.spine = AdapterChoice::Real;
    crate::build_services(&config, std::path::Path::new("/tmp/pij-native-test-taps"))
        .await
        .expect("real SQLite registry, queue and spine")
}

fn claim_url(addr: std::net::SocketAddr, seat: &SeatId, identity: &NativeInboxIdentity) -> String {
    let mut url = reqwest::Url::parse(&format!("http://{addr}/v1/inbox")).unwrap();
    let mut query = url.query_pairs_mut();
    query
        .append_pair("seat", seat.as_str())
        .append_pair("wait", "true");
    if let Some(session) = &identity.native_session {
        query.append_pair("native_session", session);
    }
    if let Some(pid) = identity.pid {
        query.append_pair("pid", &pid.to_string());
    }
    if let Some(start) = identity.proc_start {
        query.append_pair("proc_start", &start.to_string());
    }
    drop(query);
    url.into()
}

#[tokio::test]
async fn native_sqlite_http_hold_release_marker_ack_and_duplicate_contract() {
    let store = FreshStore::new();
    let mut services = sqlite_services(&store).await;
    let (mut seat, identity) = contract_identity();
    seat.pane = Some("%137".into());
    services
        .registry
        .put(seat.clone())
        .await
        .expect("fixture attestation");
    services.liveness = Arc::new(FakeLiveness::new().with_proc(seat.proc.unwrap()));
    let tmux = Arc::new(
        FakeTmux::new()
            .with_pane(Pane {
                id: "%137".into(),
                session: "s".into(),
                window: "w".into(),
                title: "native".into(),
                cursor_x: Some(11),
                cursor_y: Some(0),
            })
            .with_attached_tap("%137")
            .with_standing_capture("╰──── hello ─╯"),
    );
    services.tmux = tmux.clone();
    services.interaction = Arc::new(pij_harnesses::InteractionGate::new(tmux.clone()));
    services.delivery = Arc::new(
        DeliveryService::new(
            services.registry.clone(),
            services.queue.clone(),
            services.transport.clone(),
            services.interaction.clone(),
            services.event_bus.clone(),
        )
        .unwrap(),
    );
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    let send = json!({"from":"pij-peer", "to":{"seat":seat.id}, "body":"PIJ_137_NONCE", "msg_id":"poc-137"});
    let sent: Value = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("native-key")
        .json(&send)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");

    let missing: Value = client
        .get(format!("http://{addr}/v1/inbox?seat={}", seat.id))
        .bearer_auth("native-key")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(missing["ok"], false, "unattested legacy request refuses");
    for field in ["pid", "proc_start", "native_session"] {
        let mut wrong = identity.clone();
        match field {
            "pid" => wrong.pid = Some(138),
            "proc_start" => wrong.proc_start = Some(1380),
            _ => wrong.native_session = Some("other-native-session".into()),
        }
        let refused: Value = client
            .get(claim_url(addr, &seat.id, &wrong))
            .bearer_auth("native-key")
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(refused["ok"], false, "{field} mismatch must refuse");
    }
    let held: Envelope<Vec<InboxClaim>> = tokio::time::timeout(
        Duration::from_secs(1),
        client
            .get(claim_url(addr, &seat.id, &identity))
            .bearer_auth("native-key")
            .send(),
    )
    .await
    .expect("held wait=true is prompt")
    .unwrap()
    .json()
    .await
    .unwrap();
    assert!(held.data.unwrap().is_empty());
    assert_eq!(
        held.meta.as_deref(),
        Some("native-consumer-held:human-typing")
    );
    assert!(
        queue
            .peek(&[delivery_kind(&seat.id)])
            .await
            .unwrap()
            .is_some()
    );

    // Release consent, without another send or synthetic readiness event.
    tmux.arrange_clear_composer("%137");
    let admitted: Envelope<Vec<InboxClaim>> = client
        .get(claim_url(addr, &seat.id, &identity))
        .bearer_auth("native-key")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let claims = admitted.data.unwrap();
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].message.body, "PIJ_137_NONCE");
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&identity));
    let job = claims[0].job_id;
    assert!(
        queue.claimed_delivery(job).await.unwrap().is_some(),
        "claim is not ack"
    );

    for acknowledgement in [
        InboxAckRequest {
            seat: "pij-forged-nonnative".into(),
            job_id: job,
            native: Default::default(),
        },
        InboxAckRequest {
            seat: "pij-forged-nonnative".into(),
            job_id: job,
            native: identity.clone(),
        },
        InboxAckRequest {
            seat: seat.id.clone(),
            job_id: job,
            native: NativeInboxIdentity {
                pid: Some(138),
                ..identity.clone()
            },
        },
    ] {
        let rejected: Value = client
            .post(format!("http://{addr}/v1/inbox/ack"))
            .bearer_auth("native-key")
            .json(&acknowledgement)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(rejected["ok"], false);
        assert!(
            queue.claimed_delivery(job).await.unwrap().is_some(),
            "refusal cannot terminalize"
        );
    }
    let ack: Value = client
        .post(format!("http://{addr}/v1/inbox/ack"))
        .bearer_auth("native-key")
        .json(&InboxAckRequest {
            seat: seat.id.clone(),
            job_id: job,
            native: identity.clone(),
        })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(ack["ok"], true);
    assert_eq!(ack["data"], job.0);
    assert!(queue.claimed_delivery(job).await.unwrap().is_none());
    let duplicate: Value = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("native-key")
        .json(&send)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(duplicate["data"]["outcome"]["origin"], "reader-read");
    assert!(
        queue
            .peek(&[delivery_kind(&seat.id)])
            .await
            .unwrap()
            .is_none()
    );
    assert!(tmux.calls().iter().all(|call| !call.starts_with("submit")
        && !call.starts_with("type")
        && !call.starts_with("stage")
        && !call.starts_with("commit")
        && !call.starts_with("send_keys")));
    server.abort();
}

#[tokio::test]
async fn native_sqlite_malformed_claim_is_held_without_ack() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let (seat, identity) = contract_identity();
    services.registry.put(seat.clone()).await.unwrap();
    let job = services
        .queue
        .enqueue(Job {
            kind: delivery_kind(&seat.id),
            serial_key: seat.id.0.clone(),
            payload: "{broken".into(),
            dedupe_key: "malformed-137".into(),
            attempt: 0,
        })
        .await
        .unwrap();
    let result = services
        .delivery
        .claim_native_inbox(&seat.id, false, &identity)
        .await;
    assert!(result.is_err());
    assert!(
        services
            .queue
            .claimed_delivery(job)
            .await
            .unwrap()
            .is_some()
    );
    services
        .delivery
        .acknowledge_inbox(&seat.id, job, &identity)
        .await
        .expect_err("malformed cannot ack");
    assert!(
        services
            .queue
            .claimed_delivery(job)
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn shim_and_direct_service_cannot_bypass_native_claim_or_ack() {
    let store = FreshStore::new();
    let mut services = sqlite_services(&store).await;
    let (seat, identity) = contract_identity();
    services.registry.put(seat.clone()).await.unwrap();
    services.liveness = Arc::new(FakeLiveness::new().with_proc(seat.proc.unwrap()));
    services
        .delivery
        .send("pij-peer".into(), seat.id.clone(), "native only")
        .await
        .unwrap();
    services
        .delivery
        .claim_inbox(&seat.id, false)
        .await
        .expect_err("direct legacy entrypoint refuses");
    let queue = services.queue.clone();
    let service = services.delivery.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    let caller = json!({"PIJ_SESSION_ID":seat.id});
    let claim: Value = client
        .post(format!("http://{addr}/v1/shim/inbox"))
        .bearer_auth("native-key")
        .json(&json!({"argv":["inbox"], "caller":caller}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(claim["ok"], false);
    let jobs = service
        .claim_native_inbox(&seat.id, false, &identity)
        .await
        .unwrap()
        .claims;
    assert_eq!(jobs.len(), 1);
    let ack: Value = client
        .post(format!("http://{addr}/v1/shim/inbox/ack"))
        .bearer_auth("native-key")
        .json(&json!({"job_id":jobs[0].job_id,"caller":caller}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(ack["ok"], false);
    assert!(
        queue
            .claimed_delivery(jobs[0].job_id)
            .await
            .unwrap()
            .is_some()
    );
    service
        .acknowledge_inbox(&seat.id, jobs[0].job_id, &identity)
        .await
        .unwrap();
    assert!(
        queue
            .claimed_delivery(JobId(jobs[0].job_id.0))
            .await
            .unwrap()
            .is_none()
    );
    server.abort();
}

#[tokio::test]
async fn stale_native_ack_cannot_retire_replacement_incarnation_work() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let (mut seat, old_identity) = contract_identity();
    services.registry.put(seat.clone()).await.unwrap();
    services
        .delivery
        .send("pij-peer".into(), seat.id.clone(), "old native claim")
        .await
        .unwrap();
    let claim = services
        .delivery
        .claim_native_inbox(&seat.id, false, &old_identity)
        .await
        .unwrap()
        .claims
        .remove(0);
    seat.proc = Some(ProcIdentity {
        pid: 13800,
        proc_start: 20260905130000,
    });
    seat.harness_session = Some("replacement-session".into());
    services.registry.put(seat.clone()).await.unwrap();
    services
        .delivery
        .acknowledge_inbox(&seat.id, claim.job_id, &old_identity)
        .await
        .expect_err("stale tuple cannot terminalize");
    services
        .delivery
        .acknowledge_inbox(&"pij-fake-omp".into(), claim.job_id, &Default::default())
        .await
        .expect_err("calling it another harness cannot bypass native policy");
    assert!(
        services
            .queue
            .claimed_delivery(claim.job_id)
            .await
            .unwrap()
            .is_some()
    );
}

#[tokio::test]
async fn queued_native_target_holds_different_session_but_allows_same_session_restart() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let (mut seat, original_identity) = contract_identity();
    services.registry.put(seat.clone()).await.unwrap();
    services
        .delivery
        .send("pij-peer".into(), seat.id.clone(), "original session work")
        .await
        .unwrap();
    let (job_id, queued) = services
        .queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .unwrap();
    let stored: Value = serde_json::from_str(&queued.payload).unwrap();
    assert_eq!(
        stored["native_target_session"],
        original_identity.native_session.as_deref().unwrap()
    );

    seat.proc = Some(ProcIdentity {
        pid: 13800,
        proc_start: 20260905130000,
    });
    seat.harness_session = Some("different-conversation".into());
    services.registry.put(seat.clone()).await.unwrap();
    let replacement = NativeInboxIdentity {
        native_session: seat.harness_session.clone(),
        pid: Some(13800),
        proc_start: Some(20260905130000),
    };
    let held = services
        .delivery
        .claim_native_inbox(&seat.id, true, &replacement)
        .await
        .unwrap();
    assert!(held.claims.is_empty());
    let reason = held.held_reason.unwrap();
    assert!(reason.contains(original_identity.native_session.as_deref().unwrap()));
    assert!(reason.contains("resume") && reason.contains("new seat"));
    assert!(
        services
            .queue
            .claimed_delivery(job_id)
            .await
            .unwrap()
            .is_none(),
        "held row returned to pending"
    );
    assert_eq!(
        services
            .queue
            .peek(&[delivery_kind(&seat.id)])
            .await
            .unwrap()
            .unwrap()
            .0,
        job_id
    );

    // Resuming the original native session in a NEW process is permitted.
    seat.harness_session = original_identity.native_session.clone();
    services.registry.put(seat.clone()).await.unwrap();
    let resumed = NativeInboxIdentity {
        native_session: original_identity.native_session,
        ..replacement
    };
    let claims = services
        .delivery
        .claim_native_inbox(&seat.id, false, &resumed)
        .await
        .unwrap()
        .claims;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, job_id);
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&resumed));
    services
        .delivery
        .acknowledge_inbox(&seat.id, job_id, &resumed)
        .await
        .unwrap();
    assert!(
        services
            .queue
            .peek(&[delivery_kind(&seat.id)])
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn unstamped_prebind_task_reaches_first_verified_native_session() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let (seat, identity) = contract_identity();
    let prebind = SeatDescriptor::new(seat.id.clone(), Harness::Copilot, seat.folder.clone());
    services.registry.put(prebind).await.unwrap();
    services
        .delivery
        .send("pij-peer".into(), seat.id.clone(), "initial task")
        .await
        .unwrap();
    let (_, job) = services
        .queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .unwrap();
    let stored: Value = serde_json::from_str(&job.payload).unwrap();
    assert!(stored.get("native_target_session").is_none());
    services.registry.put(seat.clone()).await.unwrap();
    let claims = services
        .delivery
        .claim_native_inbox(&seat.id, false, &identity)
        .await
        .unwrap()
        .claims;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].message.body, "initial task");
    services
        .delivery
        .acknowledge_inbox(&seat.id, claims[0].job_id, &identity)
        .await
        .unwrap();
}

#[tokio::test]
async fn failed_native_consent_sensor_is_explicit_hold_not_permission() {
    let store = FreshStore::new();
    let mut services = sqlite_services(&store).await;
    let (mut seat, identity) = contract_identity();
    seat.pane = Some("%137".into());
    services.registry.put(seat.clone()).await.unwrap();
    let tmux = Arc::new(
        FakeTmux::new()
            .with_clear_composer("%137")
            .script_tap_error("sensor offline"),
    );
    services.interaction = Arc::new(pij_harnesses::InteractionGate::new(tmux.clone()));
    let delivery = DeliveryService::new(
        services.registry.clone(),
        services.queue.clone(),
        services.transport.clone(),
        services.interaction.clone(),
        services.event_bus.clone(),
    )
    .unwrap();
    delivery
        .send("pij-peer".into(), seat.id.clone(), "must remain queued")
        .await
        .unwrap();
    let held = delivery
        .claim_native_inbox(&seat.id, true, &identity)
        .await
        .unwrap();
    assert!(held.claims.is_empty());
    assert!(held.held_reason.unwrap().starts_with("sensor-unavailable:"));
    let claims = delivery
        .claim_native_inbox(&seat.id, false, &identity)
        .await
        .unwrap()
        .claims;
    assert_eq!(
        claims.len(),
        1,
        "restored observation admits without another message"
    );
    assert_eq!(claims[0].message.body, "must remain queued");
}

#[tokio::test]
async fn body_only_http_endpoint_explicitly_refuses_copilot_controls_instead_of_dropping_field() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let (seat, _) = contract_identity();
    services.registry.put(seat.clone()).await.unwrap();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    for command in ["compact", "new", "reload"] {
        let response: Value = client.post(format!("http://{addr}/v1/send")).bearer_auth("native-key")
            .json(&json!({"from":"pij-peer", "to":{"seat":seat.id}, "body":"", "msg_id":command, "command":command}))
            .send().await.unwrap().json().await.unwrap();
        assert_eq!(response["ok"], false);
        assert!(response["meta"].as_str().unwrap().contains("unsupported"));
    }
    assert!(
        queue
            .peek(&[delivery_kind(&seat.id)])
            .await
            .unwrap()
            .is_none()
    );
    server.abort();
}

#[tokio::test]
async fn retired_or_prebind_copilot_cannot_be_relabelled_to_bypass_native_inbox() {
    for retired in [true, false] {
        let store = FreshStore::new();
        let mut services = sqlite_services(&store).await;
        let (mut seat, identity) = contract_identity();
        if !retired {
            seat.proc = None;
            seat.harness_session = None;
            seat.native_extension_delivery = false;
        }
        services.registry.put(seat.clone()).await.unwrap();
        services
            .delivery
            .send(
                "pij-peer".into(),
                seat.id.clone(),
                "must remain native-owned",
            )
            .await
            .unwrap();
        let running = if retired {
            let claim = services
                .delivery
                .claim_native_inbox(&seat.id, false, &identity)
                .await
                .unwrap()
                .claims
                .remove(0);
            services
                .registry
                .tombstone(&seat.id, "native session retired")
                .await
                .unwrap();
            Some(claim.job_id)
        } else {
            None
        };
        let before = services.registry.get(&seat.id).await.unwrap();
        services.liveness = Arc::new(FakeLiveness::new().with_proc(ProcIdentity {
            pid: 13800,
            proc_start: 1380,
        }));
        let registry = services.registry.clone();
        let queue = services.queue.clone();
        let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
        let client = reqwest::Client::new();
        let relabel: Value = client.post(format!("http://{addr}/v1/register")).bearer_auth("native-key")
            .json(&json!({"id":seat.id,"harness":"omp","folder":"/isolated/relabel","pid":13800,"proc_start":1380}))
            .send().await.unwrap().json().await.unwrap();
        let bypass: Value = if let Some(job) = running {
            client
                .post(format!("http://{addr}/v1/inbox/ack"))
                .bearer_auth("native-key")
                .json(&json!({"seat":seat.id,"job_id":job}))
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap()
        } else {
            client
                .get(format!("http://{addr}/v1/inbox?seat={}", seat.id))
                .bearer_auth("native-key")
                .send()
                .await
                .unwrap()
                .json()
                .await
                .unwrap()
        };
        assert_eq!(
            bypass["ok"], false,
            "ordinary relabel must not unlock native claim or ack: {bypass}"
        );
        assert_eq!(relabel["ok"], false);
        assert_eq!(registry.get(&seat.id).await.unwrap(), before);
        if let Some(job) = running {
            assert!(queue.claimed_delivery(job).await.unwrap().is_some());
        }
        assert!(
            queue
                .peek(&[delivery_kind(&seat.id)])
                .await
                .unwrap()
                .is_some()
        );
        server.abort();
    }
}
