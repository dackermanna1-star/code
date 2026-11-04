import bpy, time, sys
s = bpy.context.scene; s.render.resolution_percentage = 50
c = s.cycles; c.samples = int(sys.argv[-1]); c.max_bounces = 4; c.diffuse_bounces = 1; c.glossy_bounces = 1; c.transmission_bounces = 2; c.transparent_max_bounces = 6
c.ao_bounces_render = 1; c.texture_limit_render = '1024'; c.adaptive_threshold = 0.06
s.frame_start = 10; s.frame_end = 11
s.render.filepath = '/home/user/code/amazon_short/renders/tests/bench2_'
bpy.ops.render.render(animation=True)
