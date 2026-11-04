import bpy, time, sys
s = bpy.context.scene; s.render.resolution_percentage = 50
c = s.cycles; c.samples = 6; c.adaptive_threshold = 0.08; c.max_bounces = 4; c.diffuse_bounces = 1; c.glossy_bounces = 1; c.transmission_bounces = 2; c.transparent_max_bounces = 6
c.ao_bounces_render = 1; c.texture_limit_render = '1024'
s.render.use_simplify = True; c.use_camera_cull = True; c.camera_cull_margin = 0.15
for o in s.objects:
    if o.name.startswith(('SC_', 'TR_', 'LI_', 'CN_', 'RT_', 'ENV_')):
        o.cycles.use_camera_cull = True; o.cycles.use_motion_blur = False
s.frame_start = 10; s.frame_end = 12
s.render.filepath = '/home/user/code/amazon_short/renders/tests/bench4_'
t = time.time(); bpy.ops.render.render(animation=True); print('TOTAL', time.time() - t)
