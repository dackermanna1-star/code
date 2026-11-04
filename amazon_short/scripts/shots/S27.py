"""S27 – 'the snake behind most bites in the Amazon.' Macro on the lancehead: heat-pit face, cat-eye, tongue flicking."""
import sys; sys.path.insert(0, '/home/user/code/amazon_short/scripts'); sys.path.insert(0, '/home/user/code/amazon_short/scripts/shots')
from shotlib import *
import snake_set, creatures as CR
s, sh = setup('S27'); N = sh['frames']
E, T, body, head, tongue = snake_set.build((0.6, 0.9))
col, rig, acts = character(0.78, 0.6, ['UAL_Idle_Loop'])
place(rig, T, 0.02, 0.95, 180)
clip(rig, acts, 'Idle_Loop', 1, dur=N + 5, blend_in=0, blend_out=0)
CR.tongue_flicks(tongue, [8, 30, 55, 74])
for f, r in ((1, 8), (40, 14), (N, 10)):
    head.rotation_euler.x = math.radians(r); head.keyframe_insert('rotation_euler', index=0, frame=f)
day_light(4.0, (40, 0, 150), 0.8, 0.8, exposure=0.7)
bpy.context.view_layer.update(); hp = head.matrix_world.translation.copy()
def cz(v):
    v = hp + v; v.z = max(v.z, ENV.height_at(T, v.x, v.y) + 0.12); return v
cam = camera('CAM', cz(Vector((0.34, 0.08, 0.1))), hp, 70)
cam_path(cam, [(1, cz(Vector((0.36, 0.06, 0.11))), hp + Vector((0, 0.05, 0.01))), (N, cz(Vector((0.3, 0.1, 0.09))), hp + Vector((0, 0.05, 0.01)))])
focus_on(cam, head, None, 2.8)
ENV.mist_fog(2, 18, (0.55, 0.58, 0.5), 0.3)
finish(s, 'S27'); render_if_requested()
