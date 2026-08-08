import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync, opendirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

function fsyncDirBestEffort(dir) {
  let d; try { d = opendirSync(dir); fsyncSync(d.fd); } catch {} finally { try { d?.closeSync(); } catch {} }
}
function writeTextAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let fd;
  try {
    fd = openSync(tmp, "wx"); writeFileSync(fd, text); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(tmp, path); fsyncDirBestEffort(dirname(path));
  } finally { if (fd !== undefined) closeSync(fd); rmSync(tmp, { force: true }); }
}

const dir = join(tmpdir(), `pij-fsync-probe-${process.pid}`);
mkdirSync(dir, { recursive: true });
const payload = JSON.stringify({ id: "pij-probe", lastTickAt: new Date().toISOString(), pad: "x".repeat(1200) });

// PROVE THE INSTRUMENT (F-701): a no-op loop must measure ~0, a real write must not.
let t = process.hrtime.bigint();
for (let i = 0; i < 40; i++) { /* deliberately nothing */ }
const noopMs = Number(process.hrtime.bigint() - t) / 1e6 / 40;

const N = 40;
t = process.hrtime.bigint();
for (let i = 0; i < N; i++) writeTextAtomic(join(dir, `d${i}.json`), payload);
const perWriteMs = Number(process.hrtime.bigint() - t) / 1e6 / N;

rmSync(dir, { recursive: true, force: true });
const WRITES = 132, PUBLISHES_PER_WRITE = 5;
console.log(JSON.stringify({
  instrumentControl_noopPerIterMs: +noopMs.toFixed(6),
  instrumentReportsNonZeroForRealWork: perWriteMs > noopMs * 1000,
  atomicWritePerCallMs: +perWriteMs.toFixed(2),
  projected_currentTickHeartbeatMs: +(perWriteMs * WRITES * PUBLISHES_PER_WRITE).toFixed(0),
  projected_singleFileHeartbeatMs: +perWriteMs.toFixed(0),
}, null, 2));
