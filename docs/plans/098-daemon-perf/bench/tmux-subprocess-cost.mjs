import { execFileSync } from "node:child_process";
function timeIt(label, args, n) {
  const t0 = process.hrtime.bigint();
  let errs = 0;
  for (let i = 0; i < n; i++) {
    try { execFileSync("tmux", args, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] }); }
    catch { errs++; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label}: ${n} calls, total ${ms.toFixed(1)}ms, mean ${(ms/n).toFixed(2)}ms, errors ${errs}`);
}
const live = process.argv[2];
timeIt("capture-pane LIVE  ", ["capture-pane","-t",live,"-p","-J"], 50);
timeIt("capture-pane GONE  ", ["capture-pane","-t","%99991","-p","-J"], 50);
timeIt("display-message GONE", ["display-message","-p","-t","%99991","#{window_id}"], 50);
