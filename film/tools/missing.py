"""List missing frames per sequence (optionally print render commands to fill them)."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from mcfilm import timeline as tl  # noqa: E402

frames_dir = os.path.join(ROOT, "build", "frames")
have = set(int(f[:5]) for f in os.listdir(frames_dir) if f.endswith(".png")) if os.path.isdir(frames_dir) else set()
seqs = []
for sid, seq, _, _ in tl.SHOTS:
    if seq not in seqs and seq != "black":
        seqs.append(seq)
total_missing = 0
for seq in seqs:
    sh = tl.seq_shots(seq)
    f0, f1 = sh[0][1], sh[-1][2]
    miss = [f for f in range(f0, f1 + 1) if f not in have]
    total_missing += len(miss)
    runs = []
    for f in miss:
        if runs and runs[-1][1] == f - 1:
            runs[-1][1] = f
        else:
            runs.append([f, f])
    print(f"{seq:10s} {f1 - f0 + 1 - len(miss):5d}/{f1 - f0 + 1:5d} done" + (f"  missing runs: {runs[:6]}" if runs else ""))
print("total missing", total_missing)
