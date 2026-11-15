"""Build self-contained quiz pages + dashboard from data/juz-XX.json.

    python3 tools/build.py

Output goes to docs/ (served by GitHub Pages): index.html and juz-01.html … juz-30.html. Each page inlines
its CSS, JS and question bank, so a single .html file can be shared on its own.
"""
import json, os, sys, html
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from juz_meta import label, pages  # noqa: E402

CSS = open(os.path.join(ROOT, "assets/quiz.css"), encoding="utf-8").read()
JS = open(os.path.join(ROOT, "assets/quiz.js"), encoding="utf-8").read()
DASH = open(os.path.join(ROOT, "assets/dashboard.html"), encoding="utf-8").read()
OUT = os.path.join(ROOT, "docs")
os.makedirs(OUT, exist_ok=True)

AR_ORD = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
          "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر",
          "التاسع عشر", "العشرون", "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون", "الرابع والعشرون",
          "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون"]

PAGE = """<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | مدكر</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Amiri&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
<style>{css}</style></head>
<body>
<div class="topbar"><span class="t">برنامج مُدَّكِر — الاختبار الشامل (تدريب): {short}</span><span class="tbt" id="tbtimer"></span><a href="index.html">الرئيسية</a></div>
<div class="wrap"><div id="app"></div></div>
<script>window.QUIZ = {data};</script>
<script>{js}</script>
</body></html>"""

summary = []
for j in range(1, 31):
    p = os.path.join(ROOT, "data", f"juz-{j:02d}.json")
    if not os.path.exists(p):
        summary.append({"juz": j, "label": label(j), "count": 0, "file": None})
        continue
    bank = json.load(open(p, encoding="utf-8"))
    qs = bank["questions"]
    quiz = {
        "id": f"juz-{j:02d}",
        "title": f"اختبار الجزء {AR_ORD[j]} ({label(j)})",
        "description": "أسئلة من «المختصر في تفسير القرآن الكريم» فقط: 40 سؤالًا في المعاني الصعبة والغريبة، و10 أسئلة في فوائد الآيات. تُعرض الأسئلة والخيارات بترتيب عشوائي في كل محاولة.",
        "time_limit_min": bank.get("time_limit_min", 60),
        "questions_per_attempt": bank.get("questions_per_attempt", len(qs)),
        "home": "index.html",
        "questions": qs,
    }
    data = json.dumps(quiz, ensure_ascii=False).replace("</", "<\\/")
    out = PAGE.format(title=html.escape(quiz["title"]), short=f"الجزء {j}", css=CSS, js=JS, data=data)
    open(os.path.join(OUT, f"juz-{j:02d}.html"), "w", encoding="utf-8").write(out)
    summary.append({"juz": j, "label": label(j), "count": len(qs), "file": f"juz-{j:02d}.html",
                    "time": quiz["time_limit_min"], "pages": list(pages(j))})

dash = DASH.replace("/*__JUZ__*/[]", json.dumps(summary, ensure_ascii=False))
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(dash)
print("built", sum(1 for s in summary if s["file"]), "quizzes ->", OUT)
