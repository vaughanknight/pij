import { openSync, writeFileSync, fsyncSync, closeSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
function bench(label, dir, n) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) {
    const tmp = join(dir, `.perfprobe-${process.pid}-${i}.tmp`);
    const fd = openSync(tmp, "wx");
    writeFileSync(fd, JSON.stringify({ probe: i, pad: "x".repeat(800) }));
    fsyncSync(fd);          // file fsync
    closeSync(fd);
    const dst = join(dir, `.perfprobe-${process.pid}-${i}.done`);
    renameSync(tmp, dst);
    const dfd = openSync(dir, "r");
    fsyncSync(dfd);          // directory fsync
    closeSync(dfd);
    rmSync(dst, { force: true });
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label}: ${n} atomic writes, total ${ms.toFixed(1)}ms, mean ${(ms/n).toFixed(2)}ms per write (2 fsyncs each)`);
}
mkdirSync("/tmp/pij-fsync-probe", { recursive: true });
bench("small dir (/tmp/pij-fsync-probe)", "/tmp/pij-fsync-probe", 40);
bench("PIJ HOME  (~/.pij, 579 json + 929 dirs)", join(process.env.HOME, ".pij"), 40);
