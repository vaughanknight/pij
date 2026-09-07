//! Plan 139 u2: baseline-compatible HTTP witnesses. These import no new role API.
//! Copy this file plus the u0 contracts onto the baseline for behavioral RED.

use std::net::SocketAddr;
use std::sync::Arc;

use pij_core::config::{AdapterChoice, Adapters, Config};
use pij_core::model::{Event, PaneProcess, ProcIdentity, SeatDescriptor, Seq};
use pij_core::ports::Spine;
use pij_daemon::http::{HttpConfig, router_with_config};
use pij_testkit::FreshStore;
use pij_testkit::fakes::{FakeLiveness, FakeTmux};
use serde_json::{Value, json};

const ROUTES: &str = include_str!("../../../docs/plans/139-rs-governance-port/assets/contracts/governance-routes.json");
const EVENTS: &str = include_str!("../../../docs/plans/139-rs-governance-port/assets/contracts/governance-events.json");
const KEY: &str = "role-contract-key";

fn routes() -> Value { serde_json::from_str(ROUTES).expect("u0 routes") }
fn event_case(id: &str) -> Value {
    let events: Value = serde_json::from_str(EVENTS).expect("u0 events");
    events["events"].as_array().expect("events").iter()
        .find(|case| case["id"] == id).expect("named event").clone()
}
fn role_case() -> Value {
    routes()["routes"].as_array().expect("routes").iter()
        .find(|route| route["path"] == "/v1/role").expect("role route")["cases"][0].clone()
}

struct Fixture {
    addr: SocketAddr,
    server: tokio::task::JoinHandle<()>,
    spine: Arc<dyn Spine>,
    _store: FreshStore,
}
impl Drop for Fixture {
    fn drop(&mut self) { self.server.abort(); }
}
impl Fixture {
    async fn start() -> Self {
        let store = FreshStore::new();
        let config = Config {
            adapters: Adapters { registry: AdapterChoice::Real, spine: AdapterChoice::Real,
                queue: AdapterChoice::Real, ..Adapters::default() },
            store_path: store.path(), ..Config::default()
        };
        let mut services = pij_daemon::build_services(&config, &std::path::Path::new(&store.path()).with_extension("signals"))
            .await.expect("services");
        let template = event_case("seat-put")["decoded_payload"].clone();
        let base_proc: ProcIdentity = serde_json::from_value(template["proc"].clone()).expect("proc");
        let context = routes()["fixture_context"].clone();
        let mut liveness = FakeLiveness::new();
        let mut tmux = FakeTmux::new();
        for (index, (pane, id)) in context["panes"].as_object().expect("panes").iter().enumerate() {
            let mut raw = template.clone();
            raw["id"] = id.clone();
            raw["pane"] = json!(pane);
            raw["role"] = Value::Null;
            raw["parent"] = if id == &context["worker"] { context["parent"].clone() } else { Value::Null };
            let proc = ProcIdentity { pid: base_proc.pid + index as u32, ..base_proc };
            raw["proc"] = serde_json::to_value(proc).expect("proc JSON");
            let seat: SeatDescriptor = serde_json::from_value(raw).expect("fixture seat");
            tmux = tmux.with_pane_process(pane, PaneProcess { pid: proc.pid, cwd: seat.folder.clone() });
            liveness = liveness.with_proc(proc);
            services.registry.put(seat).await.expect("seed seat");
        }
        services.tmux = Arc::new(tmux);
        services.liveness = Arc::new(liveness);
        let spine = services.spine.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("private bind");
        let addr = listener.local_addr().expect("addr");
        let app = router_with_config(services, HttpConfig::local(KEY.to_string()));
        let server = tokio::spawn(async move { axum::serve(listener, app).await.expect("serve"); });
        Self { addr, server, spine, _store: store }
    }
    async fn post(&self, path: &str, body: &Value) -> (u16, Value) {
        let response = reqwest::Client::new().post(format!("http://{}{path}", self.addr))
            .bearer_auth(KEY).json(body).send().await.expect("HTTP POST");
        let status = response.status().as_u16();
        let text = response.text().await.expect("body");
        let body = serde_json::from_str(&text).unwrap_or_else(|_| json!({"undecodable":text}));
        (status, body)
    }
    async fn events(&self) -> Vec<Event> {
        self.spine.tail(None, Seq(0)).await.expect("spine").into_iter()
            .filter(|event| event.kind == event_case("role-set")["frame"]["event"]["kind"])
            .collect()
    }
    async fn assert_read_role(&self, expected: Value) {
        let context = routes()["fixture_context"].clone();
        let response: Value = reqwest::Client::new().get(format!("http://{}/v1/seats?scope=local", self.addr))
            .bearer_auth(KEY).send().await.expect("seats").json().await.expect("roster JSON");
        let seat = response["data"]["seats"].as_array().expect("roster rows").iter()
            .find(|seat| seat["id"] == context["worker"]).expect("worker row");
        assert_eq!(seat["role"], expected, "seats must join seat_roles");
        let (status, card) = self.post("/v1/state", &json!({"id":context["worker"]})).await;
        assert_eq!(status, 200, "{card}");
        assert_eq!(card["data"]["role"], expected, "StateCard must join seat_roles");
    }
}

#[tokio::test]
async fn role_parent_assertion_matches_u0_and_is_readable_via_seats_and_state() {
    let fixture = Fixture::start().await;
    let case = role_case();
    let (status, actual) = fixture.post("/v1/role", &case["request"]).await;
    assert_eq!(status, 200, "baseline witness: {actual}");
    let mut expected = case["response"].clone();
    assert!(actual["data"]["assigned_at"].as_u64().is_some_and(|at| at > 0));
    assert!(actual["data"]["seq"].as_u64().is_some_and(|seq| seq > 0));
    expected["data"]["assigned_at"] = actual["data"]["assigned_at"].clone();
    expected["data"]["seq"] = actual["data"]["seq"].clone();
    assert_eq!(actual, expected);
    fixture.assert_read_role(case["request"]["role"].clone()).await;
    let events = fixture.events().await;
    assert_eq!(events.len(), 1);
    let mut payload = event_case("role-set")["decoded_payload"].clone();
    payload["record"]["assigned_at"] = actual["data"]["assigned_at"].clone();
    assert_eq!(serde_json::from_str::<Value>(&events[0].payload).expect("payload"), payload);
    assert_eq!(events[0].seq.expect("persisted sequence").0, actual["data"]["seq"].as_u64().expect("receipt seq"));
    assert_eq!(events[0].at, actual["data"]["assigned_at"].as_u64().expect("timestamp"));
}

#[tokio::test]
async fn role_outsider_refusal_matches_u0_without_a_write_or_event() {
    let fixture = Fixture::start().await;
    let mut request = role_case()["request"].clone();
    let context = routes()["fixture_context"].clone();
    let pane = context["panes"].as_object().expect("panes").iter()
        .find(|(_, seat)| **seat == context["outsider"]).expect("outsider pane").0;
    request["caller"]["TMUX_PANE"] = json!(pane);
    let (status, response) = fixture.post("/v1/role", &request).await;
    assert_eq!(json!(status), routes()["refusals"]["ownership"]["http_status"]);
    assert_eq!(response, routes()["refusals"]["ownership"]["response"]);
    fixture.assert_read_role(Value::Null).await;
    assert!(fixture.events().await.is_empty());
}

#[tokio::test]
async fn role_self_default_reassertion_and_explicit_null_publish_once_each() {
    let fixture = Fixture::start().await;
    let mut request = role_case()["request"].clone();
    let context = routes()["fixture_context"].clone();
    let pane = context["panes"].as_object().expect("panes").iter()
        .find(|(_, seat)| **seat == context["worker"]).expect("worker pane").0;
    request.as_object_mut().expect("request").remove("seat");
    request["caller"]["TMUX_PANE"] = json!(pane);
    for _ in 0..2 {
        let (status, response) = fixture.post("/v1/role", &request).await;
        assert_eq!(status, 200, "{response}");
        assert_eq!(response["data"]["assigned_by"], context["worker"]);
    }
    request["role"] = Value::Null;
    let (status, response) = fixture.post("/v1/role", &request).await;
    assert_eq!(status, 200, "{response}");
    fixture.assert_read_role(Value::Null).await;
    let events = fixture.events().await;
    assert_eq!(events.len(), 3);
    assert!(events.windows(2).all(|pair| pair[0].seq < pair[1].seq));
    let mut expected = event_case("role-unset")["decoded_payload"].clone();
    expected["actor"] = context["worker"].clone();
    expected["record"]["assigned_by"] = context["worker"].clone();
    expected["record"]["assigned_at"] = response["data"]["assigned_at"].clone();
    assert_eq!(serde_json::from_str::<Value>(&events[2].payload).expect("payload"), expected);
}

#[tokio::test]
async fn role_missing_empty_unknown_flags_and_forged_attribution_refuse_without_events() {
    let fixture = Fixture::start().await;
    let case = role_case();
    let mut missing = case["request"].clone();
    missing.as_object_mut().expect("request").remove("role");
    let mut empty = case["request"].clone(); empty["role"] = json!("   ");
    let mut forged = case["request"].clone(); forged["assigned_by"] = routes()["fixture_context"]["outsider"].clone();
    let mut bad_argv = case["shim_request"].clone(); bad_argv["argv"].as_array_mut().expect("argv").push(json!("--unknown"));
    for request in [missing, empty, forged, bad_argv] {
        let (status, response) = fixture.post("/v1/role", &request).await;
        assert!(status >= 400, "{response}");
        assert_eq!(response["ok"], false, "decodable refusal: {response}");
    }
    assert!(fixture.events().await.is_empty());
    fixture.assert_read_role(Value::Null).await;
}

#[tokio::test]
async fn role_shim_argv_and_typed_requests_share_the_same_contract() {
    let fixture = Fixture::start().await;
    let case = role_case();
    let (status, response) = fixture.post("/v1/role", &case["shim_request"]).await;
    assert_eq!(status, 200, "{response}");
    assert_eq!(response["data"]["role"], case["response"]["data"]["role"]);
    fixture.assert_read_role(case["request"]["role"].clone()).await;
}

#[tokio::test]
async fn adopt_role_assertion_survives_omitted_readoption_and_refused_admission() {
    let fixture = Fixture::start().await;
    let template = event_case("seat-put")["decoded_payload"].clone();
    let mut request = json!({"argv":["adopt",template["pane"],"--harness",template["harness"],"--role",template["role"]]});
    let (status, response) = fixture.post("/v1/adopt", &request).await;
    assert_eq!(status, 200, "baseline adopt --role witness: {response}");
    fixture.assert_read_role(template["role"].clone()).await;
    request["argv"].as_array_mut().expect("argv").truncate(4);
    let (status, response) = fixture.post("/v1/adopt", &request).await;
    assert_eq!(status, 200, "{response}");
    fixture.assert_read_role(template["role"].clone()).await;
    assert_eq!(fixture.events().await.len(), 1, "omitted role is not another assertion");
    request["argv"] = json!(["adopt","%missing","--harness",template["harness"],"--role",template["role"]]);
    let (status, _) = fixture.post("/v1/adopt", &request).await;
    assert!(status >= 400);
    assert_eq!(fixture.events().await.len(), 1, "refused admission cannot publish a role");
}

#[tokio::test]
async fn register_asserted_role_is_durable_and_null_is_not_omission() {
    let fixture = Fixture::start().await;
    let template = event_case("seat-put")["decoded_payload"].clone();
    let context = routes()["fixture_context"].clone();
    // The fixture assigns distinct process ids in canonical pane-key order.
    let index = context["panes"].as_object().expect("panes").iter()
        .position(|(_, id)| id == &context["worker"]).expect("worker index");
    let mut request = json!({"id":template["id"],"harness":template["harness"],"folder":template["folder"],
        "pane":template["pane"],"pid":template["proc"]["pid"].as_u64().expect("pid") + index as u64,
        "proc_start":template["proc"]["proc_start"],"role":template["role"]});
    let (status, response) = fixture.post("/v1/register", &request).await;
    assert_eq!(status, 200, "{response}");
    fixture.assert_read_role(template["role"].clone()).await;
    request.as_object_mut().expect("request").remove("role");
    assert_eq!(fixture.post("/v1/register", &request).await.0, 200);
    assert_eq!(fixture.events().await.len(), 1);
    request["role"] = Value::Null;
    assert!(fixture.post("/v1/register", &request).await.0 >= 400);
    fixture.assert_read_role(template["role"].clone()).await;
    assert_eq!(fixture.events().await.len(), 1);
}

#[tokio::test]
async fn typed_adopt_role_rejects_null_and_duplicate_assertions_without_publication() {
    let fixture = Fixture::start().await;
    let template = event_case("seat-put")["decoded_payload"].clone();
    let mut request = json!({"argv":["adopt",template["pane"],"--harness",template["harness"]],"role":Value::Null});
    assert!(fixture.post("/v1/adopt", &request).await.0 >= 400);
    assert!(fixture.events().await.is_empty());
    request["role"] = template["role"].clone();
    let (status, response) = fixture.post("/v1/adopt", &request).await;
    assert_eq!(status, 200, "{response}");
    fixture.assert_read_role(template["role"].clone()).await;
    request["argv"].as_array_mut().expect("argv").extend([json!("--role"), template["role"].clone()]);
    assert!(fixture.post("/v1/adopt", &request).await.0 >= 400);
    assert_eq!(fixture.events().await.len(), 1);
}
