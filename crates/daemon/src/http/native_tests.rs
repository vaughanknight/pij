use std::sync::Arc;
use std::time::Duration;

use pij_core::config::{AdapterChoice, Config};
use pij_core::delivery::delivery_kind;
use pij_core::model::{
    Envelope, Harness, Job, JobId, Pane, PaneProcess, ProcIdentity, SeatDescriptor, SeatId,
};
use pij_core::ports::LivenessPort;
use pij_harnesses::proc::ProcLiveness;
use pij_testkit::FreshStore;
use pij_testkit::fakes::{FakeLiveness, FakeTmux};
use serde_json::{Value, json};

use super::tests::{config, spawn};
use super::{InboxAckRequest, router_with_config};
use crate::delivery::{DeliveryService, InboxClaim, NativeInboxIdentity};

struct HostFixture {
    directory: std::path::PathBuf,
    process: Option<std::process::Child>,
}

impl HostFixture {
    fn spawn() -> Self {
        // This is an OS-observation fixture, never a Copilot/SDK session.
        let mut host = Self {
            directory: pij_testkit::fresh_dir("pij-native-registration-host"),
            process: None,
        };
        let executable = host.directory.join("copilot");
        std::fs::copy("/bin/sleep", &executable).expect("copy inert host fixture");
        #[cfg(target_os = "macos")]
        {
            // Sign only the disposable copy; no signing identity/keychain writes.
            let signed = std::process::Command::new("/usr/bin/codesign")
                .args(["--force", "--sign", "-"])
                .arg(&executable)
                .output()
                .expect("inert host fixture requires macOS /usr/bin/codesign");
            assert!(
                signed.status.success(),
                "cannot ad-hoc sign the inert host fixture: {}",
                String::from_utf8_lossy(&signed.stderr)
            );
        }
        // A short relative path would hide Darwin ps comm truncation.
        assert!(executable.is_absolute());
        assert!(executable.as_os_str().len() > 16);
        host.process = Some(
            std::process::Command::new(&executable)
                .arg("60")
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn()
                .expect("start inert host fixture"),
        );
        host
    }

    async fn identity(&self) -> ProcIdentity {
        let pid = self.process.as_ref().expect("owned host is running").id();
        let proc_start = ProcLiveness::new()
            .proc_start(pid)
            .await
            .expect("observe real host start")
            .expect("owned host must be alive");
        assert!(proc_start > 0);
        ProcIdentity { pid, proc_start }
    }

    async fn kill_and_reap(&mut self, identity: ProcIdentity) {
        let process = self.process.as_mut().expect("owned host is running");
        assert_eq!(process.id(), identity.pid);
        process.kill().expect("kill only the owned inert host");
        process.wait().expect("reap the owned inert host");
        self.process = None;
        assert_ne!(
            ProcLiveness::new().proc_start(identity.pid).await.unwrap(),
            Some(identity.proc_start),
            "the exact old incarnation must be absent or replaced, not merely marked dead"
        );
    }
}

impl Drop for HostFixture {
    fn drop(&mut self) {
        if let Some(process) = self.process.as_mut() {
            let _ = process.kill();
            let _ = process.wait();
        }
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

fn contract_identity() -> (SeatDescriptor, NativeInboxIdentity) {
    let contract: Value = serde_json::from_str(&pij_testkit::fixtures::read(
        "native-extension-contract.json",
    ))
    .expect("designed native registration fixture");
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

async fn native_host_services(store: &FreshStore, folder: &str, panes: &[&str]) -> crate::Services {
    let mut services = sqlite_services(store).await;
    let mut tmux = FakeTmux::new();
    for pane in panes {
        tmux = tmux
            .with_pane(Pane {
                id: (*pane).into(),
                session: "s".into(),
                window: "w".into(),
                title: "native cold resume".into(),
                cursor_x: Some(0),
                cursor_y: Some(0),
            })
            .with_pane_process(
                pane,
                PaneProcess {
                    // Both owned child hosts have this real, observed ancestor.
                    // Only tmux observation is fake; no actual pane is mutated.
                    pid: std::process::id(),
                    cwd: folder.into(),
                },
            )
            .with_attached_tap(pane);
        tmux.arrange_clear_composer(pane);
    }
    let tmux = Arc::new(tmux);
    services.liveness = Arc::new(ProcLiveness::new());
    services.tmux = tmux.clone();
    services.interaction = Arc::new(pij_harnesses::InteractionGate::new(tmux));
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
    services
}

fn native_registration(seat: &SeatDescriptor) -> Value {
    let process = seat.proc.expect("native host has an observed identity");
    json!({
        "id": seat.id,
        "harness": "copilot",
        "harness_session": seat.harness_session,
        "folder": seat.folder,
        "pane": seat.pane,
        "pid": process.pid,
        "proc_start": process.proc_start,
        "relay": false,
        "native_extension_delivery": true,
    })
}

async fn native_http_response(
    request: reqwest::RequestBuilder,
    expected_status: reqwest::StatusCode,
) -> Value {
    let response = request
        .bearer_auth("native-key")
        .timeout(Duration::from_secs(4))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body: Value = response.json().await.unwrap();
    assert_eq!(status, expected_status, "HTTP envelope: {body}");
    assert_eq!(body["ok"], expected_status.is_success(), "{body}");
    if expected_status == reqwest::StatusCode::BAD_REQUEST {
        assert_eq!(body["error"], "refused", "{body}");
        assert!(body.get("data").is_none(), "refusal has no data: {body}");
    }
    body
}

async fn native_http_claims(
    client: &reqwest::Client,
    addr: std::net::SocketAddr,
    seat: &SeatId,
    identity: &NativeInboxIdentity,
) -> Vec<InboxClaim> {
    // Non-waiting claims also prove that an empty new inbox cannot see M1.
    let body = native_http_response(
        client.get(format!("http://{addr}/v1/inbox")).query(&[
            ("seat", seat.to_string()),
            ("wait", "false".into()),
            ("native_session", identity.native_session.clone().unwrap()),
            ("pid", identity.pid.unwrap().to_string()),
            ("proc_start", identity.proc_start.unwrap().to_string()),
        ]),
        reqwest::StatusCode::OK,
    )
    .await;
    assert!(body.get("meta").is_none(), "claim must not be held: {body}");
    serde_json::from_value(body["data"].clone()).unwrap()
}

#[tokio::test]
async fn native_registration_preserves_claimed_host_and_reports_atomic_binding_transitions() {
    let mut first_host = HostFixture::spawn();
    let first_process = first_host.identity().await;
    let store = FreshStore::new();
    let folder = first_host.directory.to_string_lossy().into_owned();
    let services = native_host_services(&store, &folder, &["%native-binding"]).await;
    let registry = services.registry.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    let (mut seat, _) = contract_identity();
    seat.id = "pij-native-binding".into();
    seat.folder = folder;
    seat.pane = Some("%native-binding".into());
    seat.proc = Some(first_process);

    // The fake pane's process is this test executable, not the native host.
    // Ordinary pane normalization must never replace a native claim's tuple.
    let mut invalid = native_registration(&seat);
    invalid["pid"] = json!(std::process::id());
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&invalid),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert!(registry.get(&seat.id).await.unwrap().is_none());

    for expected_binding in ["created", "same"] {
        let body = native_http_response(
            client
                .post(format!("http://{addr}/v1/register"))
                .json(&native_registration(&seat)),
            reqwest::StatusCode::OK,
        )
        .await;
        assert_eq!(body["data"]["binding"], expected_binding);
        assert_eq!(body["data"]["proc_source"], "harness");
        assert_eq!(body["data"]["proc"]["pid"], first_process.pid);
        assert_eq!(body["data"]["native_extension_delivery"], true);
    }

    first_host.kill_and_reap(first_process).await;
    let resumed_host = HostFixture::spawn();
    let resumed_process = resumed_host.identity().await;
    seat.proc = Some(resumed_process);
    let body = native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&seat)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(body["data"]["binding"], "rebound");
    assert_eq!(body["data"]["proc"]["pid"], resumed_process.pid);
    assert_eq!(body["data"]["session"], seat.harness_session.unwrap());
    server.abort();
}

#[tokio::test]
async fn native_sqlite_http_exact_prebind_retires_only_dead_same_session_owner_without_inheriting_work()
 {
    let mut old_host = HostFixture::spawn();
    let old_process = old_host.identity().await;
    let new_host = HostFixture::spawn();
    let new_process = new_host.identity().await;
    assert_ne!(old_process.pid, new_process.pid);
    let (mut first, _) = contract_identity();
    first.proc = Some(old_process);
    first.pane = Some("%137-prebind-old".into());
    let store = FreshStore::new();
    let services = native_host_services(
        &store,
        &first.folder,
        &["%137-prebind-old", "%137-prebind-new", "%137-prebind-wrong"],
    )
    .await;
    let registry = services.registry.clone();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&first)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(registry.get(&first.id).await.unwrap(), Some(first.clone()));
    let mut prebind = SeatDescriptor::new(
        "pij-copilot-explicit-prebind",
        Harness::Copilot,
        first.folder.clone(),
    );
    prebind.pane = Some("%137-prebind-new".into());
    prebind.spawn_id = Some("explicit-new-address-spawn".into());
    // Seed only the existing launcher/preallocation contract, never native attestation.
    registry.put(prebind.clone()).await.unwrap();
    for (seat, body, msg_id) in [
        (
            &first.id,
            "M1 stays with predecessor S1",
            "native-prebind-old-m1",
        ),
        (
            &prebind.id,
            "M2 is the explicitly preallocated S2 task",
            "native-prebind-new-m2",
        ),
    ] {
        let sent = native_http_response(
            client.post(format!("http://{addr}/v1/send")).json(&json!({
                "from": "pij-peer", "to": {"seat": seat}, "body": body, "msg_id": msg_id,
            })),
            reqwest::StatusCode::OK,
        )
        .await;
        assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    }
    let old_job = queue
        .peek(&[delivery_kind(&first.id)])
        .await
        .unwrap()
        .unwrap();
    let new_job = queue
        .peek(&[delivery_kind(&prebind.id)])
        .await
        .unwrap()
        .unwrap();
    let old_payload: Value = serde_json::from_str(&old_job.1.payload).unwrap();
    assert_eq!(
        old_payload["native_target_session"],
        first.harness_session.as_deref().unwrap()
    );
    let new_payload: Value = serde_json::from_str(&new_job.1.payload).unwrap();
    assert!(
        new_payload["native_target_session"].is_null(),
        "prebind task has no invented native session"
    );
    let mut successor = prebind.clone();
    successor.proc = Some(new_process);
    successor.harness_session = first.harness_session.clone();
    successor.native_extension_delivery = true;
    let mut registration = native_registration(&successor);
    registration["spawn_id"] = json!(prebind.spawn_id);
    assert!(registration.get("supersedes").is_none());

    let live_refused = native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&registration),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(live_refused["command"], "pij register");
    assert!(
        live_refused["meta"]
            .as_str()
            .unwrap()
            .contains(first.id.as_str())
    );
    assert_eq!(
        old_host.identity().await,
        old_process,
        "valid prebind cannot steal a live native session"
    );
    assert_eq!(registry.get(&first.id).await.unwrap(), Some(first.clone()));
    assert_eq!(
        registry.get(&prebind.id).await.unwrap(),
        Some(prebind.clone())
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(old_job.clone())
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&prebind.id)]).await.unwrap(),
        Some(new_job.clone())
    );

    old_host.kill_and_reap(old_process).await;
    assert_eq!(new_host.identity().await, new_process);
    for invalid in ["wrong-spawn", "missing-spawn", "wrong-pane"] {
        let mut invalid_registration = registration.clone();
        match invalid {
            "wrong-spawn" => invalid_registration["spawn_id"] = json!("uncorrelated-spawn"),
            "missing-spawn" => {
                invalid_registration
                    .as_object_mut()
                    .unwrap()
                    .remove("spawn_id");
            }
            _ => invalid_registration["pane"] = json!("%137-prebind-wrong"),
        }
        let refused = native_http_response(
            client
                .post(format!("http://{addr}/v1/register"))
                .json(&invalid_registration),
            reqwest::StatusCode::BAD_REQUEST,
        )
        .await;
        assert_eq!(refused["command"], "pij register");
        assert!(
            refused["meta"]
                .as_str()
                .unwrap()
                .starts_with("native Copilot registration refused:")
        );
        assert_eq!(
            registry.get(&first.id).await.unwrap(),
            Some(first.clone()),
            "{invalid} must not retire S1"
        );
        assert_eq!(
            registry.get(&prebind.id).await.unwrap(),
            Some(prebind.clone()),
            "{invalid} must not bind S2"
        );
        assert_eq!(
            queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
            Some(old_job.clone())
        );
        assert_eq!(
            queue.peek(&[delivery_kind(&prebind.id)]).await.unwrap(),
            Some(new_job.clone())
        );
        assert!(queue.claimed_delivery(old_job.0).await.unwrap().is_none());
        assert!(queue.claimed_delivery(new_job.0).await.unwrap().is_none());
    }

    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&registration),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(
        registry.get(&prebind.id).await.unwrap(),
        Some(successor.clone())
    );
    let retired = registry.get(&first.id).await.unwrap().unwrap();
    assert!(retired.tombstoned_at.is_some());
    assert!(!retired.native_extension_delivery);
    assert!(
        retired
            .tombstone_reason
            .as_deref()
            .unwrap()
            .contains(prebind.id.as_str())
    );
    let mut expected_retired = first.clone();
    expected_retired.tombstoned_at = retired.tombstoned_at;
    expected_retired.tombstone_reason = retired.tombstone_reason.clone();
    expected_retired.native_extension_delivery = false;
    assert_eq!(retired, expected_retired);
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(old_job.clone())
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&prebind.id)]).await.unwrap(),
        Some(new_job.clone())
    );
    let identity = NativeInboxIdentity {
        native_session: first.harness_session.clone(),
        pid: Some(new_process.pid),
        proc_start: Some(new_process.proc_start),
    };
    let claims = native_http_claims(&client, addr, &prebind.id, &identity).await;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, new_job.0);
    assert_eq!(
        claims[0].message.body,
        "M2 is the explicitly preallocated S2 task"
    );
    assert_eq!(claims[0].message.to, prebind.id);
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&identity));
    let ack = native_http_response(
        client
            .post(format!("http://{addr}/v1/inbox/ack"))
            .json(&InboxAckRequest {
                seat: prebind.id.clone(),
                job_id: new_job.0,
                native: identity.clone(),
            }),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(ack["data"], new_job.0.0);
    assert!(queue.claimed_delivery(new_job.0).await.unwrap().is_none());
    assert!(
        native_http_claims(&client, addr, &prebind.id, &identity)
            .await
            .is_empty()
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(old_job.clone())
    );
    assert!(queue.claimed_delivery(old_job.0).await.unwrap().is_none());
    server.abort();
}

#[tokio::test]
async fn native_sqlite_http_dead_host_rebinds_same_session_and_reclaims_original_body() {
    let mut old_host = HostFixture::spawn();
    let old_process = old_host.identity().await;
    let new_host = HostFixture::spawn();
    let new_process = new_host.identity().await;
    assert_ne!(old_process.pid, new_process.pid);
    let (mut seat, mut old_identity) = contract_identity();
    seat.proc = Some(old_process);
    seat.pane = Some("%137-old".into());
    old_identity.pid = Some(old_process.pid);
    old_identity.proc_start = Some(old_process.proc_start);
    let new_identity = NativeInboxIdentity {
        pid: Some(new_process.pid),
        proc_start: Some(new_process.proc_start),
        ..old_identity.clone()
    };
    let store = FreshStore::new();
    let services = native_host_services(&store, &seat.folder, &["%137-old", "%137-new"]).await;
    let registry = services.registry.clone();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&seat)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(registry.get(&seat.id).await.unwrap(), Some(seat.clone()));
    let sent = native_http_response(
        client.post(format!("http://{addr}/v1/send")).json(&json!({
            "from": "pij-peer", "to": {"seat": seat.id},
            "body": "M1 original cold-resume body", "msg_id": "native-cold-resume-m1",
        })),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    let (job_id, original_job) = queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .unwrap();
    let old_claims = native_http_claims(&client, addr, &seat.id, &old_identity).await;
    assert_eq!(old_claims.len(), 1);
    assert_eq!(old_claims[0].job_id, job_id);
    assert_eq!(old_claims[0].message.body, "M1 original cold-resume body");
    let running = queue.claimed_delivery(job_id).await.unwrap().unwrap();
    assert_eq!(running.payload, original_job.payload);

    old_host.kill_and_reap(old_process).await;
    assert_eq!(new_host.identity().await, new_process);
    // This is the daemon half of cold resume: runtime selection/FileJournal
    // composition is proven separately, not inferred from this fixed address.
    seat.proc = Some(new_process);
    seat.pane = Some("%137-new".into());
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&seat)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(registry.get(&seat.id).await.unwrap(), Some(seat.clone()));
    assert_eq!(
        queue.claimed_delivery(job_id).await.unwrap(),
        Some(running.clone())
    );
    let refused = native_http_response(
        client
            .post(format!("http://{addr}/v1/inbox/ack"))
            .json(&InboxAckRequest {
                seat: seat.id.clone(),
                job_id,
                native: old_identity.clone(),
            }),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(refused["command"], "pij inbox");
    assert!(
        refused["meta"]
            .as_str()
            .unwrap()
            .starts_with("daemon/native-inbox: native incarnation mismatch:")
    );
    assert_eq!(queue.claimed_delivery(job_id).await.unwrap(), Some(running));

    // Exercise the real retry transition instead of waiting for lease expiry.
    // Registration itself must neither ACK nor rewrite the outstanding claim.
    queue.retry(job_id, Duration::ZERO).await.unwrap();
    let retried = queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retried.0, job_id);
    assert_eq!(retried.1.payload, original_job.payload);
    let claims = native_http_claims(&client, addr, &seat.id, &new_identity).await;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, job_id);
    assert_eq!(claims[0].message, old_claims[0].message);
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&new_identity));
    let ack = native_http_response(
        client
            .post(format!("http://{addr}/v1/inbox/ack"))
            .json(&InboxAckRequest {
                seat: seat.id.clone(),
                job_id,
                native: new_identity.clone(),
            }),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(ack["data"], job_id.0);
    assert!(queue.claimed_delivery(job_id).await.unwrap().is_none());
    assert!(
        native_http_claims(&client, addr, &seat.id, &new_identity)
            .await
            .is_empty()
    );
    server.abort();
}

#[tokio::test]
async fn native_sqlite_http_live_host_refuses_same_session_process_takeover_without_mutation() {
    let old_host = HostFixture::spawn();
    let old_process = old_host.identity().await;
    let new_host = HostFixture::spawn();
    let new_process = new_host.identity().await;
    assert_ne!(old_process.pid, new_process.pid);
    let (mut seat, mut old_identity) = contract_identity();
    seat.proc = Some(old_process);
    seat.pane = Some("%137-live".into());
    old_identity.pid = Some(old_process.pid);
    old_identity.proc_start = Some(old_process.proc_start);
    let store = FreshStore::new();
    let services = native_host_services(&store, &seat.folder, &["%137-live"]).await;
    let registry = services.registry.clone();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&seat)),
        reqwest::StatusCode::OK,
    )
    .await;
    native_http_response(
        client.post(format!("http://{addr}/v1/send")).json(&json!({
            "from": "pij-peer", "to": {"seat": seat.id},
            "body": "M1 live owner keeps this body", "msg_id": "native-live-owner-m1",
        })),
        reqwest::StatusCode::OK,
    )
    .await;
    let queued = queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .unwrap();
    let mut contender = seat.clone();
    contender.proc = Some(new_process);
    let refused = native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&contender)),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(refused["command"], "pij register");
    assert_eq!(
        refused["meta"],
        "native Copilot registration refused: seat id belongs to a different process incarnation"
    );
    assert_eq!(
        old_host.identity().await,
        old_process,
        "old owner is still actually alive"
    );
    assert_eq!(new_host.identity().await, new_process);
    assert_eq!(registry.get(&seat.id).await.unwrap(), Some(seat.clone()));
    assert_eq!(
        queue.peek(&[delivery_kind(&seat.id)]).await.unwrap(),
        Some(queued.clone())
    );
    assert!(queue.claimed_delivery(queued.0).await.unwrap().is_none());
    let claims = native_http_claims(&client, addr, &seat.id, &old_identity).await;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, queued.0);
    assert_eq!(claims[0].message.body, "M1 live owner keeps this body");
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&old_identity));
    server.abort();
}

#[tokio::test]
async fn native_sqlite_http_fresh_session_retires_dead_pane_owner_without_retargeting_m1() {
    let mut old_host = HostFixture::spawn();
    let old_process = old_host.identity().await;
    let mut new_host = HostFixture::spawn();
    let new_process = new_host.identity().await;
    assert_ne!(old_process.pid, new_process.pid);
    let (mut first, mut old_identity) = contract_identity();
    first.proc = Some(old_process);
    first.pane = Some("%137-reused".into());
    old_identity.pid = Some(old_process.pid);
    old_identity.proc_start = Some(old_process.proc_start);
    let store = FreshStore::new();
    let services = native_host_services(&store, &first.folder, &["%137-reused"]).await;
    let registry = services.registry.clone();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&first)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(registry.get(&first.id).await.unwrap(), Some(first.clone()));
    let sent = native_http_response(
        client.post(format!("http://{addr}/v1/send")).json(&json!({
            "from": "pij-peer", "to": {"seat": first.id},
            "body": "M1 retained for dead native session", "msg_id": "native-reused-pane-m1",
        })),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    let retained = queue
        .peek(&[delivery_kind(&first.id)])
        .await
        .unwrap()
        .unwrap();
    let payload: Value = serde_json::from_str(&retained.1.payload).unwrap();
    assert_eq!(
        payload["native_target_session"],
        old_identity.native_session.as_deref().unwrap()
    );

    old_host.kill_and_reap(old_process).await;
    assert_eq!(new_host.identity().await, new_process);
    let mut successor = SeatDescriptor::new(
        "pij-copilot-fresh-process",
        Harness::Copilot,
        first.folder.clone(),
    );
    successor.proc = Some(new_process);
    successor.pane = first.pane.clone();
    successor.harness_session = Some("fresh-native-conversation".into());
    successor.native_extension_delivery = true;
    let new_identity = NativeInboxIdentity {
        native_session: successor.harness_session.clone(),
        pid: Some(new_process.pid),
        proc_start: Some(new_process.proc_start),
    };
    let registration = native_registration(&successor);
    assert!(
        registration.get("supersedes").is_none(),
        "different hosts cannot supersede"
    );
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&registration),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(
        registry.get(&successor.id).await.unwrap(),
        Some(successor.clone())
    );
    let retired = registry.get(&first.id).await.unwrap().unwrap();
    assert!(retired.tombstoned_at.is_some());
    assert!(!retired.native_extension_delivery);
    assert!(
        retired
            .tombstone_reason
            .as_deref()
            .unwrap()
            .contains(successor.id.as_str())
    );
    let mut expected_retired = first.clone();
    expected_retired.tombstoned_at = retired.tombstoned_at;
    expected_retired.tombstone_reason = retired.tombstone_reason.clone();
    expected_retired.native_extension_delivery = false;
    assert_eq!(
        retired, expected_retired,
        "retirement preserves old native ownership facts"
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(retained.clone())
    );
    assert!(queue.claimed_delivery(retained.0).await.unwrap().is_none());
    let refused = native_http_response(
        client.get(claim_url(addr, &first.id, &old_identity)),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(refused["command"], "pij inbox");
    assert!(
        refused["meta"]
            .as_str()
            .unwrap()
            .starts_with("daemon/native-inbox: native-extension-unavailable:")
    );
    assert!(
        native_http_claims(&client, addr, &successor.id, &new_identity)
            .await
            .is_empty()
    );

    let sent = native_http_response(
        client.post(format!("http://{addr}/v1/send")).json(&json!({
            "from": "pij-peer", "to": {"seat": successor.id},
            "body": "M2 belongs only to fresh native session", "msg_id": "native-reused-pane-m2",
        })),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    let (new_job_id, new_job) = queue
        .peek(&[delivery_kind(&successor.id)])
        .await
        .unwrap()
        .unwrap();
    assert_ne!(new_job_id, retained.0);
    let payload: Value = serde_json::from_str(&new_job.payload).unwrap();
    assert_eq!(
        payload["native_target_session"],
        new_identity.native_session.as_deref().unwrap()
    );
    let claims = native_http_claims(&client, addr, &successor.id, &new_identity).await;
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, new_job_id);
    assert_eq!(
        claims[0].message.body,
        "M2 belongs only to fresh native session"
    );
    assert_eq!(claims[0].message.to, successor.id);
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&new_identity));
    let ack = native_http_response(
        client
            .post(format!("http://{addr}/v1/inbox/ack"))
            .json(&InboxAckRequest {
                seat: successor.id.clone(),
                job_id: new_job_id,
                native: new_identity.clone(),
            }),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(ack["data"], new_job_id.0);
    assert!(queue.claimed_delivery(new_job_id).await.unwrap().is_none());
    assert!(
        native_http_claims(&client, addr, &successor.id, &new_identity)
            .await
            .is_empty()
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(retained.clone())
    );
    assert!(queue.claimed_delivery(retained.0).await.unwrap().is_none());

    // A -> B -> A uses a new A2 address. Reusing A's native UUID must not
    // reactivate its retired address or inherit either predecessor's work.
    native_http_response(
        client.post(format!("http://{addr}/v1/send")).json(&json!({
            "from": "pij-peer", "to": {"seat": successor.id},
            "body": "M3 retained for native session B", "msg_id": "native-reused-pane-m3",
        })),
        reqwest::StatusCode::OK,
    )
    .await;
    let retained_b = queue
        .peek(&[delivery_kind(&successor.id)])
        .await
        .unwrap()
        .unwrap();
    let reopened_host = HostFixture::spawn();
    let reopened_process = reopened_host.identity().await;
    assert_ne!(reopened_process.pid, new_process.pid);
    new_host.kill_and_reap(new_process).await;
    let mut reopened = first.clone();
    reopened.proc = Some(reopened_process);
    let refused = native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&reopened)),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(
        refused["meta"],
        "native Copilot registration refused: seat id conflicts with its harness, pane, session, or retirement"
    );
    assert_eq!(
        registry.get(&first.id).await.unwrap(),
        Some(retired.clone())
    );
    assert_eq!(
        registry.get(&successor.id).await.unwrap(),
        Some(successor.clone()),
        "failed old-address recovery must not partially retire B"
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(retained.clone())
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&successor.id)]).await.unwrap(),
        Some(retained_b.clone())
    );

    reopened.id = "pij-copilot-reopened-session".into();
    let reopened_identity = NativeInboxIdentity {
        native_session: first.harness_session.clone(),
        pid: Some(reopened_process.pid),
        proc_start: Some(reopened_process.proc_start),
    };
    assert_eq!(reopened_host.identity().await, reopened_process);
    native_http_response(
        client
            .post(format!("http://{addr}/v1/register"))
            .json(&native_registration(&reopened)),
        reqwest::StatusCode::OK,
    )
    .await;
    assert_eq!(
        registry.get(&reopened.id).await.unwrap(),
        Some(reopened.clone())
    );
    assert_eq!(registry.get(&first.id).await.unwrap(), Some(retired));
    let retired_b = registry.get(&successor.id).await.unwrap().unwrap();
    assert!(retired_b.tombstoned_at.is_some());
    assert!(!retired_b.native_extension_delivery);
    assert!(
        retired_b
            .tombstone_reason
            .as_deref()
            .unwrap()
            .contains(reopened.id.as_str())
    );
    let mut expected_retired_b = successor.clone();
    expected_retired_b.tombstoned_at = retired_b.tombstoned_at;
    expected_retired_b.tombstone_reason = retired_b.tombstone_reason.clone();
    expected_retired_b.native_extension_delivery = false;
    assert_eq!(retired_b, expected_retired_b);
    assert!(
        native_http_claims(&client, addr, &reopened.id, &reopened_identity)
            .await
            .is_empty()
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&first.id)]).await.unwrap(),
        Some(retained.clone())
    );
    assert_eq!(
        queue.peek(&[delivery_kind(&successor.id)]).await.unwrap(),
        Some(retained_b.clone())
    );
    assert!(queue.claimed_delivery(retained.0).await.unwrap().is_none());
    assert!(
        queue
            .claimed_delivery(retained_b.0)
            .await
            .unwrap()
            .is_none()
    );
    server.abort();
}

#[tokio::test]
async fn native_sqlite_http_dead_legacy_and_uncorrelated_prebind_owners_are_not_taken_over() {
    let mut old_host = HostFixture::spawn();
    let old_process = old_host.identity().await;
    let new_host = HostFixture::spawn();
    let new_process = new_host.identity().await;
    assert_ne!(old_process.pid, new_process.pid);
    old_host.kill_and_reap(old_process).await;
    for prebind in [false, true] {
        let (mut owner, _) = contract_identity();
        owner.pane = Some("%137-unverified".into());
        owner.native_extension_delivery = false;
        owner.proc = if prebind { None } else { Some(old_process) };
        if prebind {
            owner.harness_session = None;
            owner.spawn_id = Some("preallocated-spawn-correlation".into());
        }
        let store = FreshStore::new();
        let services = native_host_services(&store, &owner.folder, &["%137-unverified"]).await;
        // Only negative legacy/prebind fixtures are seeded. Positive native
        // attestation always comes from the actual HTTP registration path.
        services.registry.put(owner.clone()).await.unwrap();
        let registry = services.registry.clone();
        let queue = services.queue.clone();
        let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
        let client = reqwest::Client::new();
        native_http_response(
            client.post(format!("http://{addr}/v1/send")).json(&json!({
                "from": "pij-peer", "to": {"seat": owner.id},
                "body": "legacy or prebind context stays put", "msg_id": "native-unverified-m1",
            })),
            reqwest::StatusCode::OK,
        )
        .await;
        let queued = queue
            .peek(&[delivery_kind(&owner.id)])
            .await
            .unwrap()
            .unwrap();
        for same_address in [true, false] {
            let mut contender = SeatDescriptor::new(
                if same_address {
                    owner.id.clone()
                } else {
                    "pij-copilot-unverified-contender".into()
                },
                Harness::Copilot,
                owner.folder.clone(),
            );
            contender.proc = Some(new_process);
            contender.pane = owner.pane.clone();
            contender.harness_session = if same_address {
                owner
                    .harness_session
                    .clone()
                    .or_else(|| Some("prebind-without-correlation".into()))
            } else {
                Some("different-native-unverified-contender".into())
            };
            let refused = native_http_response(
                client
                    .post(format!("http://{addr}/v1/register"))
                    .json(&native_registration(&contender)),
                reqwest::StatusCode::BAD_REQUEST,
            )
            .await;
            assert_eq!(refused["command"], "pij register");
            let reason = if !same_address {
                format!(
                    "process, native session, or pane already belongs to seat `{}`",
                    owner.id
                )
            } else if prebind {
                "pre-bind seat requires its exact spawn id and pane".into()
            } else {
                "seat id belongs to a different process incarnation".into()
            };
            assert_eq!(
                refused["meta"],
                format!("native Copilot registration refused: {reason}")
            );
            assert_eq!(registry.get(&owner.id).await.unwrap(), Some(owner.clone()));
            if !same_address {
                assert!(registry.get(&contender.id).await.unwrap().is_none());
            }
            assert_eq!(
                queue.peek(&[delivery_kind(&owner.id)]).await.unwrap(),
                Some(queued.clone())
            );
            assert!(queue.claimed_delivery(queued.0).await.unwrap().is_none());
        }
        assert_eq!(new_host.identity().await, new_process);
        server.abort();
    }
}

#[tokio::test]
async fn native_sqlite_http_missing_registration_is_retryable_but_noncopilot_identity_is_refused() {
    let store = FreshStore::new();
    let services = sqlite_services(&store).await;
    let registry = services.registry.clone();
    let (seat, identity) = contract_identity();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    let missing = native_http_response(
        client.get(claim_url(addr, &seat.id, &identity)),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(missing["v"], 2);
    assert_eq!(missing["command"], "pij inbox");
    assert_eq!(
        missing["meta"],
        "daemon/native-inbox: native-extension-unavailable: Copilot requires current native registration"
    );
    assert!(registry.get(&seat.id).await.unwrap().is_none());

    let mut noncopilot = seat.clone();
    noncopilot.harness = Harness::Omp;
    noncopilot.native_extension_delivery = false;
    registry.put(noncopilot.clone()).await.unwrap();
    let mismatch = native_http_response(
        client.get(claim_url(addr, &seat.id, &identity)),
        reqwest::StatusCode::BAD_REQUEST,
    )
    .await;
    assert_eq!(mismatch["v"], 2);
    assert_eq!(mismatch["command"], "pij inbox");
    assert_eq!(
        mismatch["meta"],
        "daemon/native-inbox: native incarnation no longer belongs to a current Copilot seat"
    );
    assert_eq!(registry.get(&seat.id).await.unwrap(), Some(noncopilot));
    server.abort();
}

#[tokio::test]
async fn native_http_pane_change_hold_preserves_retryable_wire_discriminator() {
    let response = super::native_inbox_response(crate::delivery::NativeInboxPage {
        claims: Vec::new(),
        held_reason: Some("native-pane-changed".into()),
    });
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let envelope: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        envelope,
        json!({
            "v": 2,
            "ok": true,
            "command": "pij inbox",
            "data": [],
            "meta": "native-consumer-held:native-pane-changed",
        })
    );
}

async fn sqlite_services(store: &FreshStore) -> crate::Services {
    let mut config = Config {
        store_path: store.path(),
        ..Default::default()
    };
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
async fn native_sqlite_http_new_session_supersedes_seat_without_stranding_new_work() {
    let host = HostFixture::spawn();
    let process = host.identity().await;
    let store = FreshStore::new();
    let mut services = sqlite_services(&store).await;
    let (mut first, mut original_identity) = contract_identity();
    first.proc = Some(process);
    first.pane = Some("%137".into());
    original_identity.pid = Some(process.pid);
    original_identity.proc_start = Some(process.proc_start);
    services.liveness = Arc::new(ProcLiveness::new());
    let tmux = Arc::new(
        FakeTmux::new()
            .with_pane(Pane {
                id: "%137".into(),
                session: "s".into(),
                window: "w".into(),
                title: "native rollover".into(),
                cursor_x: Some(0),
                cursor_y: Some(0),
            })
            .with_pane_process(
                "%137",
                PaneProcess {
                    pid: process.pid,
                    cwd: first.folder.clone(),
                },
            )
            .with_attached_tap("%137"),
    );
    tmux.arrange_clear_composer("%137");
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
    let registry = services.registry.clone();
    let queue = services.queue.clone();
    let (addr, server) = spawn(router_with_config(services, config("native-key", &[]))).await;
    let client = reqwest::Client::new();
    let mut registration = json!({
        "id": first.id,
        "harness": "copilot",
        "harness_session": first.harness_session,
        "folder": first.folder,
        "pane": first.pane,
        "pid": process.pid,
        "proc_start": process.proc_start,
        "relay": false,
        "native_extension_delivery": true,
    });
    let registered: Value = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("native-key")
        .json(&registration)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        registered["ok"], true,
        "first native registration: {registered}"
    );
    assert_eq!(registry.get(&first.id).await.unwrap(), Some(first.clone()));

    let sent: Value = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("native-key")
        .json(&json!({
            "from": "pij-peer", "to": {"seat": first.id},
            "body": "M1 original native session", "msg_id": "native-rollover-m1",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    let (old_job_id, old_job) = queue
        .peek(&[delivery_kind(&first.id)])
        .await
        .unwrap()
        .expect("M1 remains pending for the original seat");
    let old_payload: Value = serde_json::from_str(&old_job.payload).unwrap();
    assert_eq!(
        old_payload["native_target_session"],
        original_identity.native_session.as_deref().unwrap()
    );

    // Normal /new keeps the live host/pane but creates S2/N2 and supersedes S1,
    // rather than trying to register a different conversation on the same seat.
    let next_id = SeatId::from("pij-copilot-rollover");
    let next_identity = NativeInboxIdentity {
        native_session: Some("user-created-new-native-session".into()),
        ..original_identity.clone()
    };
    registration["id"] = json!(next_id);
    registration["harness_session"] = json!(next_identity.native_session);
    registration["supersedes"] = json!(first.id);
    let registered: Value = client
        .post(format!("http://{addr}/v1/register"))
        .bearer_auth("native-key")
        .json(&registration)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        registered["ok"], true,
        "checked native supersedes: {registered}"
    );
    let successor = registry.get(&next_id).await.unwrap().unwrap();
    assert_eq!(successor.harness, Harness::Copilot);
    assert_eq!(successor.proc, first.proc);
    assert_eq!(successor.pane, first.pane);
    assert_eq!(successor.harness_session, next_identity.native_session);
    assert!(successor.native_extension_delivery);
    assert!(successor.tombstoned_at.is_none());
    let retired = registry.get(&first.id).await.unwrap().unwrap();
    assert!(retired.tombstoned_at.is_some());
    assert!(
        retired
            .tombstone_reason
            .as_deref()
            .unwrap()
            .contains(next_id.as_str())
    );
    assert!(!retired.native_extension_delivery);
    assert_eq!(retired.harness_session, original_identity.native_session);
    let retained = queue
        .peek(&[delivery_kind(&first.id)])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retained.0, old_job_id);
    assert_eq!(
        retained.1.payload, old_job.payload,
        "supersedes must not re-stamp M1"
    );
    assert!(queue.claimed_delivery(old_job_id).await.unwrap().is_none());

    let sent: Value = client
        .post(format!("http://{addr}/v1/send"))
        .bearer_auth("native-key")
        .json(&json!({
            "from": "pij-peer", "to": {"seat": next_id},
            "body": "M2 new native session", "msg_id": "native-rollover-m2",
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sent["data"]["outcome"]["outcome"], "queued");
    let (new_job_id, new_job) = queue
        .peek(&[delivery_kind(&next_id)])
        .await
        .unwrap()
        .unwrap();
    assert_ne!(new_job_id, old_job_id);
    let new_payload: Value = serde_json::from_str(&new_job.payload).unwrap();
    assert_eq!(
        new_payload["native_target_session"],
        next_identity.native_session.as_deref().unwrap()
    );
    let admitted: Envelope<Vec<InboxClaim>> = client
        .get(claim_url(addr, &next_id, &next_identity))
        .bearer_auth("native-key")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let claims = admitted.data.expect("new seat inbox must be reachable");
    assert_eq!(claims.len(), 1);
    assert_eq!(claims[0].job_id, new_job_id);
    assert_eq!(claims[0].message.body, "M2 new native session");
    assert_eq!(claims[0].message.to, next_id);
    assert_eq!(claims[0].native_consumer.as_ref(), Some(&next_identity));
    assert!(queue.claimed_delivery(new_job_id).await.unwrap().is_some());
    let ack: Value = client
        .post(format!("http://{addr}/v1/inbox/ack"))
        .bearer_auth("native-key")
        .json(&InboxAckRequest {
            seat: next_id.clone(),
            job_id: new_job_id,
            native: next_identity.clone(),
        })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        ack["ok"], true,
        "new native tuple may acknowledge M2: {ack}"
    );
    assert_eq!(ack["data"], new_job_id.0);
    assert!(queue.claimed_delivery(new_job_id).await.unwrap().is_none());
    assert!(
        queue
            .peek(&[delivery_kind(&next_id)])
            .await
            .unwrap()
            .is_none()
    );

    let empty: Envelope<Vec<InboxClaim>> = client
        .get(format!("http://{addr}/v1/inbox"))
        .bearer_auth("native-key")
        .query(&[
            ("seat", next_id.as_str()),
            ("wait", "false"),
            (
                "native_session",
                next_identity.native_session.as_deref().unwrap(),
            ),
            ("pid", &process.pid.to_string()),
            ("proc_start", &process.proc_start.to_string()),
        ])
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        empty
            .data
            .expect("new native inbox remains usable")
            .is_empty()
    );
    let retained = queue
        .peek(&[delivery_kind(&first.id)])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(retained.0, old_job_id);
    assert_eq!(
        retained.1.payload, old_job.payload,
        "M1 stays on S1, not delivered to S2"
    );
    assert!(queue.claimed_delivery(old_job_id).await.unwrap().is_none());
    assert!(tmux.calls().iter().all(|call| !call.starts_with("submit")
        && !call.starts_with("type")
        && !call.starts_with("stage")
        && !call.starts_with("commit")
        && !call.starts_with("send_keys")));
    server.abort();
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
    // Seed a long-lived context hold without a timing-sensitive retry loop.
    // Its attempt count must never turn a wrong-conversation hold into discard.
    let pool = pij_store::open(&store.path()).await.unwrap();
    let seeded = sqlx::query("UPDATE jobs SET attempt = ?1 WHERE id = ?2 AND state = 'pending'")
        .bind(1_000_000_i64)
        .bind(i64::try_from(job_id.0).unwrap())
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(seeded.rows_affected(), 1);
    pool.close().await;

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
    let (retained_id, retained) = services
        .queue
        .peek(&[delivery_kind(&seat.id)])
        .await
        .unwrap()
        .expect("a context hold cannot expire or discard the queued body");
    assert_eq!(retained_id, job_id);
    assert!(retained.attempt >= 1_000_000);
    assert_eq!(retained.payload, queued.payload);
    let retained_payload: Value = serde_json::from_str(&retained.payload).unwrap();
    assert_eq!(retained_payload["body"], "original session work");

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
    assert_eq!(claims[0].message.body, "original session work");
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
