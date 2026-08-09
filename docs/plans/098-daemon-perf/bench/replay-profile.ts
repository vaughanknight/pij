import { Session } from "node:inspector";
import { writeFileSync } from "node:fs";
const HOME = "/tmp/pij-perf-home";
const base = "/Users/jordanknight/pi-hacking/pij-worktrees/s098-daemon-perf/.pi/extensions/pij";
const daemonMod = await import(`${base}/daemon.ts`);
const registryMod = await import(`${base}/adapters/fs-registry.ts`);
const channelMod = await import(`${base}/adapters/channel.ts`);
const stubTmux = {
  capturePane: () => "", sendText: () => "confirmed", killPane: () => {},
  isPaneDead: () => true, listPanes: () => [], attachPaneTap: () => {},
  drainPaneTap: () => Buffer.alloc(0), detachPaneTap: () => {},
  isAlive: (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } },
  now: () => Date.now(),
};
const daemon = new daemonMod.Daemon(HOME, stubTmux as never, new registryMod.FsRegistry(HOME), new channelMod.FsChannel(HOME), () => {});
daemon.tick(); // warm: first tick does one-time backfill
const session = new Session();
session.connect();
const post = (m: string, p?: object) => new Promise<any>((res, rej) => session.post(m, p as never, (e, r) => e ? rej(e) : res(r)));
await post("Profiler.enable");
await post("Profiler.setSamplingInterval", { interval: 200 });
await post("Profiler.start");
const t0 = Date.now();
daemon.tick();
const ms = Date.now() - t0;
const { profile } = await post("Profiler.stop");
writeFileSync("/tmp/tick.cpuprofile", JSON.stringify(profile));
console.log(`profiled tick: ${ms}ms -> /tmp/tick.cpuprofile`);
