use pij_core::events::EventFilter;
use pij_core::ports::Spine;
use pij_testkit::FreshStore;
use pij_testkit::fakes::{FakeRegistry, FakeSpine};
use tokio_stream::StreamExt;

use super::*;

const ROUTES: &str = include_str!("../../../../docs/plans/139-rs-governance-port/assets/contracts/governance-routes.json");
const EVENTS: &str = include_str!("../../../../docs/plans/139-rs-governance-port/assets/contracts/governance-events.json");

fn routes() -> Value { serde_json::from_str(ROUTES).expect("u0 routes") }
fn event_case(id: &str) -> Value {
    let events: Value = serde_json::from_str(EVENTS).expect("u0 events");
    events["events"].as_array().expect("events").iter().find(|case| case["id"] == id).expect("event").clone()
}

struct Fixture {
    service: RoleService,
    registry: Arc<FakeRegistry>,
    spine: Arc<FakeSpine>,
    bus: Arc<EventBus>,
    store: SqliteOrchestration,
    _directory: FreshStore,
}
impl Fixture {
    async fn new() -> Self {
        let directory = FreshStore::new();
        let pool = pij_store::open(&directory.path()).await.expect("isolated store");
        let store = SqliteOrchestration::new(pool);
        let context = routes()["fixture_context"].clone();
        let template = event_case("seat-put")["decoded_payload"].clone();
        let worker: SeatDescriptor = serde_json::from_value(template.clone()).expect("worker");
        let mut parent = worker.clone();
        parent.id = SeatId::from(context["parent"].as_str().expect("parent"));
        parent.parent = None;
        let registry = Arc::new(FakeRegistry::new().with_seat(worker).with_seat(parent));
        let spine = Arc::new(FakeSpine::new());
        let bus = Arc::new(EventBus::new(spine.clone(), 16).expect("bus"));
        let at = context["at_ms"].as_u64().expect("at");
        let service = RoleService::new(registry.clone(), store.clone(), bus.clone())
            .with_clock(Arc::new(move || Ok(at)));
        Self { service, registry, spine, bus, store, _directory: directory }
    }
    fn ids() -> (SeatId, SeatId, String) {
        let record = routes()["fixture_context"]["records"]["role"].clone();
        (SeatId::from(record["assigned_by"].as_str().expect("actor")),
            SeatId::from(record["seat"].as_str().expect("seat")),
            record["role"].as_str().expect("role").to_string())
    }
}

#[tokio::test]
async fn explicit_role_and_unset_publish_u0_payloads_to_live_subscribers() {
    let fixture = Fixture::new().await;
    let (actor, seat, role) = Fixture::ids();
    let mut subscriber = fixture.bus.subscribe(None, EventFilter::default()).await.expect("subscribe");
    for (case, role) in [("role-set", Some(role)), ("role-unset", None)] {
        let receipt = fixture.service.assert_role(&actor, &seat, role.clone()).await.expect("assertion");
        let event = tokio::time::timeout(std::time::Duration::from_secs(1), subscriber.next())
            .await.expect("live publication").expect("live event");
        let expected = event_case(case);
        assert_eq!(serde_json::from_str::<Value>(&event.payload).expect("payload"), expected["decoded_payload"]);
        assert_eq!(event.kind, expected["frame"]["event"]["kind"]);
        assert_eq!(event.seq, Some(receipt.seq));
        assert_eq!(fixture.service.read_role(&seat).await.expect("role"), role);
    }
    assert_eq!(fixture.spine.len(), 2);
}

#[tokio::test]
async fn joining_roles_clears_stale_descriptor_values_and_preserves_real_assignments() {
    let fixture = Fixture::new().await;
    let (actor, seat, role) = Fixture::ids();
    let mut stale = fixture.registry.get(&seat).await.expect("registry").expect("seat");
    assert_eq!(stale.role.as_deref(), Some(role.as_str()), "fixture must contain stale role");
    fixture.service.join_roles(std::slice::from_mut(&mut stale)).await.expect("join");
    assert_eq!(stale.role, None, "descriptor copy cannot invent assignment");
    fixture.service.assert_role(&actor, &seat, Some(role.clone())).await.expect("set");
    fixture.service.join_roles(std::slice::from_mut(&mut stale)).await.expect("join");
    assert_eq!(stale.role, Some(role));
    fixture.service.assert_role(&actor, &seat, None).await.expect("unset");
    fixture.service.join_roles(std::slice::from_mut(&mut stale)).await.expect("join");
    assert_eq!(stale.role, None, "unset must not revive descriptor.role");
}

#[tokio::test]
async fn publication_failure_is_partial_not_success_and_durable_role_is_visible() {
    let fixture = Fixture::new().await;
    let (actor, seat, role) = Fixture::ids();
    fixture.spine.script_append_error("role event disk failure");
    let error = fixture.service.assert_role(&actor, &seat, Some(role.clone())).await.expect_err("publication failed");
    assert!(matches!(&error, RoleError::Publication { .. }));
    assert!(error.to_string().contains("E-RS-PARTIAL"));
    assert_eq!(fixture.store.seat_role(&seat).await.expect("store").expect("role").role, role);
    assert!(fixture.spine.is_empty());
}

#[tokio::test]
async fn authority_is_reloaded_and_tombstoned_or_unknown_targets_emit_nothing() {
    let fixture = Fixture::new().await;
    let (actor, seat, role) = Fixture::ids();
    let mut subject = fixture.registry.get(&seat).await.expect("registry").expect("seat");
    subject.parent = None;
    fixture.registry.put(subject.clone()).await.expect("change parent");
    assert!(matches!(fixture.service.assert_role(&actor, &seat, Some(role.clone())).await, Err(RoleError::Ownership { .. })));
    subject.parent = Some(actor.clone());
    subject.tombstoned_at = Some(routes()["fixture_context"]["at_ms"].as_u64().expect("at"));
    fixture.registry.put(subject).await.expect("tombstone");
    assert!(fixture.service.assert_role(&actor, &seat, Some(role.clone())).await.is_err());
    let absent = SeatId::from(routes()["fixture_context"]["outsider"].as_str().expect("absent fixture seat"));
    assert!(fixture.service.assert_role(&actor, &absent, Some(role)).await.is_err());
    assert!(fixture.spine.tail(None, Seq(0)).await.expect("events").is_empty());
    assert!(fixture.store.list_roles().await.expect("roles").is_empty());
}

#[tokio::test]
async fn fallible_clock_refuses_before_persistence() {
    let fixture = Fixture::new().await;
    let (actor, seat, role) = Fixture::ids();
    let service = RoleService::new(fixture.registry.clone(), fixture.store.clone(), fixture.bus.clone())
        .with_clock(Arc::new(|| Err(PijError::Adapter { adapter: "clock-fixture".to_string(), message: "unavailable".to_string() })));
    assert!(matches!(service.assert_role(&actor, &seat, Some(role)).await, Err(RoleError::Runtime(_))));
    assert!(fixture.store.list_roles().await.expect("roles").is_empty());
    assert!(fixture.spine.is_empty());
}
