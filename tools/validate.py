"""Validate data/juz-XX.json against the downloaded المختصر source.

    python3 tools/validate.py            # all
    python3 tools/validate.py 7 8 9      # some ajza

Checks: 40 meaning + 10 faida, 3 distinct options, answer index valid, ayah excerpt is
taken verbatim from the ayah, meaning explanation is verbatim from المختصر of that ayah,
faida explanation is verbatim one of المختصر's fawaed for the cited page of this juz.
"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from juz_meta import ayat, pages, SURAH_NAMES  # noqa: E402
SRC = os.path.join(ROOT, "source")
NAME2NUM = {n: i + 1 for i, n in enumerate(SURAH_NAMES)}


def norm(s):
    s = re.sub(r"[ً-ْٰـ_]", "", s or "")  # tashkeel, tatweel, underscores
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ى", "ي").replace("ة", "ه")
    return re.sub(r"\s+", " ", s).strip()


def check(j):
    errs = []
    p = os.path.join(ROOT, "data", f"juz-{j:02d}.json")
    if not os.path.exists(p):
        return [f"missing {p}"]
    try:
        bank = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        return [f"invalid JSON: {e}"]
    qs = bank.get("questions", [])
    valid = set(ayat(j))
    p1, p2 = pages(j)
    faw = {}
    for pg in range(p1, p2 + 1):
        faw[pg] = [norm(x.lstrip("• ")) for x in json.load(open(os.path.join(SRC, "fawaed", f"{pg:03d}.json"), encoding="utf-8")).get("items", [])]
    types = [q.get("type") for q in qs]
    if types.count("meaning") != 40 or types.count("faida") != 10:
        errs.append(f"counts meaning={types.count('meaning')} faida={types.count('faida')} total={len(qs)}")
    ids = [q.get("id") for q in qs]
    if len(set(ids)) != len(ids):
        errs.append("duplicate ids")
    seen_stems = set()
    for q in qs:
        qid = q.get("id")
        o = q.get("options", [])
        if len(o) != 3 or len({norm(x) for x in o}) != 3:
            errs.append(f"{qid}: need 3 distinct options")
        if q.get("answer") not in range(len(o)):
            errs.append(f"{qid}: bad answer index")
        key = norm(q.get("stem", "")) + norm(q.get("ayah", ""))
        if key in seen_stems:
            errs.append(f"{qid}: duplicate question")
        seen_stems.add(key)
        ref = q.get("ref", "")
        m = re.match(r"^(.+?):\s*(\d+)(?:\s*-\s*(\d+))?$", ref)
        srcs = []
        if m and m.group(1).strip() in NAME2NUM:
            s = NAME2NUM[m.group(1).strip()]
            a1 = int(m.group(2)); a2 = int(m.group(3) or a1)
            for a in range(a1, a2 + 1):
                if (s, a) not in valid:
                    errs.append(f"{qid}: {ref} not in juz {j}")
                    continue
                srcs.append(json.load(open(os.path.join(SRC, "ayat", f"{s:03d}_{a:03d}.json"), encoding="utf-8")))
        elif q.get("type") == "meaning" or q.get("ayah"):
            errs.append(f"{qid}: bad ref '{ref}'")
        if q.get("ayah"):
            full = norm(" ".join(d["ayah"] for d in srcs))
            for part in re.split(r"\s*(?:\.\.\.|…|\*)\s*", q["ayah"]):
                if norm(part) and norm(part) not in full:
                    errs.append(f"{qid}: ayah excerpt not verbatim: {part[:40]}")
        if q.get("type") == "meaning":
            full = norm(" ".join(d["mukhtasar"] for d in srcs))
            if not norm(q.get("explanation")) or norm(q["explanation"]) not in full:
                errs.append(f"{qid}: explanation not verbatim from المختصر of {ref}")
        elif q.get("type") == "faida":
            pg = q.get("page")
            if pg not in faw:
                errs.append(f"{qid}: page {pg} not in juz")
            elif norm(q.get("explanation")) not in faw[pg]:
                errs.append(f"{qid}: faida not verbatim from ص {pg}")
    return errs


if __name__ == "__main__":
    js = [int(x) for x in sys.argv[1:]] or range(1, 31)
    bad = 0
    for j in js:
        e = check(j)
        print(f"juz {j:02d}: {'OK' if not e else str(len(e)) + ' problems'}")
        for x in e[:40]:
            print("   -", x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
