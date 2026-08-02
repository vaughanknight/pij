import json,glob,os,sys,subprocess
mode=sys.argv[1]
subs=[]
for f in glob.glob(os.path.expanduser('~/.pij/*/watchdog.json')):
    t=f.split('/')[-2]
    try: d=json.load(open(f))
    except Exception: continue
    ws=d.get('watchers') if isinstance(d,dict) else None
    if not isinstance(ws,list): continue
    for w in ws: subs.append((w.get('watcherId'),t,w.get('capture') or {}))
if not subs: print('PROBE-ERR no-subscriptions-parsed'); sys.exit(1)
if mode=='unbounded':
    out=[f"{w}>{t}" for w,t,c in subs if c.get('mode')=='always' and not c.get('maxBytes')]
else:
    r=subprocess.run(['pij','list','--json'],capture_output=True,text=True)
    d=json.loads(r.stdout); seats=d if isinstance(d,list) else d.get('sessions',[])
    if not seats: print('PROBE-ERR empty-registry'); sys.exit(1)
    live={s['id'] for s in seats if s.get('liveness')=='active'}
    out=[f"{w}>{t}" for w,t,c in subs if w not in live]
print(f"{len(subs)}subs " + (' '.join(sorted(out)) if out else 'clean'))
