"""Re-apply overlays (captions/HUD/graphics) to every composited frame, incl. the end-card hold."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import overlays as O
a = int(sys.argv[1]) if len(sys.argv) > 1 else 1
b = int(sys.argv[2]) if len(sys.argv) > 2 else O.TOTAL_FRAMES
n = sum(O.process(f, "/opt/work/comp", "/opt/work/final") for f in range(a, b + 1))
print("OVERLAID", n, "of", b - a + 1)
