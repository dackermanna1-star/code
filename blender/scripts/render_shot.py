"""Build a shot and render it.
blender -b --factory-startup -P render_shot.py -- SH04 [--preview] [--frames 1 30 5] [--pct 50] [--samples N] [--save]"""
import sys, os, time, importlib
sys.path.insert(0, '/home/user/code/blender/scripts/lib'); sys.path.insert(0, '/home/user/code/blender/scripts/shots')
import bpy
argv = sys.argv[sys.argv.index('--') + 1:]
sid = argv[0]
opts = {'preview': '--preview' in argv, 'save': '--save' in argv}
def arg(name, n=1, cast=int):
    if name in argv:
        i = argv.index(name); return [cast(x) for x in argv[i + 1:i + 1 + n]]
    return None
mod = importlib.import_module(sid.lower())
t0 = time.time()
sc = mod.build()
print('BUILD %.1fs' % (time.time() - t0), flush=True)
if opts['save']:
    bpy.ops.wm.save_as_mainfile(filepath='/home/user/code/blender/shots/%s.blend' % sid, compress=True)
pct = arg('--pct'); smp = arg('--samples'); fr = arg('--frames', 3)
if pct: sc.render.resolution_percentage = pct[0]
if smp: sc.cycles.samples = smp[0]
out = '/home/user/code/render/%s/%s' % ('preview' if opts['preview'] else 'final', sid)
os.makedirs(out, exist_ok=True)
frames = range(fr[0], min(fr[1], sc.frame_end) + 1, fr[2]) if fr else range(sc.frame_start, sc.frame_end + 1)
# always step through every frame in order so simulations/particles stay valid
last = sc.frame_start
for f in range(sc.frame_start, (max(frames) if frames else sc.frame_end) + 1):
    sc.frame_set(f)
    if f not in frames: continue
    path = os.path.join(out, '%04d.png' % f)
    if os.path.exists(path) and '--resume' in argv: continue
    sc.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    print('FRAME %s %d %.1fs' % (sid, f, time.time() - t), flush=True)
print('DONE', sid, '%.1fs' % (time.time() - t0))
