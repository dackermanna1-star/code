"""
Build one authored weapon:  blender -b -P tools/assets/weapons/build.py -- <id> <out_dir> [--nobake] [--blend path] [--tex 1024]
Gun definitions live in tools/assets/weapons/guns/<id>.py and expose build(g).
Writes <out_dir>/<id>.glb and <out_dir>/<id>.meta.json (consumed by make_manifest.mjs).
"""
import bpy, sys, os, json, importlib.util
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wkit  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
gid, out_dir = argv[0], argv[1]
bake = '--nobake' not in argv
blend = argv[argv.index('--blend') + 1] if '--blend' in argv else None
tex = int(argv[argv.index('--tex') + 1]) if '--tex' in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
spec = importlib.util.spec_from_file_location('gun_' + gid, os.path.join(HERE, 'guns', gid + '.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
g = wkit.Gun(gid)
if hasattr(mod, 'TEX'): g.tex = mod.TEX
if tex: g.tex = tex
mod.build(g)
os.makedirs(out_dir, exist_ok=True)
meta = g.finish(os.path.join(out_dir, gid + '.glb'), bake=bake, keep_blend=blend)
meta.update(getattr(mod, 'META', {}))
meta['id'] = gid
json.dump(meta, open(os.path.join(out_dir, gid + '.meta.json'), 'w'), indent=1)
print('DONE', gid, json.dumps(meta))
