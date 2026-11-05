"""SH29 - "Because out here, survival isn't about swimming to safety. It's about lasting long enough to be found."
The hoist reels him the last few metres up and in through the door; the helicopter then banks away toward the low
sun while the camera climbs and climbs until the ocean is everything."""
from common import *
import rescue
import sh28

HOLD = 92            # helicopter hovers until he is aboard, then departs

def build():
    sc, c, o, sun = setup('SH29', tod='golden', ocean='calm', water_mode='opaque', vignette=0.3,
                          water_kw={'deep': (0.0025, 0.02, 0.055), 'crest': (0.008, 0.07, 0.09)})
    N = sc.frame_end   # 258
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    p_hover = rescue.hook_over_xy(d) + Vector((0, 0, rescue.HOVER_Z))
    def path(f):
        u = min(1.0, max(0.0, (f - HOLD) / (N - HOLD)))
        k = u ** 1.7                                   # pulls away briskly, toward the low sun
        return p_hover + Vector((0, 0, 25 * k)) + d * (420 * k)
    hroot, rotor = rescue.heli(path, N, hover=True, yaw_deg=rescue.heli_yaw(d))
    # him: continue the SH28 hoist (same pose/swing phases), reel the last ~3.8 m, then in through the door
    F0 = 189                       # SH28 length: phases continue from its last frame
    sh28.hoist_layers(c, yaw, f_off=F0)
    c.add(lambda f: {'neck01': R('X', 15), 'head': R('X', 11)})
    c.bake(1, HOLD + 2)
    hook = rescue.hoist_hook(hroot)
    v0 = sh28.LIFT_TOP / 160.0                          # ~ SH28 end speed (m/frame)
    z = sh28.LIFT_TOP; off = -d * 0.3
    sc.frame_set(1)
    for f in range(1, HOLD + 3):
        v = v0 * (1.0 - ease((f - 55) / 22.0))
        z += v
        sw = sh28.swing(f + F0, side, d) * (1.0 - ease((f - 50) / 30.0))
        inward = ease((f - 74) / 16.0)                    # pulled in through the door (door faces -side)
        p = off + sw + Vector((0, 0, z + 0.35 * inward)) + side * (1.6 * inward)
        hw = rescue.world_at(hroot, f)
        c.root.location = p + Vector((hw.x - p_hover.x, hw.y - p_hover.y, hw.z - p_hover.z))
        c.root.keyframe_insert('location', frame=f)
    rescue.strop(c)
    ring = bpy.data.objects.new('StropRing', None); sc.collection.objects.link(ring)
    ring.parent = c.pivot; ring.location = (0, -0.3, 0.12)
    cb = rescue.cable(hook, ring)
    # aboard: everything on the hoist disappears into the cabin
    gone = [ob for ob in c.col.all_objects] + [ob for ob in bpy.data.objects if ob.name.startswith(('Strop', 'Cable'))]
    for ob in gone:
        ob.hide_render = False; ob.keyframe_insert('hide_render', frame=HOLD - 2)
        ob.hide_render = True; ob.keyframe_insert('hide_render', frame=HOLD - 1)
    rescue.downwash(bpy.data.objects.new('WashC', None), (1, HOLD + 40), radius=(2.0, 9.0), rate=3000)
    sc.collection.objects.link(bpy.data.objects['WashC'])
    rescue.churn_water(o) if 'ripple_amp' in o['mat'].node_tree.nodes else None
    cam = env.add_camera('Cam', lens=28, clip=(0.5, 90000))
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    for f in range(1, N + 1, 2):
        k = ease((f - 1) / (N - 1))
        kk = ease(max(0.0, (k - 0.58) / 0.42))   # hold on the helicopter, then settle on the sun-glitter horizon
        aimt.location = (path(f) + Vector((0, 0, 0.5))) * (1 - kk) + (d * 2500 + Vector((0, 0, -60))) * kk
        aimt.keyframe_insert('location', frame=f)
        env.key_loc(cam, f, -d * (22 + 160 * k) - side * 6 * (1 - k) + Vector((0, 0, 6 + 260 * k ** 1.3)))
    env.aim(cam, aimt)
    env.handheld(cam, amp_loc=0.05, amp_rot=0.002, freq=0.3, seed=29)
    return sc
