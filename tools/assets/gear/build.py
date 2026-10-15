"""
Build one authored asset:  blender -b -P tools/assets/gear/build.py -- <id> <out_dir> [--nobake] [--blend path] [--tex N]
Asset definitions live in tools/assets/gear/models/<id>.py and expose build(g: gkit.Kit); optional TEX, MS, META.
Writes <out_dir>/<id>.glb and <out_dir>/<id>.meta.json.
"""
import bpy, sys, os, json, importlib.util
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gkit  # noqa: E402
sys.path.insert(0, os.path.join(HERE, 'models'))

argv = sys.argv[sys.argv.index('--') + 1:]
aid, out_dir = argv[0], argv[1]
bake = '--nobake' not in argv
blend = argv[argv.index('--blend') + 1] if '--blend' in argv else None
tex = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
spec = importlib.util.spec_from_file_location('asset_' + aid, os.path.join(HERE, 'models', aid + '.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
g = gkit.Kit(aid, work=out_dir)
g.tex = getattr(mod, 'TEX', 1024)
g.ms = getattr(mod, 'MS', 1.0)
g.wear = getattr(mod, 'WEAR', 1.0)
g.decimate = getattr(mod, 'DECIMATE', 1.0)
g.double_sided = getattr(mod, 'DOUBLE_SIDED', False)
g.uv_pack = getattr(mod, 'UV_PACK', 'AABB')
g.decimate_min = getattr(mod, 'DECIMATE_MIN', 1500)
if tex: g.tex = tex
os.makedirs(out_dir, exist_ok=True)
mod.build(g)
meta = g.finish(os.path.join(out_dir, aid + '.glb'), bake=bake, keep_blend=blend, samples=getattr(mod, 'SAMPLES', 12))
meta.update(getattr(mod, 'META', {}))
meta['id'] = aid
json.dump(meta, open(os.path.join(out_dir, aid + '.meta.json'), 'w'), indent=1)
print('DONE', aid, json.dumps(meta))
