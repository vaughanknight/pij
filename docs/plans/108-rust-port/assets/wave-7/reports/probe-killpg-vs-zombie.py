import os, subprocess, time
child = subprocess.Popen(["sh","-c","sleep 30 & exit 0"], preexec_fn=os.setsid,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
pgid = child.pid                      # setsid => leader, pgid == pid
time.sleep(0.5)

def table(g):
    out = subprocess.run(["ps","-Ao","pid=,pgid=,state="],capture_output=True,text=True).stdout
    return [(int(l.split()[0]), l.split()[2]) for l in out.splitlines()
            if l.split() and int(l.split()[1])==g]

def killprobe(g):
    try:
        os.killpg(g, 0); return "0  -> group reports ALIVE"
    except ProcessLookupError: return "ESRCH -> group reports EMPTY"
    except PermissionError: return "EPERM"

for pid, st in table(pgid):           # kill the grandchild, leave the zombie leader
    if pid != child.pid:
        try: os.kill(pid, 9)
        except Exception: pass
time.sleep(0.5)

rows = table(pgid)
print("ps rows for pgid:", rows)
print("non-zombie members (what group_pids counts):", [p for p,s in rows if not s.startswith('Z')])
print("kill(-pgid, 0) says:", killprobe(pgid))
child.wait(timeout=5)
print("after reaping ->  ps rows:", table(pgid), "| kill:", killprobe(pgid))
