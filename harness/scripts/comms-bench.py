#!/usr/bin/env python3
"""pij comms benchmark harness (poc/comms-sqlite-socket).

Runs delivery scenarios against an ISOLATED pij daemon (PIJ_HOME + PIJ_QUEUE_BACKEND=sqlite
+ private `tmux -L` server) and appends transcript-verified rows to benchmarks.md.

Measurement method (stated once, applies to every row):
  latency   = receipts.acked.at − receipts.queued.at in <PIJ_HOME>/queue/pij.sqlite (ms); for
              pointer rows the `injected` receipt is used and marked "(pointer)".
  verified  = the framed body is found BYTE-EXACT in the recipient harness's own transcript
              (claude: ~/.claude/projects/<slug>/<sessionId>.jsonl user turns + queued_command
              attachments; copilot: ~/.copilot/session-state/<id>/events.jsonl user.message).
              A row is written only when verified (or explicitly marked NOT VERIFIED).
  keystrokes= lines appended to $PIJ_BENCH_KEYLOG by the daemon's tmux adapter during the
              scenario (one line per send-keys/paste call). "n/a" when the daemon was started
              without PIJ_BENCH_KEYLOG.
  load      = N bodies from S sender ids in a burst; loss = sent − acked within the timeout;
              p50/p95 of per-message latency.
  restart   = SIGTERM the daemon after the burst is enqueued, restart it, count acked and
              count transcript occurrences (dup = occurrences − 1).

Usage:
  comms-bench.py --home H --db H/queue/pij.sqlite --pij PIJ_CLI --sender pij-poc-sender \
      [--claude ID --claude-transcript PATH] [--copilot ID --copilot-events PATH] \
      [--keylog PATH] [--daemon-cmd "..."] --label "after item 1 (SHA)" \
      --out reports/.../benchmarks.md scenarios...
Scenarios: C1 C2 P1 L1 LOAD RESTART  (C2 needs the claude seat to accept a 'sleep 40' task)
"""
import argparse, json, os, sqlite3, subprocess, sys, time, statistics, signal, glob

def body(tag, n_lines=31, width=95):
    lines=[f"{tag}-HEAD sha {tag.lower()}0001 branch poc/comms-sqlite-socket — verdict: clean"]
    lines+=[f"L{i:02d}: "+("k"*width)+f" end{i:02d}" for i in range(2,n_lines)]
    lines.append(f"{tag}-TAIL")
    return "\n".join(lines)

class Bench:
    def __init__(s,a):
        s.a=a; s.db=sqlite3.connect(a.db); s.db.row_factory=sqlite3.Row
        s.env=dict(os.environ); s.env.update({"PIJ_HOME":a.home,"PIJ_QUEUE_BACKEND":"sqlite","PIJ_SESSION_ID":a.sender})
        for k in ("CLAUDE_CODE_SESSION_ID","CLAUDECODE","CLAUDE_CODE_ENTRYPOINT"): s.env.pop(k,None)
        s.rows=[]
        s._off={}
        for path in (a.claude_transcript, a.copilot_events):
            if path and os.path.exists(path): s._off[path]=os.path.getsize(path)
    def _tail(s,path):
        if not path or not os.path.exists(path): return ""
        with open(path) as f:
            f.seek(s._off.get(path,0)); return f.read()
    def pij(s,*args,sender=None):
        env=dict(s.env)
        if sender: env["PIJ_SESSION_ID"]=sender
        return subprocess.run([s.a.pij,*args],env=env,capture_output=True,text=True,timeout=60)
    def send(s,to,text,sender=None):
        p=os.path.join(s.a.home,f"bench-{int(time.time()*1000)}-{os.getpid()}.txt"); open(p,"w").write(text)
        r=s.pij("send",to,"--body-file",p,sender=sender); os.unlink(p)
        if r.returncode!=0: raise SystemExit(f"send failed: {r.stdout}{r.stderr}")
        row=s.db.execute("select seq,id from messages where to_id=? order by seq desc limit 1",(to,)).fetchone()
        return row["seq"]
    def wait_state(s,seq,states,timeout):
        t0=time.time()
        while time.time()-t0<timeout:
            st=s.db.execute("select state from deliveries where seq=?",(seq,)).fetchone()["state"]
            if st in states: return st
            time.sleep(0.05)
        return None
    def latency(s,seq,end_state="acked"):
        r=s.db.execute("select state,at from receipts where seq=? order by id",(seq,)).fetchall()
        q=[x["at"] for x in r if x["state"]=="queued"]; e=[x["at"] for x in r if x["state"]==end_state]
        return (e[0]-q[0]) if q and e else None
    def keylog_count(s):
        if not s.a.keylog or not os.path.exists(s.a.keylog): return None
        return sum(1 for _ in open(s.a.keylog))
    def verified_claude(s,text):
        want="[pij from "+s.a.sender+"] "+text; n=0
        for l in s._tail(s.a.claude_transcript).splitlines():
            try: d=json.loads(l)
            except: continue
            if d.get("type")!="user": continue
            c=d.get("message",{}).get("content")
            if isinstance(c,list):
                for x in c:
                    if isinstance(x,dict) and x.get("type")=="text" and want in x.get("text",""): n+=1
            elif isinstance(c,str) and want in c: n+=1
            # queued_command attachments
            for att in d.get("attachments",[]) if isinstance(d.get("attachments"),list) else []:
                if isinstance(att,dict) and want in att.get("prompt",""): n+=1
        return n
    def verified_copilot(s,text):
        want="[pij from "+s.a.sender+"] "+text; n=0
        for l in s._tail(s.a.copilot_events).splitlines():
            try: e=json.loads(l)
            except: continue
            if e.get("type")=="user.message" and (e.get("data") or {}).get("content","")==want: n+=1
        return n
    def wait_verified(s,fn,text,timeout):
        t0=time.time()
        while time.time()-t0<timeout:
            n=fn(text)
            if n>0: return n
            time.sleep(0.5)
        return 0
    def row(s,scn,size,lat,keys,verified,note):
        line=f"| {s.a.label} | {scn} | {size} B | {lat if lat is not None else '—'} | {keys if keys is not None else 'n/a'} | {verified} | {note} |"
        s.rows.append(line); print(line,flush=True)
        if s.a.out:  # incremental: a crash in a later scenario must not lose earlier rows
            new=not os.path.exists(s.a.out) or "| label |" not in open(s.a.out).read()
            with open(s.a.out,"a") as f:
                if new: f.write("| label | scenario | body | send→acked ms | keystrokes | verified | note |\n|---|---|---|---|---|---|---|\n")
                f.write(line+"\n")
    # scenarios
    def C1(s):
        t=body("C1"); k0=s.keylog_count(); seq=s.send(s.a.claude,t); st=s.wait_state(seq,("acked",),30)
        n=s.wait_verified(s.verified_claude,t,30); k1=s.keylog_count()
        s.row("C1 claude idle 3KB",len(t),s.latency(seq),None if k0 is None else k1-k0, f"transcript ×{n}" if n==1 else f"NOT VERIFIED (×{n})", f"state={st}")
    def C2(s):
        busy="BUSY-TASK: run exactly this shell command now and wait for it to finish before doing anything else: sleep 40. Do not reply."
        s.send(s.a.claude,busy); time.sleep(8)
        t=body("C2"); k0=s.keylog_count(); t0=time.time(); seq=s.send(s.a.claude,t); st=s.wait_state(seq,("acked",),40)
        n=s.wait_verified(s.verified_claude,t,60); k1=s.keylog_count()
        s.row("C2 claude mid-turn 3KB",len(t),s.latency(seq),None if k0 is None else k1-k0, f"transcript ×{n}" if n==1 else f"NOT VERIFIED (×{n})", f"state={st}; sent {int(time.time()-t0)}s into a 40s tool call")
        time.sleep(35)
    def P1(s):
        t=body("P1"); k0=s.keylog_count(); seq=s.send(s.a.copilot,t); st=s.wait_state(seq,("acked","injected"),30)
        n=s.wait_verified(s.verified_copilot,t,30); k1=s.keylog_count()
        s.row("P1 copilot idle 3KB (rpc)",len(t),s.latency(seq, "acked" if st=="acked" else "injected"),None if k0 is None else k1-k0, f"events.jsonl ×{n}" if n==1 else f"NOT VERIFIED (×{n})", f"state={st}")
    def L1(s):
        t=body("L1"); k0=s.keylog_count(); seq=s.send(s.a.copilot_legacy or s.a.copilot,t); st=s.wait_state(seq,("injected","acked"),30); time.sleep(3); k1=s.keylog_count()
        s.row("L1 legacy seat pointer",len(t),s.latency(seq,"injected"),None if k0 is None else k1-k0, "pointer line only (body not in events.jsonl by design)", f"state={st} (pointer)")
    def LOAD(s):
        N=s.a.load_n; senders=[s.a.sender]+s.a.extra_senders; seqs=[]; texts=[]
        for i in range(N):
            t=f"LOAD-{i:03d} "+body(f"LD{i:03d}",n_lines=6); texts.append(t); seqs.append(s.send(s.a.claude,t,sender=senders[i%len(senders)]))
        deadline=time.time()+120; acked=0
        while time.time()<deadline:
            acked=s.db.execute(f"select count(*) from deliveries where seq in ({','.join(map(str,seqs))}) and state='acked'").fetchone()[0]
            if acked==N: break
            time.sleep(0.2)
        lats=[s.latency(q) for q in seqs]; lats=[x for x in lats if x is not None]
        time.sleep(5); ver=sum(1 for t in texts if s.verified_claude(t.replace("[pij from "+s.a.sender+"] ",""))>0)
        s.row(f"LOAD {N} msgs/{len(senders)} senders → claude",sum(map(len,texts)),f"p50 {int(statistics.median(lats))} / p95 {int(sorted(lats)[int(0.95*len(lats))-1])}" if lats else None,None,f"transcript ×{ver}/{N}",f"acked {acked}/{N}, loss {N-acked}")
    def RESTART(s):
        if not s.a.daemon_cmd: print("RESTART skipped: --daemon-cmd not given"); return
        lock=os.path.join(s.a.home,"daemon.lock"); pids=[]
        try: pids=[json.load(open(lock))["pid"]]
        except Exception: pids=[int(x) for x in subprocess.run(["pgrep","-f","extensions/pij/daemon.ts"],capture_output=True,text=True).stdout.split()]
        for p in pids:
            try: os.kill(int(p),signal.SIGTERM)
            except ProcessLookupError: pass
        time.sleep(2)
        texts=[f"RESTART-{i} "+body(f"RS{i}",n_lines=4) for i in range(s.a.restart_n)]; seqs=[s.send(s.a.claude,t) for t in texts]
        subprocess.Popen(s.a.daemon_cmd,shell=True,env=dict(os.environ,PIJ_HOME=s.a.home,PIJ_QUEUE_BACKEND="sqlite"),stdout=open(os.path.join(s.a.home,"daemon.log"),"a"),stderr=subprocess.STDOUT)
        deadline=time.time()+60
        while time.time()<deadline and any(s.wait_state(q,("acked",),0.1) is None for q in seqs): time.sleep(0.3)
        time.sleep(8); occ=[s.verified_claude(t) for t in texts]
        acked=sum(1 for q in seqs if s.wait_state(q,("acked",),0.1))
        s.row(f"RESTART {len(seqs)} queued while daemon down",sum(map(len,texts)),None,None,f"transcript ×{occ}",f"acked {acked}/{len(seqs)}, dup {sum(max(0,o-1) for o in occ)}, loss {len(seqs)-acked}")

def main():
    ap=argparse.ArgumentParser()
    for k in ("home","db","pij","sender","label","out","claude","claude_transcript","copilot","copilot_events","copilot_legacy","keylog","daemon_cmd"): ap.add_argument("--"+k.replace("_","-"))
    ap.add_argument("--extra-senders",nargs="*",default=[]); ap.add_argument("--load-n",type=int,default=50); ap.add_argument("--restart-n",type=int,default=5)
    ap.add_argument("scenarios",nargs="+"); a=ap.parse_args()
    b=Bench(a)
    for scn in a.scenarios: getattr(b,scn)()
    print(f"{len(b.rows)} row(s) written to {a.out}")
if __name__=="__main__": main()
