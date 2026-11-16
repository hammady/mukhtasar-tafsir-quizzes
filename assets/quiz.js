/* محاكي اختبارات مُدَّكِر — يعمل بلا خادم. البيانات في window.QUIZ */
(function () {
  "use strict";
  var Q = window.QUIZ;
  var NS = "moddaker-mukhtasar";
  var KEY_ATT = NS + ":attempts:" + Q.id;
  var KEY_CUR = NS + ":current:" + Q.id;
  var MAXA = (window.MSync && window.MSync.MAX) || 5;
  var PER_PAGE = 1;
  var LETTERS = ["a", "b", "c", "d", "e"];
  var app = document.getElementById("app");
  var timerHandle = null;

  /* ---------- storage (fails soft) ---------- */
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  var AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  function fmtDate(ts) {
    var d = new Date(ts), h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return AR_DAYS[d.getDay()] + "، " + d.getDate() + " " + AR_MONTHS[d.getMonth()] + " " + d.getFullYear() + "، " + h + ":" + (m < 10 ? "0" : "") + m + " " + ap;
  }
  function fmtDur(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), r = s % 60, out = [];
    if (m) out.push(m + " دقائق"); if (r || !m) out.push(r + " ثواني"); return out.join(" ");
  }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return h + ":" + (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }
  function byId(id) { for (var i = 0; i < Q.questions.length; i++) if (Q.questions[i].id === id) return Q.questions[i]; }
  function band(p) {
    if (p >= 90) return { c: "#2f6b3a", h: "🌟 امتياز مرتفع (90% - 100%)", t: "أداء استثنائي! أنت مستعد للاختبار الشامل في هذا الجزء.", tip: "💡 راجع الأسئلة الخاطئة إن وجدت لضمان العلامة الكاملة." };
    if (p >= 80) return { c: "#3f6e8c", h: "⭐ امتياز (80% - 89%)", t: "أداء ممتاز، بقي القليل لتبلغ التمام.", tip: "💡 ركِّز على الكلمات الغريبة التي أخطأت فيها وأعد قراءة تفسيرها في المختصر." };
    if (p >= 70) return { c: "#4B365F", h: "✅ جيد جداً (70% - 79%)", t: "مستواك مطمئن، ولكن يمكنك تحسينه أكثر.", tip: "💡 هام: راجع الأخطاء أدناه، ثم أعد المحاولة بعد مراجعة صفحات الجزء." };
    if (p >= 60) return { c: "#8a6d1f", h: "👍 جيد (60% - 69%)", t: "تحتاج إلى مراجعة إضافية لهذا الجزء.", tip: "💡 اقرأ تفسير المختصر لصفحات الجزء مع التركيز على الكلمات المشروحة والفوائد." };
    return { c: "#8a2b2b", h: "⚠️ يحتاج إلى مراجعة (أقل من 60%)", t: "هذا الجزء يحتاج إلى مذاكرة مركّزة قبل الاختبار الشامل.", tip: "💡 ابدأ بمراجعة الأخطاء أدناه واحدًا واحدًا، ثم أعد الاختبار." };
  }

  /* ---------- attempts ---------- */
  function attempts() { return load(KEY_ATT, []); }
  function current() { return load(KEY_CUR, null); }

  function removeAttempt(started) {
    if (window.MSync) return window.MSync.removeAttempt(Q.id, started);
    save(KEY_ATT, attempts().filter(function (a) { return a.started !== started; }));
  }
  function confirmDelete(a, n, done) {
    var signed = window.MSync && window.MSync.state().user;
    modal("حذف المحاولة", "<p>سيتم حذف المحاولة رقم " + n + " (" + fmtDate(a.finished) + ") نهائيًا من هذا المتصفح" + (signed ? " ومن حسابك السحابي أيضًا. وإن كنت غير متصل بالإنترنت فسيُنفَّذ الحذف السحابي عند عودة الاتصال." : ".") + "</p>",
      "حذف نهائيًا", function () { removeAttempt(a.started); done(); });
  }

  function newAttempt() {
    var qs = shuffle(Q.questions).slice(0, Q.questions_per_attempt || Q.questions.length);
    var now = Date.now();
    var cur = {
      started: now, deadline: now + Q.time_limit_min * 60000, page: 0,
      slots: qs.map(function (q) { return { id: q.id, order: shuffle(q.options.map(function (_, i) { return i; })), resp: null, flag: false }; })
    };
    save(KEY_CUR, cur);
    return cur;
  }

  function grade(cur, finishedAt) {
    var marks = 0;
    cur.slots.forEach(function (s) { var q = byId(s.id); s.ok = s.resp !== null && q && s.resp === q.answer; if (s.ok) marks++; });
    var rec = { started: cur.started, finished: finishedAt, slots: cur.slots, marks: marks, total: cur.slots.length, timeout: !!cur.timeout };
    var all = attempts(); all.push(rec); save(KEY_ATT, all); drop(KEY_CUR);
    if (window.MSync) { window.MSync.enforceCap(Q.id); window.MSync.onSubmit(); }
    return attempts().length - 1;
  }

  /* ---------- views ---------- */
  function setTitle(sub) { document.title = Q.title + (sub ? ": " + sub : "") + " | مدكر"; }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } var t = document.getElementById("tbtimer"); if (t) t.textContent = ""; }

  function viewStart() {
    stopTimer(); setTitle("");
    var all = attempts(), cur = current();
    var best = all.reduce(function (b, a) { return Math.max(b, a.marks / a.total * 100); }, -1);
    var rows = all.map(function (a, i) {
      var p = a.marks / a.total * 100;
      return "<tr><td class='center'>" + (i + 1) + "</td><td>منتهية<br><small>تم التسليم " + fmtDate(a.finished) + "</small></td><td class='center'>" + a.marks.toFixed(2) + "</td><td class='center'>" + (p).toFixed(2) + "</td><td class='center'><a href='#review/" + i + "'>مراجعة</a></td><td class='center'><button class='btn btn-link' data-del='" + i + "' style='color:#c62828'>حذف</button></td></tr>";
    }).join("");
    app.innerHTML =
      "<div class='crumbs'><a href='" + Q.home + "'>الصفحة الرئيسية</a> / " + esc(Q.title) + "</div>" +
      "<div class='card'><h1 class='qtitle'>" + esc(Q.title) + "</h1>" +
      "<div class='notice'>" + esc(Q.description) + "</div>" +
      "<div class='quizinfo'><p>عدد الأسئلة: " + (Q.questions_per_attempt || Q.questions.length) + " سؤالًا (ترتيب عشوائي للأسئلة والخيارات)</p><p>المحاولات: غير محدودة العدد، لكن يُحفظ منها حتى " + MAXA + " في كل جزء في الوقت نفسه. احذف محاولة قديمة لتبدأ محاولة جديدة.</p><p>المحاولات المحفوظة الآن: " + all.length + " من " + MAXA + "</p><p>الحد الزمني: " + Q.time_limit_min + " دقيقة</p><p>طريقة التقييم: أعلى درجة</p></div>" +
      (all.length ? "<h3>ملخص محاولاتك السابقة</h3><table class='gen'><thead><tr><th class='center'>المحاولة</th><th>الحالة</th><th class='center'>العلامات / " + all[0].total.toFixed(2) + "</th><th class='center'>الدرجة / 100.00</th><th class='center'>مراجعة</th><th class='center'>حذف</th></tr></thead><tbody>" + rows + "</tbody></table>" +
        "<p class='center'><b>أعلى درجة: " + best.toFixed(2) + " / 100.00</b></p>" : "") +
      "<div class='center' style='margin-top:18px'>" +
      (cur ? "<button class='btn btn-primary' id='go'>متابعة المحاولة الأخيرة</button>" : (all.length >= MAXA ? "<div class='notice' style='display:inline-block'>وصلت إلى الحد الأقصى (" + MAXA + " محاولات محفوظة لهذا الجزء). احذف إحداها من الجدول أعلاه لتتمكن من بدء محاولة جديدة.</div>" : "<button class='btn btn-primary' id='go'>" + (all.length ? "إعادة محاولة الاختبار" : "ابدأ المحاولة") + "</button>")) +
      "</div></div>";
    app.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { var i = +b.dataset.del; confirmDelete(all[i], i + 1, viewStart); }; });
    var goBtn = document.getElementById("go"); if (!goBtn) return;
    goBtn.onclick = function () {
      if (cur) { location.hash = "attempt"; return; }
      if (attempts().length >= MAXA) { viewStart(); return; }
      modal("اختبار محدد بزمن", "<p>هذا الاختبار له حد زمني قدره <b>" + Q.time_limit_min + " دقيقة</b>. سيبدأ العد التنازلي فور بدء المحاولة ولا يمكن إيقافه، ويجب التسليم قبل انتهاء الوقت.</p><p>هل أنت متأكد من رغبتك في البدء الآن؟</p>",
        "ابدأ المحاولة", function () { newAttempt(); location.hash = "attempt"; });
    };
  }

  function navBlock(cur, mode, curPage) {
    var html = "<div class='navblock'><h3>التنقل في الاختبار</h3>";
    if (mode === "attempt") html += "<div class='timer' id='timer'>الوقت المتبقي <b id='tleft'>" + clock(cur.deadline - Date.now()) + "</b></div>";
    html += "<div class='qnbuttons'>" + cur.slots.map(function (s, i) {
      var cls = "qnb";
      if (mode === "attempt") { if (s.resp !== null) cls += " answered"; if (i === curPage) cls += " current"; }
      else cls += s.ok ? " correct" : " incorrect";
      if (s.flag) cls += " flagged";
      return "<button class='" + cls + "' data-i='" + i + "' title='سؤال " + (i + 1) + "'><span class='n'>" + (i + 1) + "</span><span class='st'></span></button>";
    }).join("") + "</div>";
    if (mode === "attempt") html += "<button class='btn btn-link' id='finish'>إنهاء المحاولة...</button>";
    else html += "<a class='btn btn-link' href='#review-all'>عرض كل الأسئلة في صفحة واحدة</a><br><a class='btn btn-link' href='#'>إنهاء المراجعة</a>";
    return html + "</div>";
  }

  function qInfo(i, stateTxt, gradeTxt, s, editable) {
    return "<div class='info'><h3 class='no'>سؤال <span class='qno'>" + (i + 1) + "</span></h3><div class='state'>" + stateTxt + "</div><div class='grade'>" + gradeTxt + "</div>" +
      (editable ? "<div class='flag' data-flag='" + i + "'>" + (s.flag ? "🚩 أزل العلامة" : "⚐ علِّم هذا السؤال") + "</div>" : (s.flag ? "<div class='flag'>🚩 مُعلَّم</div>" : "")) + "</div>";
  }

  function qText(q) {
    return "<div class='qtext'><div class='stem'>" + (q.ayah ? "قال تعالى: <span class='ayah'>﴿" + esc(q.ayah) + "﴾</span> [" + esc(q.ref) + "]؛ " : (q.ref ? "[" + esc(q.ref) + "] " : "")) + esc(q.stem) + "</div></div>";
  }

  function viewAttempt() {
    var cur = current();
    if (!cur) { location.hash = ""; return; }
    if (Date.now() >= cur.deadline) { cur.timeout = true; save(KEY_CUR, cur); var idx = grade(cur, cur.deadline); location.hash = "review/" + idx; return; }
    setTitle("محاولة");
    var p = Math.min(cur.page || 0, cur.slots.length - 1);
    var s = cur.slots[p], q = byId(s.id);
    var opts = s.order.map(function (oi, k) {
      return "<label><input type='radio' name='ans' value='" + oi + "'" + (s.resp === oi ? " checked" : "") + "><span class='an'>" + LETTERS[k] + ".</span><span>" + esc(q.options[oi]) + "</span></label>";
    }).join("");
    app.innerHTML = "<div class='attempt'><div>" +
      "<div class='que'>" + qInfo(p, s.resp === null ? "لم تتم الإجابة بعد" : "تم حفظ الإجابة", "الدرجة من 1.00", s, true) +
      "<div class='content'><div class='formulation'>" + qText(q) + "<p class='prompt'>إختر أحد الخيارات:</p><div class='answer'>" + opts + "</div>" +
      (s.resp !== null ? "<button class='btn btn-link' id='clr'>إزالة اختياري</button>" : "") + "</div></div></div>" +
      "<div class='pager'>" + (p > 0 ? "<button class='btn btn-secondary' id='prev'>الصفحة السابقة</button>" : "<span></span>") +
      "<button class='btn btn-primary' id='next'>" + (p < cur.slots.length - 1 ? "الصفحة التالية" : "إنهاء المحاولة...") + "</button></div>" +
      "</div>" + navBlock(cur, "attempt", p) + "</div>";
    function persist() { save(KEY_CUR, cur); }
    app.querySelectorAll("input[name=ans]").forEach(function (r) { r.onchange = function () { s.resp = +r.value; persist(); viewAttempt(); }; });
    var clr = document.getElementById("clr"); if (clr) clr.onclick = function () { s.resp = null; persist(); viewAttempt(); };
    app.querySelector("[data-flag]").onclick = function () { s.flag = !s.flag; persist(); viewAttempt(); };
    var prev = document.getElementById("prev"); if (prev) prev.onclick = function () { cur.page = p - 1; persist(); viewAttempt(); scrollTo(0, 0); };
    document.getElementById("next").onclick = function () { if (p < cur.slots.length - 1) { cur.page = p + 1; persist(); viewAttempt(); scrollTo(0, 0); } else location.hash = "summary"; };
    document.getElementById("finish").onclick = function () { location.hash = "summary"; };
    app.querySelectorAll(".qnb").forEach(function (b) { b.onclick = function () { cur.page = +b.dataset.i; persist(); viewAttempt(); scrollTo(0, 0); }; });
    startTimer(cur);
  }

  function startTimer(cur) {
    stopTimer();
    function tick() {
      var left = cur.deadline - Date.now(), el = document.getElementById("tleft");
      if (el) { el.textContent = clock(left); document.getElementById("timer").classList.toggle("low", left < 5 * 60000); }
      var tb = document.getElementById("tbtimer"); if (tb) { tb.textContent = "⏱ " + clock(left); tb.classList.toggle("low", left < 5 * 60000); }
      if (left <= 0) {
        stopTimer(); var c = current(); if (!c) return; c.timeout = true; save(KEY_CUR, c);
        var idx = grade(c, c.deadline);
        modal("انتهى الوقت", "<p>انتهى الوقت المحدد للاختبار، وتم إرسال محاولتك تلقائيًا.</p>", "مراجعة المحاولة", function () { location.hash = "review/" + idx; }, true);
      }
    }
    tick(); timerHandle = setInterval(tick, 1000);
  }

  function viewSummary() {
    var cur = current(); if (!cur) { location.hash = ""; return; }
    setTitle("ملخص المحاولة");
    var unanswered = cur.slots.filter(function (s) { return s.resp === null; }).length;
    app.innerHTML = "<div class='attempt'><div class='card'><h1 class='qtitle'>ملخص المحاولة</h1>" +
      "<table class='gen'><thead><tr><th class='center'>سؤال</th><th>الحالة</th></tr></thead><tbody>" +
      cur.slots.map(function (s, i) { return "<tr><td class='center'>" + (s.flag ? "🚩 " : "") + "<a href='#' data-go='" + i + "'>" + (i + 1) + "</a></td><td class='" + (s.resp === null ? "state-none" : "") + "'>" + (s.resp === null ? "لم تتم الإجابة بعد" : "تم حفظ الإجابة") + "</td></tr>"; }).join("") +
      "</tbody></table><div class='center'><button class='btn btn-secondary' id='back'>العودة إلى المحاولة</button>" +
      "<p style='margin:14px 0 6px'>يجب أن يتم إرسال هذه المحاولة قبل انتهاء الوقت.</p>" +
      "<button class='btn btn-primary' id='submit'>إرسال الكل وإنهاء</button></div></div>" + navBlock(cur, "attempt", -1) + "</div>";
    app.querySelectorAll("[data-go]").forEach(function (a) { a.onclick = function (e) { e.preventDefault(); cur.page = +a.dataset.go; save(KEY_CUR, cur); location.hash = "attempt"; }; });
    app.querySelectorAll(".qnb").forEach(function (b) { b.onclick = function () { cur.page = +b.dataset.i; save(KEY_CUR, cur); location.hash = "attempt"; }; });
    document.getElementById("back").onclick = document.getElementById("finish").onclick = function () { location.hash = "attempt"; };
    document.getElementById("submit").onclick = function () {
      modal("تأكيد", "<p>بمجرد الإرسال، لن تتمكن من تغيير إجاباتك لهذه المحاولة." + (unanswered ? "<br><b style='color:#c62828'>تنبيه: لديك " + unanswered + " سؤال/أسئلة بلا إجابة.</b>" : "") + "</p>",
        "إرسال الكل وإنهاء", function () { var c = current(); if (!c) return; var idx = grade(c, Date.now()); location.hash = "review/" + idx; });
    };
    startTimer(cur);
  }

  function renderReviewQ(a, s, i) {
    var q = byId(s.id); if (!q) return "";
    var opts = s.order.map(function (oi, k) {
      var cls = "", ic = "";
      if (oi === q.answer) { cls = "is-correct"; ic = "<span class='ok-ic'>✓</span>"; }
      else if (oi === s.resp) { cls = "is-wrong"; ic = "<span class='bad-ic'>✗</span>"; }
      return "<label class='" + cls + "'><input type='radio' disabled" + (s.resp === oi ? " checked" : "") + "><span class='an'>" + LETTERS[k] + ".</span><span>" + esc(q.options[oi]) + "</span>" + ic + "</label>";
    }).join("");
    var stateTxt = s.resp === null ? "<span class='state-wrong'>لم تتم الإجابة</span>" : (s.ok ? "<span class='state-correct'>صحيح</span>" : "<span class='state-wrong'>خطأ</span>");
    var fb = "<div class='sfb" + (s.ok ? "" : " bad") + "'><b>" + (s.ok ? "إجابة صحيحة." : (s.resp === null ? "لم تُجب عن هذا السؤال." : "إجابة خاطئة.")) + "</b><br>" +
      (q.type === "faida" ? "الفائدة كما في المختصر: " : "التفسير: ") + esc(q.explanation).replace(/_([^_]+)_/g, "<b>$1</b>").replace(/_/g, "") + "<span class='src'>[المختصر في تفسير القرآن الكريم" + (q.page ? " — ص " + q.page : "") + "]</span></div>";
    return "<div class='que' id='q" + i + "'>" + qInfo(i, stateTxt, "درجة " + (s.ok ? "1.00" : "0.00") + " من 1.00", s, false) +
      "<div class='content'><div class='formulation'>" + qText(q) + "<span class='tag'>" + (q.type === "faida" ? "فوائد الآيات" : "معاني الكلمات") + "</span><div class='answer' style='margin-top:8px'>" + opts + "</div>" + fb + "</div></div></div>";
  }

  function viewReview(idx, onlyWrong) {
    stopTimer();
    var all = attempts(), a = all[idx]; if (!a) { location.hash = ""; return; }
    setTitle("مراجعة المحاولة");
    var p = a.marks / a.total * 100, b = band(p);
    var list = a.slots.map(function (s, i) { return (!onlyWrong || !s.ok) ? renderReviewQ(a, s, i) : ""; }).join("");
    app.innerHTML = "<div class='attempt'><div><div class='card' style='margin-bottom:20px'>" +
      "<table class='reviewsum'>" +
      "<tr><th>الحالة</th><td>منتهية" + (a.timeout ? " (أُرسلت تلقائيًا عند انتهاء الوقت)" : "") + "</td></tr>" +
      "<tr><th>بدأ</th><td>" + fmtDate(a.started) + "</td></tr>" +
      "<tr><th>إكتمل</th><td>" + fmtDate(a.finished) + "</td></tr>" +
      "<tr><th>الفترة</th><td>" + fmtDur(a.finished - a.started) + "</td></tr>" +
      "<tr><th>العلامات</th><td>" + a.marks.toFixed(2) + "/" + a.total.toFixed(2) + "</td></tr>" +
      "<tr><th>الدرجة</th><td><b>" + p.toFixed(2) + "</b> من 100.00 (<b>" + Math.round(p) + "</b>%)</td></tr>" +
      "<tr><th>الإفادة</th><td><div class='band'><div class='bh' style='background:" + b.c + "'>" + b.h + "</div><div class='bb'>" + b.t + "<div class='tip'>" + b.tip + "</div></div></div></td></tr>" +
      "</table><div class='center'>" +
      "<button class='btn btn-secondary' id='delattempt' style='color:#c62828'>حذف هذه المحاولة</button> " + (onlyWrong ? "<a class='btn btn-secondary' href='#review/" + idx + "'>عرض كل الأسئلة</a>" : "<a class='btn btn-secondary' href='#review/" + idx + "/wrong'>عرض الأخطاء فقط (" + (a.total - a.marks) + ")</a>") +
      " <a class='btn btn-primary' href='#'>إنهاء المراجعة</a></div></div>" + (list || "<div class='card center'>لا توجد أخطاء في هذه المحاولة. بارك الله فيك!</div>") +
      "</div>" + navBlock(a, "review") + "</div>";
    app.querySelectorAll(".qnb").forEach(function (bt) { bt.onclick = function () { var el = document.getElementById("q" + bt.dataset.i); if (el) el.scrollIntoView({ behavior: "smooth" }); }; });
    document.getElementById("delattempt").onclick = function () { confirmDelete(a, idx + 1, function () { location.hash = ""; }); };
    var ra = app.querySelector("a[href='#review-all']"); if (ra) ra.setAttribute("href", "#review/" + idx);
  }

  function modal(title, body, okTxt, onOk, noCancel) {
    var bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = "<div class='modal' role='dialog'><div class='mh'>" + title + "</div><div class='mb'>" + body + "</div><div class='mf'><button class='btn btn-primary' data-ok>" + okTxt + "</button>" + (noCancel ? "" : "<button class='btn btn-secondary' data-cancel>إلغاء</button>") + "</div></div>";
    document.body.appendChild(bg);
    bg.querySelector("[data-ok]").onclick = function () { bg.remove(); onOk(); };
    var c = bg.querySelector("[data-cancel]"); if (c) c.onclick = function () { bg.remove(); };
  }

  function route() {
    document.querySelectorAll(".modal-bg").forEach(function (m) { m.remove(); });
    var h = location.hash.replace(/^#/, "");
    if (h === "attempt") return viewAttempt();
    if (h === "summary") return viewSummary();
    var m = h.match(/^review\/(\d+)(\/wrong)?$/); if (m) { scrollTo(0, 0); return viewReview(+m[1], !!m[2]); }
    viewStart();
  }
  window.addEventListener("hashchange", route);
  route();
})();
