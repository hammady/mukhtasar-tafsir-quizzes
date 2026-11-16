/* مزامنة اختيارية للتقدم عبر Firebase (Google sign-in + Firestore).
 * لا يُحمَّل شيء من Firebase إلا إذا ضغط المستخدم «تسجيل الدخول» أو كان قد سجّل الدخول سابقًا.
 * المتصفح هو النسخة الأساسية دائمًا؛ السحابة نسخة إضافية. */
(function () {
  "use strict";
  var CFG = window.FIREBASE_CFG;
  var NS = "moddaker-mukhtasar", FLAG = NS + ":syncOn", DONE = NS + ":synced", LAST = NS + ":lastPull";
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

  /* ---- attempt <-> compact Firestore document (Firestore has no nested arrays) ---- */
  function enc(juz, a) {
    return {
      juz: juz, started: a.started, finished: a.finished, marks: a.marks, total: a.total, timeout: !!a.timeout,
      slots: a.slots.map(function (s) { return [s.id, s.order.join(""), s.resp === null ? -1 : s.resp, s.flag ? 1 : 0, s.ok ? 1 : 0].join("|"); })
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
  function docId(juz, a) { return juz + "_" + a.started; }
  function localKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(NS + ":attempts:") === 0) out.push(k); } } catch (e) {}
    return out;
  }
  function mergeLocal(juz, a) {
    var k = NS + ":attempts:" + juz, list = get(k, []);
    if (list.some(function (x) { return x.started === a.started; })) return false;
    list.push(a); list.sort(function (x, y) { return x.started - y.started; }); set(k, list);
    return true;
  }

  /* ---- Firebase boot (lazy) ---- */
  function boot() {
    if (S.booting) return S.booting;
    S.booting = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")]).then(function (m) {
      var app = m[0].initializeApp(CFG);
      S.fb = { auth: m[1], fs: m[2], a: m[1].getAuth(app), db: m[2].getFirestore(app) };
      S.fb.auth.onAuthStateChanged(S.fb.a, function (u) { S.user = u; emit(u ? "signed-in" : "idle"); if (u) syncNow(); });
      return S.fb;
    }).catch(function (e) { S.booting = null; emit("error", "تعذّر تحميل خدمة المزامنة. تحقق من الاتصال بالإنترنت."); throw e; });
    return S.booting;
  }

  /* ---- sync: pull new cloud attempts, push local ones not yet uploaded ---- */
  function syncNow() {
    if (!S.user || !S.fb) return Promise.resolve();
    if (S.busy) { S.again = true; return Promise.resolve(); }
    S.busy = true; emit("syncing");
    var fs = S.fb.fs, col = fs.collection(S.fb.db, "users", S.user.uid, "attempts");
    var last = +get(LAST, 0) || 0, done = {}, maxAt = last, pulled = 0;
    get(DONE, []).forEach(function (id) { done[id] = 1; });
    var q = last ? fs.query(col, fs.where("at", ">", fs.Timestamp.fromMillis(last))) : col;
    return fs.getDocs(q).then(function (snap) {
      snap.forEach(function (d) {
        var x = d.data();
        if (mergeLocal(x.juz, dec(x))) pulled++;
        done[d.id] = 1;
        if (x.at && x.at.toMillis() > maxAt) maxAt = x.at.toMillis();
      });
      var jobs = [];
      localKeys().forEach(function (k) {
        var juz = k.slice((NS + ":attempts:").length);
        get(k, []).forEach(function (a) {
          var id = docId(juz, a);
          if (done[id]) return;
          var data = enc(juz, a); data.at = fs.serverTimestamp();
          jobs.push(fs.setDoc(fs.doc(S.fb.db, "users", S.user.uid, "attempts", id), data).then(function () { done[id] = 1; }));
        });
      });
      return Promise.all(jobs);
    }).then(function () {
      set(DONE, Object.keys(done)); if (maxAt) set(LAST, maxAt);
      emit("synced");
      if (pulled) window.dispatchEvent(new Event("msync-changed"));
    }).catch(function (e) {
      emit("error", e && e.code === "permission-denied" ? "رُفض الوصول: تحقق من قواعد Firestore." : "تعذّرت المزامنة الآن؛ ستُعاد تلقائيًا عند المحاولة التالية.");
    }).then(function () {
      S.busy = false; if (S.again) { S.again = false; return syncNow(); }
    });
  }

  /* ---- public API ---- */
  var API = {
    enabled: enabled,
    on: function (cb) { S.cbs.push(cb); cb({ user: S.user, status: S.status, error: S.err }); },
    state: function () { return { user: S.user, status: S.status }; },
    syncNow: syncNow,
    onSubmit: function () { if (S.user) syncNow(); },
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
        del(FLAG); del(DONE); del(LAST); S.user = null; emit("idle"); return true;
      }).catch(function () { emit("error", "تعذّر حذف البيانات؛ حاول مرة أخرى."); return false; });
    }
  };
  window.MSync = API;

  /* استعادة الجلسة تلقائيًا إن كان المستخدم قد فعّل المزامنة سابقًا */
  if (enabled() && get(FLAG, 0)) boot().catch(function () {});
})();
