"""
Build one authored vehicle:
  blender -b -P tools/assets/vehicles/build.py -- <id> <out_dir> [--preview out.png [--views q34,side]] [--nobake] [--blend path] [--tex N]
Vehicle definitions live in tools/assets/vehicles/models/<id>.py and expose build(v).
Writes <out_dir>/<id>.glb and <out_dir>/<id>.meta.json (consumed by make_manifest.mjs).
"""
import bpy, sys, os, json, importlib.util, time
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vkit  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
vid, out_dir = argv[0], argv[1]
opt = lambda n, d=None: argv[argv.index('--' + n) + 1] if '--' + n in argv else d
bpy.ops.wm.read_factory_settings(use_empty=True)
t0 = time.time()
spec = importlib.util.spec_from_file_location('veh_' + vid, os.path.join(HERE, 'models', opt('module', vid) + '.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
v = vkit.Vehicle(vid)
if hasattr(mod, 'TEX'): v.tex = mod.TEX
if opt('tex'): v.tex = int(opt('tex'))
v.variant = opt('variant', getattr(mod, 'DEFAULT_VARIANT', None))
mod.build(v)
print('BUILT', vid, round(time.time() - t0, 1), 's')
os.makedirs(out_dir, exist_ok=True)
if opt('preview'):
    tmp = v.realize_instances()
    for o in v.parts:
        if o.get('group') in set(i[1] for i in v.instances):
            o.hide_render = True
    vkit.preview(opt('preview'), views=tuple(opt('views', 'q34,side,rear34,front').split(',')), samples=int(opt('spp', '24')),
                 res=tuple(int(x) for x in opt('res', '640x400').split('x')))
    for o in tmp:
        bpy.data.objects.remove(o)
    for o in v.parts:
        o.hide_render = False
if '--nobake' in argv and not opt('glb'):
    if opt('blend'):
        bpy.ops.wm.save_as_mainfile(filepath=opt('blend'))
    sys.exit(0)
meta = v.finish(os.path.join(out_dir, vid + '.glb'), bake='--nobake' not in argv, keep_blend=opt('blend'))
meta.update(getattr(mod, 'META', {}))
meta['id'] = vid
json.dump(meta, open(os.path.join(out_dir, vid + '.meta.json'), 'w'), indent=1)
print('DONE', vid, round(time.time() - t0, 1), 's', json.dumps(meta)[:600])
