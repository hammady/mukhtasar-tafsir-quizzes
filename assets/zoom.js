/* تكبير/تصغير صفحة الاختبار كاختصار المتصفح Cmd/Ctrl +/- (مفيد في الشاشات اللمسية).
   يُحفظ في هذا المتصفح فقط، ويسري على صفحات الأجزاء الثلاثين كلها.
   يُحمَّل في <head> ليُطبَّق الحجم قبل رسم الصفحة. */
(function () {
  "use strict";
  var KEY = "mukhtasar-quizzes:zoom";
  var NARROW = 860; // عرض التخطيط الضيق (بالبكسل بعد التكبير)، مثل استعلام الوسائط الذي كان في quiz.css
  var LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]; // مستويات Chrome
  var MIN_W = 180; // أضيق عرض مقبول للمحتوى بعد التكبير؛ أضيق من ذلك يفيض أفقيًا (مثلًا: 375px ÷ 2.5)
  var root = document.documentElement, z = 1; // z: الحجم الذي اختاره المستخدم (محفوظ)

  function valid(v) { v = parseFloat(v); return LEVELS.indexOf(v) >= 0 ? v : 1; }
  try { z = valid(localStorage.getItem(KEY)); } catch (e) {}

  // أكبر مستوى يناسب عرض الشاشة الحالي (200% في الهاتف، حتى 300% في الشاشات العريضة).
  function maxLevel() {
    for (var i = LEVELS.length - 1; i > 0; i--) if (window.innerWidth / LEVELS[i] >= MIN_W) return LEVELS[i];
    return 1;
  }
  function eff() { return Math.min(z, Math.max(1, maxLevel())); }
  function apply() {
    var e = eff();
    // نكبّر المحتوى والنوافذ المنبثقة فقط (‎.wrap و ‎.modal في quiz.css)، ويبقى الشريط العلوي بحجمه
    // حتى يظل المؤقت وأزرار التكبير ظاهرة وفي متناول اليد على الشاشات الصغيرة.
    root.style.setProperty("--z", String(e));
    // مثل تكبير المتصفح: يضيق العرض المتاح فيتحول التخطيط إلى العمود الواحد عند الحاجة.
    root.classList.toggle("narrow", window.innerWidth / e <= NARROW);
    var v = document.getElementById("zv"), m = document.getElementById("zm"), p = document.getElementById("zp");
    if (v) v.textContent = Math.round(e * 100) + "%";
    if (m) m.disabled = e <= LEVELS[0];
    if (p) p.disabled = e >= maxLevel();
  }
  function set(nz) {
    z = nz;
    try { if (z === 1) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(z)); } catch (e) {}
    apply();
  }
  function step(d) {
    var i = LEVELS.indexOf(eff()), n = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + d))];
    if (n <= maxLevel() || d < 0) set(n);
  }

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("storage", function (e) { if (e.key === KEY) { z = valid(e.newValue); apply(); } });

  document.addEventListener("DOMContentLoaded", function () {
    var tb = document.querySelector(".topbar"); if (!tb) return;
    var g = document.createElement("span");
    g.className = "zoom"; g.setAttribute("role", "group"); g.setAttribute("aria-label", "حجم الخط");
    g.innerHTML =
      "<button type='button' id='zm' title='تصغير' aria-label='تصغير الخط'>−</button>" +
      "<button type='button' id='zv' title='الحجم الافتراضي (100%)' aria-label='إعادة حجم الخط الافتراضي'></button>" +
      "<button type='button' id='zp' title='تكبير' aria-label='تكبير الخط'>+</button>";
    tb.insertBefore(g, tb.querySelector("a"));
    document.getElementById("zm").onclick = function () { step(-1); };
    document.getElementById("zp").onclick = function () { step(1); };
    document.getElementById("zv").onclick = function () { set(1); };
    apply();
  });
})();
