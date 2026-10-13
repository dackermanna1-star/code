#!/usr/bin/env python3
"""Compile docs/01-research-dossier.md from the research workflow output
(a JSON list of {lane, research, verification}) - claims merged with the
adversarial fact-checker's verdicts.

  python3 tools/compile_dossier.py research_results.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

LANE_TITLES = {
    "G1-gojo-techniques": "Satoru Gojo — techniques and mechanics",
    "G2-gojo-limits-identity": "Satoru Gojo — limits, counters, visual identity, personality",
    "T1-thragg-comics": "Grand Regent Thragg — Invincible comics",
    "T2-thragg-animated": "Grand Regent Thragg — Invincible animated series (Prime Video)",
    "X1-crossover-mechanics": "Crossover-critical mechanics",
}
BADGE = {"confirmed": "✅ confirmed", "corrected": "✏️ corrected", "refuted": "❌ refuted",
         "unverifiable": "❔ unverifiable", None: "· not re-checked"}


def main(path):
    with open(path) as f:
        data = json.load(f)
    lanes = {d["lane"]: d for d in data if d}
    out = ["# 01 — Research Dossier (Phase 1)", "",
           "Compiled from five parallel research lanes. Every crossover-critical, medium- or low-confidence, "
           "or citation-heavy claim was then **independently re-checked by an adversarial fact-checker** who tried "
           "to refute it with fresh searches. The verdict column shows the result; where a claim was corrected, the "
           "corrected wording is what appears here. Refuted claims are struck through and are NOT used by the "
           "production.", "",
           "**Source policy.** Citations are to JJK manga chapters / anime episodes and Invincible comic issues / "
           "animated episodes. Fan wikis and press coverage were used to *locate* primary citations and are marked "
           "as secondary. Several fan wikis were unreachable (HTTP 402) and were read via their API or search "
           "excerpts; nothing here was read directly off the printed page, so medium/low-confidence items are "
           "treated with care in `02-crossover-rules.md`.", "",
           "**Continuity labels.** `JJK manga` (complete, ch 1–271) · `JJK anime` (through S3, ≈ch 179–181 as of "
           "2026-10-13) · `Invincible comics` (complete, #1–144) · `Invincible animated` (S1–S4; Thragg debuts in "
           "S4, 2026).", ""]
    stats = {"confirmed": 0, "corrected": 0, "refuted": 0, "unverifiable": 0, None: 0}
    for key in ["G1-gojo-techniques", "G2-gojo-limits-identity", "T1-thragg-comics", "T2-thragg-animated",
                "X1-crossover-mechanics"]:
        d = lanes.get(key)
        if not d:
            continue
        r = d["research"]
        v = {x["id"]: x for x in ((d.get("verification") or {}).get("verdicts") or [])}
        out.append(f"## {LANE_TITLES.get(key, key)}")
        out.append("")
        out.append("| ID | Subject | Claim | Continuity | Conf. | Check | Citation |")
        out.append("|---|---|---|---|---|---|---|")
        for c in r["claims"]:
            vv = v.get(c["id"])
            verdict = vv["verdict"] if vv else None
            stats[verdict] += 1
            claim = vv["final_claim"] if vv and verdict in ("corrected", "confirmed") else c["claim"]
            cite = vv["citation"] if vv and verdict == "corrected" and vv.get("citation") else c["citation"]
            if verdict == "refuted":
                claim = f"~~{c['claim']}~~ — *refuted:* {vv['reasoning']}"
            crit = " ⚑" if c.get("crossover_critical") else ""
            cell = lambda s: str(s).replace("|", "\\|").replace("\n", " ")
            out.append(f"| {c['id']}{crit} | {cell(c['subject'])} | {cell(claim)} | {cell(c['continuity'])} | "
                       f"{c['confidence']} | {BADGE[verdict]} | {cell(cite)} |")
        out.append("")
        if r.get("continuity_differences"):
            out.append("**Continuity differences**")
            out.append("")
            out += [f"- {x}" for x in r["continuity_differences"]]
            out.append("")
        missed = (d.get("verification") or {}).get("missed_facts") or []
        if missed:
            out.append("**Added by the fact-checker (facts the lane missed)**")
            out.append("")
            out += [f"- {x}" for x in missed]
            out.append("")
        if r.get("open_questions"):
            out.append("**Open questions → resolved as explicit creative rulings in 02-crossover-rules.md**")
            out.append("")
            out += [f"- {x}" for x in r["open_questions"]]
            out.append("")
    out.insert(10, f"**Verification totals:** {stats['confirmed']} confirmed · {stats['corrected']} corrected · "
                   f"{stats['refuted']} refuted · {stats['unverifiable']} unverifiable · {stats[None]} not re-checked "
                   f"(high-confidence, non-critical). ⚑ = crossover-critical.\n")
    with open(os.path.join(ROOT, "docs", "01-research-dossier.md"), "w") as f:
        f.write("\n".join(out))
    print("wrote dossier", stats)


if __name__ == "__main__":
    main(sys.argv[1])
