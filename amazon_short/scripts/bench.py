import bpy, time, sys
s = bpy.context.scene
mode = sys.argv[sys.argv.index('--')+1]
pct = int(sys.argv[sys.argv.index('--')+2])
s.render.resolution_percentage = pct
if mode == 'cycles':
    c = s.cycles; c.samples = 12; c.max_bounces = 4; c.diffuse_bounces = 1; c.glossy_bounces = 1; c.transmission_bounces = 2; c.transparent_max_bounces = 8
    c.ao_bounces_render = 1; c.texture_limit_render = '1024'; c.adaptive_threshold = 0.06
    s.frame_start = 10; s.frame_end = 12
else:
    s.render.engine = 'BLENDER_EEVEE_NEXT'; e = s.eevee; e.taa_render_samples = 8; e.use_shadows = True
    e.use_raytracing = False; s.frame_start = 10; s.frame_end = 11
s.render.filepath = '/home/user/code/amazon_short/renders/tests/bench_' + mode + '_'
t = time.time(); bpy.ops.render.render(animation=True); print('TOTAL', mode, time.time() - t)
