/* Two-device sync scenarios against an in-memory fake Firestore.  node tests/sync.test.js */
const vm = require("vm"), fs = require("fs"), path = require("path"), assert = require("assert");
const SRC = fs.readFileSync(path.join(__dirname, "../assets/sync.js"), "utf8");
const remote = {}; let clock = 1000, failNext = 0;
const ts = ms => ({ toMillis: () => ms });
const fake = {
  initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
  onAuthStateChanged: (a, cb) => setTimeout(() => cb({ uid: "u1", email: "t@x" }), 0),
  GoogleAuthProvider: function () {}, signInWithPopup: async () => {},
  collection: (db, ...p) => ({ p: p.join("/") }), doc: (db, ...p) => ({ p: p.join("/"), id: p[p.length - 1] }),
  where: (f, op, v) => ({ f, op, v }), query: (c, w) => ({ c, w }), Timestamp: { fromMillis: ms => ts(ms) },
  serverTimestamp: () => "__ts__",
  getDocs: async q => { const c = q.c || q, out = []; for (const k in remote) if (k.startsWith(c.p + "/")) { const d = remote[k]; if (!q.w || d.at.toMillis() > q.w.v.toMillis()) out.push({ id: k.split("/").pop(), data: () => d, ref: { p: k } }); } return { forEach: f => out.forEach(f) }; },
  deleteDoc: async r => { delete remote[r.p]; },
  runTransaction: async (db, fn) => {
    if (failNext > 0) { failNext--; const e = new Error("offline"); e.code = "unavailable"; throw e; }
    const writes = [];
    const r = await fn({ get: async ref => ({ exists: () => ref.p in remote, data: () => remote[ref.p] }), set: (ref, d) => writes.push([ref, d]) });
    writes.forEach(([ref, d]) => {
      assert(/\/attempts\/juz-(0[1-9]|[12]\d|30)_[1-5]$/.test(ref.p), "rules: bad id " + ref.p);
      assert(Object.keys(d).every(k => ["juz","slot","started","finished","marks","total","timeout","slots","at","deleted"].includes(k)), "rules: bad keys");
      remote[ref.p] = Object.assign({}, d, { at: ts(++clock) });
    });
    return r;
  }
};
function device() {
  const store = {}, sb = { localStorage: { getItem: k => k in store ? store[k] : null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k], get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i] },
    location: { protocol: "https:" }, Event: function () {}, setTimeout, Promise, console, __FB_MOCK__: fake };
  sb.window = sb; sb.FIREBASE_CFG = { apiKey: "x" }; sb.addEventListener = () => {}; sb.dispatchEvent = () => {};
  vm.runInNewContext(SRC, sb);
  return { M: sb.MSync, store, list: j => JSON.parse(store["moddaker-mukhtasar:attempts:" + j] || "[]"),
    add: (j, started) => { const k = "moddaker-mukhtasar:attempts:" + j, l = JSON.parse(store[k] || "[]"); l.push({ started, finished: started + 1, marks: 1, total: 1, slots: [{ id: "q", order: [0, 1, 2], resp: 0, flag: false, ok: true }] }); store[k] = JSON.stringify(l); } };
}
const live = () => Object.entries(remote).filter(([, d]) => !d.deleted).map(([k, d]) => k.split("/").pop() + ":" + d.started);
const sync = async d => { await d.M.signIn(); await new Promise(r => setTimeout(r, 20)); await d.M.syncNow(); await new Promise(r => setTimeout(r, 20)); };
(async () => {
  const A = device(), B = device();
  [10, 20, 30].forEach(t => A.add("juz-01", t)); [40, 50, 60].forEach(t => B.add("juz-01", t));
  await sync(A); assert.deepStrictEqual(live().sort(), ["juz-01_1:10", "juz-01_2:20", "juz-01_3:30"]);
  await sync(B);                                   // 6 total -> oldest dropped, cap 5
  assert.strictEqual(B.list("juz-01").length, 5); assert.strictEqual(live().length, 5);
  assert(!B.list("juz-01").some(a => a.started === 10), "oldest should be trimmed");
  console.log("ok cap/merge:", live().sort().join(" "));
  B.M.removeAttempt("juz-01", 60); await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(live().length, 4); assert.strictEqual(B.list("juz-01").length, 4);
  await A.M.syncNow(); await new Promise(r => setTimeout(r, 30));
  assert(!A.list("juz-01").some(a => a.started === 60), "deletion must reach other device");
  console.log("ok delete propagates");
  failNext = 1; B.M.removeAttempt("juz-01", 50); await new Promise(r => setTimeout(r, 30));   // offline delete
  assert.strictEqual(B.list("juz-01").some(a => a.started === 50), false); assert(live().some(x => x.endsWith(":50")), "remote still has it while offline");
  await B.M.syncNow(); await new Promise(r => setTimeout(r, 30));
  assert(!live().some(x => x.endsWith(":50")), "pending delete applied after reconnect");
  console.log("ok offline delete");
  B.add("juz-01", 70); B.add("juz-01", 80); await B.M.syncNow(); await new Promise(r => setTimeout(r, 30));
  assert(Object.keys(remote).length <= 5, "at most 5 docs per juz"); console.log("ok slot reuse:", Object.keys(remote).length, "docs");
  console.log("ALL PASSED");
})().catch(e => { console.error("FAIL", e); process.exit(1); });
