// Append to governance_composition.rs when u4/u5 are composed; this is a staged phase-three witness.
#[tokio::test]
async fn decisions_push_to_asker_and_verification_only_closes_its_done_claim() {
    let fixture = Fixture::start().await;
    let question = fixture
        .success("/v1/report", &case("report-question")["request"])
        .await;
    let decision_id = question["decision"]["id"].as_str().expect("durable decision id");
    let decisions = fixture.get("/v1/decisions?parent=pij-parent").await;
    assert!(decisions["decisions"].as_array().expect("decisions").iter().any(
        |decision| decision["id"] == decision_id && decision["state"] == "open"
    ));

    let mut answer = case("decision-answer")["request"].clone();
    answer["decision"] = json!(decision_id);
    answer["caller"]["TMUX_PANE"] = json!("%12");
    let (status, refused) = fixture.post("/v1/answer", &answer).await;
    assert_eq!(status, reqwest::StatusCode::FORBIDDEN);
    assert_eq!(refused["details"]["code"], "E-RS-OWNERSHIP");
    answer["caller"]["TMUX_PANE"] = json!("%10");
    let answered = fixture.success("/v1/answer", &answer).await;
    assert_eq!(answered["decision"]["state"], "answered");
    assert_eq!(answered["decision"]["answered_by"], PARENT);

    let inbox = fixture.get("/v1/inbox?seat=pij-worker&wait=false").await;
    let claim = inbox
        .as_array()
        .expect("inbox claims")
        .iter()
        .find(|claim| claim["message"]["msg_id"] == answered["decision"]["answer_msg_id"])
        .expect("answer was actually queued to its asker");
    assert_eq!(claim["message"]["from"], PARENT);
    assert_eq!(claim["message"]["to"], WORKER);
    assert!(claim["message"]["body"].as_str().expect("answer body").contains(
        answer["answer"].as_str().expect("answer text")
    ));
    fixture
        .success("/v1/inbox/ack", &json!({"seat": WORKER, "job_id": claim["job_id"]}))
        .await;

    let done = json!({"argv": ["report", "state", "done"], "caller": {"TMUX_PANE": "%11"}});
    let first_done = fixture.success("/v1/report", &done).await;
    let anomalies = fixture.get("/v1/anomalies").await;
    assert!(has_unverified_done(&anomalies));
    let verified = fixture
        .success("/v1/report", &case("report-verify")["request"])
        .await;
    assert_eq!(verified["done_seq"], first_done["seq"]);
    assert!(!has_unverified_done(&fixture.get("/v1/anomalies").await));
    fixture.success("/v1/report", &done).await;
    assert!(has_unverified_done(&fixture.get("/v1/anomalies").await));

    fixture.success("/v1/close", &case("seat-close")["request"]).await;
    let roster = fixture.get("/v1/seats").await;
    assert!(roster["seats"].as_array().expect("roster").iter().all(|seat| seat["id"] != WORKER));
}

fn has_unverified_done(data: &Value) -> bool {
    data["anomalies"].as_array().expect("anomaly rows").iter().any(
        |row| row["kind"] == "unverified-done" && row["nodeId"] == WORKER
    )
}
