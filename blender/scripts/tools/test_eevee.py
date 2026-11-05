import sys, time, os
sys.path.insert(0, '/home/user/code/blender/scripts/lib')
argv = sys.argv[sys.argv.index('--') + 1:]
exec(open('/home/user/code/blender/scripts/tools/test_env.py').read().split("sc.frame_set(1)")[0])
sc.render.engine = 'BLENDER_EEVEE_NEXT'
ee = sc.eevee
ee.taa_render_samples = int(os.environ.get('EES', '12'))
ee.use_raytracing = True
ee.ray_tracing_method = 'SCREEN'
ee.ray_tracing_options.resolution_scale = '2'
ee.use_shadows = True
ee.shadow_ray_count = 1; ee.shadow_step_count = 4
ee.use_volumetric_shadows = False
ee.volumetric_tile_size = '8'
ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
ee.use_fast_gi = True
sc.world.use_sun_shadow = True if hasattr(sc.world, 'use_sun_shadow') else None
for f in (1, 2, 3):
    sc.frame_set(f)
    sc.render.filepath = '/home/user/code/blender/tests/eevee_%s_%d.png' % (argv[0], f)
    t = time.time(); bpy.ops.render.render(write_still=True); print('ETIME', argv[0], f, round(time.time() - t, 1), flush=True)
