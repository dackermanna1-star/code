"""Blender entry point: build one sequence's world + shots, then render frames.

Usage (inside the film/ directory):
  xvfb-run -a blender -b --python render.py -- <seq> [--frames A:B] [--step N] [--still F,F,...]
                                                   [--preview] [--out DIR] [--shot ID]
"""
import argparse
import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from mcfilm import blcore as bc, direct as dr, timeline as tl  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("seq")
    ap.add_argument("--frames", default=None)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--still", default=None)
    ap.add_argument("--shot", default=None)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "build", "frames"))
    ap.add_argument("--samples", type=int, default=1)
    ap.add_argument("--nosave", action="store_true")
    a = ap.parse_args(argv)

    t0 = time.time()
    scn = bc.reset_scene()
    mod = importlib.import_module(f"seqs.{a.seq}")
    shots = tl.seq_shots(a.seq)
    world = mod.build_world()
    print(f"[render] world built in {time.time() - t0:.1f}s")
    bc.world_objects(world, name=a.seq)
    bc.setup_world()
    d = dr.Director(a.seq, [], world)
    fns = mod.setup(d, world)
    d.shots = [(sid, f0, f1, fns[sid]) for sid, f0, f1 in shots]
    f_first, f_last = d.run()
    if not a.nosave:
        d.save_events(os.path.join(HERE, "build", "events", f"{a.seq}.json"))
    print(f"[render] animation built in {time.time() - t0:.1f}s; frames {f_first}-{f_last}")

    bc.render_settings(scn, res=(1280, 536), samples=a.samples)
    if a.preview:
        scn.render.resolution_percentage = 50
    bc.compositor(scn)
    if hasattr(mod, "post_setup"):
        mod.post_setup(d, world)
    for pre in filter(None, os.environ.get("MC_HIDE", "").split(",")):
        for o in bpy.data.objects:
            if o.name.startswith(pre):
                o.hide_render = True
    if os.environ.get("MC_NOCOMP"):
        scn.use_nodes = False
    os.makedirs(a.out, exist_ok=True)
    scn.render.use_overwrite = True

    frames = None
    if a.still:
        frames = [int(x) for x in a.still.split(",")]
    elif a.shot:
        fr = tl.frames()
        ids = a.shot.split(",")
        frames = []
        for sid in ids:
            s0, s1, _ = fr[sid]
            frames += list(range(s0, s1 + 1, a.step))
    if os.environ.get("MC_DEBUG") and frames:
        ng = bpy.data.node_groups["Env"]
        for f in frames:
            scn.frame_set(f)
            print("DEBUG frame", f, "exposure", scn.view_settings.exposure,
                  {n.name: (tuple(round(v, 3) for v in n.outputs[0].default_value) if n.type == "RGB" else round(n.outputs[0].default_value, 4)) for n in ng.nodes if n.type in ("RGB", "VALUE")},
                  "sun", round(bpy.data.objects["Sun"].data.energy, 3))
            print("DEBUG cam", tuple(round(v, 2) for v in bpy.data.objects["Cam"].matrix_world.translation),
                  "steve", tuple(round(v, 2) for v in bpy.data.objects["steve"].matrix_world.translation),
                  "scale", tuple(round(v, 3) for v in bpy.data.objects["steve"].scale))
        return
    if frames is not None:
        for f in frames:
            scn.frame_set(f)
            scn.render.filepath = os.path.join(a.out, f"{f:05d}.png")
            bpy.ops.render.render(write_still=True)
    else:
        if a.frames:
            s, e = a.frames.split(":")
            scn.frame_start, scn.frame_end = int(s), int(e)
        scn.frame_step = a.step
        scn.render.filepath = os.path.join(a.out, "#####")
        scn.render.use_overwrite = False
        bpy.ops.render.render(animation=True)
    print(f"[render] done in {time.time() - t0:.1f}s")


main()
