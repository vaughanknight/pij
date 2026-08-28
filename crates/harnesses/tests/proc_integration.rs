use pij_core::ports::LivenessPort;
use pij_harnesses::proc::ProcLiveness;
use pij_testkit::block_on;

#[test]
fn own_process_has_a_stable_start_identity() {
    let adapter = ProcLiveness::new();
    let pid = std::process::id();
    let first = block_on(adapter.proc_start(pid))
        .expect("inspect this test process")
        .expect("this test process exists");
    let second = block_on(adapter.proc_start(pid))
        .expect("inspect this test process again")
        .expect("this test process still exists");
    assert_eq!(first, second, "one process must keep one start identity");
}

#[test]
fn a_pid_the_platform_cannot_represent_is_absent() {
    let adapter = ProcLiveness::new();
    assert_eq!(
        block_on(adapter.proc_start(u32::MAX)).expect("an out-of-range pid is observable absence"),
        None
    );
}
