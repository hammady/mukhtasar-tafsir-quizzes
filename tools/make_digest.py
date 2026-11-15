"""Per-juz digest of المختصر (tafsir text with explained words marked _like this_) + page fawaed."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from juz_meta import ayat, pages, label, SURAH_NAMES  # noqa: E402

SRC = os.path.join(ROOT, "source")
OUT = os.path.join(SRC, "digest")
os.makedirs(OUT, exist_ok=True)
missing = 0
for j in range(1, 31):
    lines = [f"# الجزء {j} — {label(j)}", "", "## الآيات وتفسير المختصر", "(الكلمات بين _شرطتين_ هي الكلمات القرآنية المشروحة في المختصر)", ""]
    for s, a in ayat(j):
        p = os.path.join(SRC, "ayat", f"{s:03d}_{a:03d}.json")
        if not os.path.exists(p):
            missing += 1
            continue
        d = json.load(open(p, encoding="utf-8"))
        lines.append(f"[{SURAH_NAMES[s-1]}: {a}] ﴿{d['ayah']}﴾")
        lines.append(f"المختصر: {d['mukhtasar']}")
        lines.append("")
    lines += ["## فوائد المختصر لصفحات الجزء", ""]
    p1, p2 = pages(j)
    for pg in range(p1, p2 + 1):
        f = json.load(open(os.path.join(SRC, "fawaed", f"{pg:03d}.json"), encoding="utf-8"))
        for it in f.get("items", []):
            lines.append(f"ص {pg}: {it.lstrip('• ').strip()}")
    open(os.path.join(OUT, f"juz-{j:02d}.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("digests written; missing ayat:", missing)
