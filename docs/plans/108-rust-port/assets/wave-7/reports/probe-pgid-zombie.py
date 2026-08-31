import os, subprocess, time
MY_PGID = os.getpgid(0)
def rows(g):
    out = subprocess.run(["ps","-Ao","pid=,pgid=,state=,comm="],capture_output=True,text=True).stdout
    r=[]
    for l in out.splitlines():
        p=l.split(None,3)
        if len(p)>=3 and int(p[1])==g: r.append((int(p[0]),p[2],p[3] if len(p)>3 else ""))
    return r
child = subprocess.Popen(["sh","-c","sleep 45 & sleep 45 & sleep 45"],preexec_fn=os.setsid,
                         stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(0.4); pgid=os.getpgid(child.pid)
assert pgid != MY_PGID
print("before:", rows(pgid))
os.killpg(pgid,15); time.sleep(1.0)
print("1s after SIGTERM:", rows(pgid))
print("child.poll() =", child.poll(), " (None = not reaped by us)")
child.wait(timeout=5)
print("after we wait() the leader:", rows(pgid))
