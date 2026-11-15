"""Restore المختصر's _marked_ words inside meaning-question explanations.

Each explanation is a verbatim span of المختصر; some were saved with the underscores
removed. This finds the span in the source text and copies it back with its markers.

    python3 tools/restore_marks.py [NN ...]
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from juz_meta import SURAH_NAMES  # noqa: E402
NAME2NUM = {n: i + 1 for i, n in enumerate(SURAH_NAMES)}
SKIP = re.compile(r"[ً-ْٰـ_\s]")


def strip(s):
    """Return (stripped chars, index map back into s) ignoring tashkeel, underscores and spaces."""
    out, idx = [], []
    for i, c in enumerate(s):
        if not SKIP.match(c):
            out.append(c)
            idx.append(i)
    return "".join(out), idx


def restore(expl, src):
    e, _ = strip(expl)
    t, idx = strip(src)
    k = t.find(e)
    if k < 0 or not e:
        return None
    a, b = idx[k], idx[k + len(e) - 1] + 1
    while b < len(src) and src[b] == "_" and src[a:b].count("_") % 2:
        b += 1
    while a > 0 and src[a - 1] == "_" and src[a:b].count("_") % 2:
        a -= 1
    return src[a:b]


def main(js):
    for j in js:
        p = os.path.join(ROOT, "data", f"juz-{j:02d}.json")
        if not os.path.exists(p):
            continue
        bank = json.load(open(p, encoding="utf-8"))
        changed = missed = 0
        for q in bank["questions"]:
            if q.get("type") != "meaning" or "_" in q.get("explanation", ""):
                continue
            m = re.match(r"^(.+?):\s*(\d+)(?:\s*-\s*(\d+))?$", q.get("ref", ""))
            if not m:
                continue
            s = NAME2NUM[m.group(1).strip()]
            a1, a2 = int(m.group(2)), int(m.group(3) or m.group(2))
            src = " ".join(json.load(open(os.path.join(ROOT, "source", "ayat", f"{s:03d}_{a:03d}.json"), encoding="utf-8"))["mukhtasar"] for a in range(a1, a2 + 1))
            r = restore(q["explanation"], src)
            if r is None:
                missed += 1
            elif r != q["explanation"]:
                q["explanation"] = r
                changed += 1
        json.dump(bank, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"juz {j:02d}: restored {changed}, not found {missed}")


if __name__ == "__main__":
    main([int(x) for x in sys.argv[1:]] or range(1, 31))
