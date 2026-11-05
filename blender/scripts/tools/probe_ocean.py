import sys, time
sys.path.insert(0, '/home/user/code/blender/scripts/lib')
import env, bpy, numpy as np
argv = sys.argv[sys.argv.index('--') + 1:]
res = int(argv[0]); size = float(argv[1]); wind = float(argv[2])
sc = env.new_scene(frames=(1, 2))
ob = env.make_ocean_mesh('Ocean')
m = env.add_ocean_modifier(ob, 'moderate', res=res, size=size, wind=wind)
print('NVERTS', len(ob.data.vertices))
for f in (1, 30):
    t = time.time(); sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get(); me = ob.evaluated_get(dg).data
    n = len(me.vertices); co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    near = (np.abs(co[:, 0]) < 60) & (np.abs(co[:, 1]) < 60)
    z = co[near, 2]
    print('EVAL f%d %.2fs z std %.3f min %.2f max %.2f' % (f, time.time() - t, z.std(), z.min(), z.max()))
