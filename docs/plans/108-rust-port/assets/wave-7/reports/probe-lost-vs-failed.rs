// REVIEWER PROBE — the Lost/Failed flake, made deterministic.
//
// Hypothesis under test: `Lost` is NOT produced by "the exit status was not
// observed in time". It is produced because `reap()` CONSUMES the status
// (`children.remove(id)` on first observation) and the very next line —
// `if !group_pids(record.pgid)?.is_empty() { continue; }` — can throw it away.
// A later pass then sees `children.get_mut(id) == None`, reads that absence as
// `None`, and concludes `Lost`.
//
// If that is the mechanism, a job whose GROUP outlives its DIRECT CHILD
// reproduces it every time, with no load and no timing luck.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use pij_core::config::Config;
use pij_core::model::SeatId;
use pij_core::ports::Queue;
use pij_sidecars::background::{self, BgRequest, BgStatus, BgWorker};
use pij_store::SqliteQueue;
use pij_testkit::FreshStore;

async fn sqlite_queue(fresh: &FreshStore) -> Arc<SqliteQueue> {
    let config = Config::default();
    Arc::new(
        SqliteQueue::new(
            pij_store::open(&fresh.path()).await.expect("open test store"),
            config.claim_lease_secs,
            config.delivered_id_capacity,
        )
        .expect("queue policy"),
    )
}

#[tokio::test]
async fn a_group_that_outlives_its_direct_child_is_reported_lost_not_failed() {
    let fresh = FreshStore::new();
    let queue = sqlite_queue(&fresh).await;
    let queue_port: Arc<dyn Queue> = queue.clone();
    let worker = BgWorker::new(queue_port, PathBuf::from(format!("{}.bg", fresh.path())))
        .expect("worker");
    let target = SeatId::from("pij-test");

    // The direct child exits 3 immediately; a grandchild keeps the process GROUP
    // non-empty for ~1s. Nothing here is racy: the ordering is causal.
    let start = BgRequest::Start {
        id: "boom".to_string(),
        title: "exits 3 while its group lingers".to_string(),
        command: "sleep 1 & echo partial; exit 3".to_string(),
        target: target.clone(),
    };
    queue
        .enqueue(background::job(&start, "start-boom").expect("job"))
        .await
        .expect("enqueue");
    worker.run_once(8).await.expect("start");

    // Pass 1: the direct child has exited (status 3 available and CONSUMED),
    // but the grandchild keeps the group alive, so the guard bails.
    tokio::time::sleep(Duration::from_millis(300)).await;
    worker.run_once(8).await.expect("pass 1");
    let after_first = worker.load("boom").expect("record").status;
    println!("PROBE after pass 1 (group still alive) = {after_first:?}");

    // Pass 2: the group is empty now. What does the classifier conclude?
    tokio::time::sleep(Duration::from_millis(1200)).await;
    worker.run_once(8).await.expect("pass 2");
    let record = worker.load("boom").expect("record");
    println!(
        "PROBE after pass 2 = {:?}, exit_code = {:?}",
        record.status, record.exit_code
    );
    println!(
        "PROBE VERDICT: {}",
        match record.status {
            BgStatus::Lost =>
                "LOST — the exit status was observed, consumed, and discarded by the guard",
            BgStatus::Failed => "FAILED — status survived the guard (hypothesis wrong)",
            other => {
                println!("PROBE unexpected status {other:?}");
                "unexpected"
            }
        }
    );
}
