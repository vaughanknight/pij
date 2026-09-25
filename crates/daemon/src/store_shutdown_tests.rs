use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use pij_core::config::{AdapterChoice, Config};
use pij_core::model::Job;
use pij_core::ports::Queue;
use pij_store::SqliteQueue;

#[tokio::test]
async fn shutdown_drains_detached_sql_before_returning() {
    let root = pij_testkit::fresh_dir("shutdown-store-owner");
    let path = root.join("pij.sqlite");
    let mut config = Config {
        store_path: path.display().to_string(),
        ..Config::default()
    };
    config.adapters.spine = AdapterChoice::Real;
    let daemon = super::boot(&config, root.join("daemon")).await.unwrap();
    let pool = daemon.store_pools[0].clone();
    let entered = Arc::new(tokio::sync::Notify::new());
    let (release, receive) = mpsc::channel();
    let receive = Arc::new(Mutex::new(Some(receive)));
    let mut connections = Vec::new();
    // The live daemon can grow its file-backed pool to four connections. Put
    // the barrier on every one, not whichever idle lease happens to be first.
    for _ in 0..4 {
        connections.push(pool.acquire().await.unwrap());
    }
    for connection in &mut connections {
        let receive = receive.clone();
        let hook_entered = entered.clone();
        connection
            .lock_handle()
            .await
            .unwrap()
            .set_update_hook(move |_| {
                let receive = receive.lock().unwrap().take();
                if let Some(receive) = receive {
                    hook_entered.notify_one();
                    let _ = receive.recv_timeout(Duration::from_secs(5));
                }
            });
    }
    drop(connections);
    let queue = SqliteQueue::new(pool.clone(), 60, 100).unwrap();
    let request = tokio::spawn(async move {
        queue
            .enqueue(Job {
                kind: "shutdown-proof".into(),
                serial_key: "proof".into(),
                payload: "{}".into(),
                dedupe_key: "proof".into(),
                attempt: 0,
            })
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    request.abort();
    assert!(request.await.unwrap_err().is_cancelled());
    let mut shutdown = tokio::spawn(daemon.shutdown());
    let early = tokio::time::timeout(Duration::from_millis(100), &mut shutdown).await;
    release.send(()).unwrap();
    assert!(
        early.is_err(),
        "shutdown must wait for its detached SQL transaction"
    );
    tokio::time::timeout(Duration::from_secs(3), shutdown)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(pool.is_closed());
    let reopened = pij_store::open(path.to_str().unwrap()).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM jobs WHERE dedupe_key='proof'")
        .fetch_one(&reopened)
        .await
        .unwrap();
    assert_eq!(count, 1, "graceful stop must not abandon an admitted write");
    reopened.close().await;
    std::fs::remove_dir_all(root).unwrap();
}
