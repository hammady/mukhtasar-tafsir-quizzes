/* مزامنة اختيارية للتقدم عبر Firebase (Google sign-in + Firestore).
 * - لا يُحمَّل شيء من Firebase إلا إذا ضغط المستخدم «تسجيل الدخول» أو كان قد سجّل الدخول سابقًا.
 * - المتصفح هو النسخة الأساسية دائمًا؛ السحابة نسخة إضافية.
 * - حد أقصى 5 محاولات محفوظة لكل جزء (150 لكل مستخدم): كل محاولة في خانة ثابتة users/{uid}/attempts/juz-NN_{1..5}
 *   فتفرض قواعد Firestore الحد فعليًا. الحذف يكتب «علامة حذف» في الخانة فينتقل إلى الأجهزة الأخرى. */
(function () {
  "use strict";
  var CFG = window.FIREBASE_CFG;
  var NS = "moddaker-mukhtasar", FLAG = NS + ":syncOn", ST = NS + ":sync", AK = NS + ":attempts:";
  var MAX = 5;
  var SDK = "https://www.gstatic.com/firebasejs/10.14.1/";
  var S = { fb: null, booting: null, user: null, status: "idle", err: "", cbs: [], busy: false, again: false };

  function get(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function enabled() { return !!(CFG && CFG.apiKey) && /^https?:$/.test(location.protocol); }
  function emit(status, err) {
    if (status) S.status = status;
    S.err = err || "";
    S.cbs.forEach(function (cb) { try { cb({ user: S.user, status: S.status, error: S.err }); } catch (e) {} });
  }

  /* حالة المزامنة المحلية: آخر سحب، أي بداية محاولة تشغل أي خانة، والحذوفات المعلّقة */
  function st() { var s = get(ST, null) || {}; s.last = s.last || 0; s.slots = s.slots || {}; s.pending = s.pending || []; return s; }
  function saveSt(s) { set(ST, s); }
  function isPending(s, juz, started) { return s.pending.some(function (p) { return p.juz === juz && p.started === started; }); }
  function slotOf(s, juz, started) {
    var m = s.slots[juz] || {};
    for (var k in m) if (m[k] === started) return k;
    return null;
  }

  /* ---- محاولة <-> وثيقة Firestore مدمجة (لا مصفوفات متداخلة) ---- */
  function enc(juz, a) {
    return {
      juz: juz, started: a.started, finished: a.finished, marks: a.marks, total: a.total, timeout: !!a.timeout,
      slots: a.slots.map(function (x) { return [x.id, x.order.join(""), x.resp === null ? -1 : x.resp, x.flag ? 1 : 0, x.ok ? 1 : 0].join("|"); })
    };
  }
  function dec(d) {
    return {
      started: d.started, finished: d.finished, marks: d.marks, total: d.total, timeout: !!d.timeout,
      slots: d.slots.map(function (t) {
        var x = t.split("|");
        return { id: x[0], order: x[1].split("").map(Number), resp: +x[2] < 0 ? null : +x[2], flag: x[3] === "1", ok: x[4] === "1" };
      })
    };
  }
  function localJuz() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(AK) === 0) out.push(k.slice(AK.length)); } } catch (e) {}
    return out;
  }
  function list(juz) { return get(AK + juz, []); }
  function mergeLocal(s, juz, a) {
    if (isPending(s, juz, a.started)) return false;
    var l = list(juz);
    if (l.some(function (x) { return x.started === a.started; })) return false;
    l.push(a); l.sort(function (x, y) { return x.started - y.started; }); set(AK + juz, l);
    return true;
  }
  function dropLocal(juz, started) {
    var l = list(juz), n = l.filter(function (x) { return x.started !== started; });
    if (n.length === l.length) return false;
    set(AK + juz, n); return true;
  }

  /* حذف محاولة محليًا؛ إن كانت مرفوعة إلى السحابة تُسجَّل حذفًا معلّقًا يُنفَّذ عند الاتصال */
  function removeAttempt(juz, started) {
    dropLocal(juz, started);
    var s = st();
    if (slotOf(s, juz, started) !== null && !isPending(s, juz, started)) { s.pending.push({ juz: juz, started: started }); saveSt(s); }
    if (S.user) syncNow();
  }
  /* لا يزيد المحفوظ عن 5 في الجزء: تُحذف الأقدم */
  function enforceCap(juz) {
    var l = list(juz).sort(function (x, y) { return x.started - y.started; }), n = 0;
    while (l.length > MAX) { removeAttempt(juz, l.shift().started); n++; }
    return n;
  }

  /* ---- Firebase boot (lazy) ---- */
  function boot() {
    if (S.booting) return S.booting;
    S.booting = (window.__FB_MOCK__ ? Promise.resolve([window.__FB_MOCK__, window.__FB_MOCK__, window.__FB_MOCK__]) : Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")])).then(function (m) {
      var app = m[0].initializeApp(CFG);
      S.fb = { auth: m[1], fs: m[2], a: m[1].getAuth(app), db: m[2].getFirestore(app) };
      S.fb.auth.onAuthStateChanged(S.fb.a, function (u) { S.user = u; emit(u ? "signed-in" : "idle"); if (u) syncNow(); });
      return S.fb;
    }).catch(function (e) { S.booting = null; emit("error", "تعذّر تحميل خدمة المزامنة. تحقق من الاتصال بالإنترنت."); throw e; });
    return S.booting;
  }

  function attemptRef(n, juz, slot) { return S.fb.fs.doc(S.fb.db, "users", S.user.uid, "attempts", juz + "_" + slot); }

  /* كتابة محاولة في أول خانة فارغة (معاملة تمنع الكتابة فوق محاولة جهاز آخر) */
  function pushOne(s, juz, a) {
    s.slots[juz] = s.slots[juz] || {};
    var cands = [1, 2, 3, 4, 5].filter(function (n) { return !s.slots[juz][n]; }), fs = S.fb.fs;
    function tryNext(i) {
      if (i >= cands.length) return Promise.resolve(false);
      var n = cands[i], ref = attemptRef(null, juz, n);
      return fs.runTransaction(S.fb.db, function (tx) {
        return tx.get(ref).then(function (snap) {
          var d = snap.exists() ? snap.data() : null;
          if (d && !d.deleted && d.started !== a.started) return { taken: d.started };
          var data = enc(juz, a); data.slot = n; data.at = fs.serverTimestamp();
          tx.set(ref, data); return { ok: true };
        });
      }).then(function (r) {
        if (r.ok) { s.slots[juz][n] = a.started; saveSt(s); return true; }
        s.slots[juz][n] = r.taken; saveSt(s);
        return tryNext(i + 1);
      });
    }
    return tryNext(0);
  }

  /* تنفيذ حذف معلّق: علامة حذف في الخانة (لا حذف للوثيقة حتى تراها الأجهزة الأخرى) */
  function pushDelete(s, p) {
    var slot = slotOf(s, p.juz, p.started), fs = S.fb.fs;
    function finish() {
      if (slot !== null) { delete s.slots[p.juz][slot]; }
      s.pending = s.pending.filter(function (x) { return !(x.juz === p.juz && x.started === p.started); });
      saveSt(s);
    }
    if (slot === null) { finish(); return Promise.resolve(); }
    var ref = attemptRef(null, p.juz, slot);
    return fs.runTransaction(S.fb.db, function (tx) {
      return tx.get(ref).then(function (snap) {
        var d = snap.exists() ? snap.data() : null;
        if (d && !d.deleted && d.started === p.started) tx.set(ref, { juz: p.juz, slot: +slot, started: p.started, deleted: true, at: fs.serverTimestamp() });
      });
    }).then(finish);
  }

  /* ---- المزامنة: سحب الجديد، قصّ الزائد، تنفيذ الحذوفات، رفع غير المرفوع ---- */
  function syncNow() {
    if (!S.user || !S.fb) return Promise.resolve();
    if (S.busy) { S.again = true; return Promise.resolve(); }
    S.busy = true; emit("syncing");
    var fs = S.fb.fs, uid = S.user.uid, col = fs.collection(S.fb.db, "users", uid, "attempts");
    var s = st(), changed = false;
    if (s.uid !== uid) { s = { uid: uid, last: 0, slots: {}, pending: [] }; saveSt(s); }
    if (s.v !== 2) { s.v = 2; s.last = 0; del(NS + ":synced"); del(NS + ":lastPull"); saveSt(s); }   // migrate: full pull once, removes old-format docs
    var maxAt = s.last;
    var q = s.last ? fs.query(col, fs.where("at", ">", fs.Timestamp.fromMillis(s.last))) : col;
    return fs.getDocs(q).then(function (snap) {
      var legacy = [];
      snap.forEach(function (d) {
        var x = d.data(), m = /^(juz-\d\d)_([1-5])$/.exec(d.id);
        if (x.at && x.at.toMillis() > maxAt) maxAt = x.at.toMillis();
        if (!m) { if (x.slots && x.juz && mergeLocal(s, x.juz, dec(x))) changed = true; legacy.push(d.ref); return; }
        var juz = m[1], slot = m[2];
        s.slots[juz] = s.slots[juz] || {};
        if (x.deleted) { if (dropLocal(juz, x.started)) changed = true; delete s.slots[juz][slot]; }
        else { if (mergeLocal(s, juz, dec(x))) changed = true; s.slots[juz][slot] = x.started; }
      });
      s.last = maxAt; saveSt(s);
      return Promise.all(legacy.map(function (r) { return fs.deleteDoc(r); }));
    }).then(function () {
      localJuz().forEach(function (juz) { if (enforceCapQuiet(juz)) changed = true; });
      s = st();
      return s.pending.slice().reduce(function (p, d) { return p.then(function () { return pushDelete(s, d); }); }, Promise.resolve());
    }).then(function () {
      var chain = Promise.resolve();
      localJuz().forEach(function (juz) {
        list(juz).forEach(function (a) {
          if (slotOf(s, juz, a.started) !== null) return;
          chain = chain.then(function () { return pushOne(s, juz, a); });
        });
      });
      return chain;
    }).then(function () {
      emit("synced");
      if (changed) window.dispatchEvent(new Event("msync-changed"));
    }).catch(function (e) {
      emit("error", e && e.code === "permission-denied" ? "رُفض الوصول: تحقق من قواعد Firestore." : "تعذّرت المزامنة الآن؛ ستُعاد تلقائيًا عند المحاولة التالية.");
    }).then(function () {
      S.busy = false; if (S.again) { S.again = false; return syncNow(); }
    });
  }
  function enforceCapQuiet(juz) {
    var l = list(juz).sort(function (x, y) { return x.started - y.started; }), n = 0;
    while (l.length > MAX) { var a = l.shift(); dropLocal(juz, a.started); var s = st(); if (slotOf(s, juz, a.started) !== null && !isPending(s, juz, a.started)) { s.pending.push({ juz: juz, started: a.started }); saveSt(s); } n++; }
    return n;
  }

  /* ---- واجهة عامة ---- */
  var API = {
    MAX: MAX,
    enabled: enabled,
    on: function (cb) { S.cbs.push(cb); cb({ user: S.user, status: S.status, error: S.err }); },
    state: function () { return { user: S.user, status: S.status }; },
    syncNow: syncNow,
    onSubmit: function () { if (S.user) syncNow(); },
    removeAttempt: removeAttempt,
    enforceCap: enforceCap,
    signIn: function () {
      set(FLAG, 1);
      return boot().then(function (fb) {
        var p = new fb.auth.GoogleAuthProvider();
        return fb.auth.signInWithPopup(fb.a, p).catch(function (e) {
          if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return fb.auth.signInWithRedirect(fb.a, p);
          if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) { del(FLAG); return; }
          throw e;
        });
      }).catch(function (e) {
        if (e && e.code === "auth/unauthorized-domain") emit("error", "هذا الموقع غير مضاف إلى النطاقات المصرّح بها في Firebase.");
        else if (S.status !== "error") emit("error", "تعذّر تسجيل الدخول.");
      });
    },
    signOut: function () {
      del(FLAG);
      return (S.fb ? S.fb.auth.signOut(S.fb.a) : Promise.resolve()).then(function () { S.user = null; emit("idle"); });
    },
    /* يحذف محاولات المستخدم من الخادم ثم حسابه في Firebase. لا يمس النسخة المحلية في المتصفح. */
    deleteData: function () {
      if (!S.user || !S.fb) return Promise.resolve(false);
      var fs = S.fb.fs, u = S.user;
      emit("syncing");
      return fs.getDocs(fs.collection(S.fb.db, "users", u.uid, "attempts")).then(function (snap) {
        var jobs = []; snap.forEach(function (d) { jobs.push(fs.deleteDoc(d.ref)); });
        return Promise.all(jobs);
      }).then(function () {
        return S.fb.auth.deleteUser(u).catch(function (e) {
          if (e && e.code === "auth/requires-recent-login") {
            return S.fb.auth.reauthenticateWithPopup(u, new S.fb.auth.GoogleAuthProvider()).then(function () { return S.fb.auth.deleteUser(S.fb.a.currentUser); });
          }
          throw e;
        });
      }).then(function () {
        del(FLAG); del(ST); S.user = null; emit("idle"); return true;
      }).catch(function () { emit("error", "تعذّر حذف البيانات؛ حاول مرة أخرى."); return false; });
    }
  };
  window.MSync = API;

  /* استعادة الجلسة تلقائيًا إن كان المستخدم قد فعّل المزامنة سابقًا */
  if (enabled() && get(FLAG, 0)) boot().catch(function () {});
})();
