"""Download المختصر في التفسير (mukhtasar_ar) + page fawaed from the tafsir MCP server."""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
URL = "https://mcp.tafsir.net/mcp"
OUT = sys.argv[1]
COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
assert sum(COUNTS) == 6236

def call(name, args, tries=5):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}}).encode()
    for t in range(tries):
        try:
            req = urllib.request.Request(URL, body, {"Content-Type":"application/json","Accept":"application/json, text/event-stream","User-Agent":"quiz-builder/1"})
            raw = urllib.request.urlopen(req, timeout=60).read().decode()
            data = next(l[5:] for l in raw.splitlines() if l.startswith("data:"))
            res = json.loads(data)["result"]
            return json.loads(res["content"][0]["text"])
        except Exception as e:
            time.sleep(2 * (t + 1))
    return {"error": True}

def ayah(sa):
    s, a = sa
    p = f"{OUT}/ayat/{s:03d}_{a:03d}.json"
    if os.path.exists(p): return
    t = call("fetch_tafsir", {"surah": s, "ayah": a, "sources": ["mukhtasar_ar"]})
    q = call("fetch_ayah", {"surah": s, "ayah": a})
    if t.get("error") or q.get("error"): print("ERR", s, a, flush=True); return
    tx = t["tafsirs"][0]
    json.dump({"s": s, "a": a, "ayah": q.get("text_uthmani") or q.get("text"), "mukhtasar": tx.get("text_raw") or tx.get("text")}, open(p, "w"), ensure_ascii=False)

def page(n):
    p = f"{OUT}/fawaed/{n:03d}.json"
    if os.path.exists(p): return
    r = call("get_page_fawaed", {"page": n})
    if r.get("error"): print("ERRP", n, flush=True); return
    json.dump(r, open(p, "w"), ensure_ascii=False)

os.makedirs(f"{OUT}/ayat", exist_ok=True); os.makedirs(f"{OUT}/fawaed", exist_ok=True)
jobs = [(s + 1, a + 1) for s, c in enumerate(COUNTS) for a in range(c)]
with ThreadPoolExecutor(8) as ex:
    list(ex.map(page, range(1, 605)))
    print("fawaed done", flush=True)
    for i, _ in enumerate(ex.map(ayah, jobs)):
        if i % 500 == 0: print(i, flush=True)
print("done")
