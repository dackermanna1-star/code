"""SH28 - "Your odds depend on the water temperature, staying afloat, and whether anyone knows you're missing."
The hoist lifts him out of the sea in a yellow strop, water pouring off his legs, up toward the open door."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH28', tod='golden', ocean='calm', water_mode='opaque', vignette=0.38)
    N = sc.frame_end   # 189
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    def hug(nx, hx):
        d = ch.hug_shiver_pose(); d.update({'neck01': R('X', nx), 'head': R('X', hx)}); return d
    c.add(KeyPoses([(1, hug(16, 12)), (N, hug(20, 14))]))
    c.add(lambda f: {'upperleg01.L': R('X', -6 + 4 * math.sin(f / 13.0)), 'upperleg01.R': R('X', -4 + 4 * math.sin(f / 15.0 + 1)),
                     'lowerleg01.L': R('X', 12), 'lowerleg01.R': R('X', 16), 'foot.L': R('X', 35), 'foot.R': R('X', 35)})
    c.add(ch.breathing(rate_bpm=18, depth=1.0))
    c.add_face(lambda f: dict(face('exhausted', 0.9), eyeBlinkLeft=0.6, eyeBlinkRight=0.6))
    c.pivot_fn = lambda f: (Vector((0, 0, 0)), compose(R('X', 3 * math.sin(f / 20.0)), R('Y', 4 * math.sin(f / 26.0)), R('Z', yaw + 12 * math.sin(f / 40.0))))
    c.bake(1, N)
    # rise: chest from just under the surface up toward the helicopter
    probe = ch.OceanProbe(o['ocean'])
    z0 = probe.sample([1], lambda f: (0.0, 0.0))[0][1]
    for f in range(1, N + 1):
        k = ease_in(min(1.0, max(0.0, (f - 12) / (N - 12)))) ** 0.8
        c.root.location = (0.15 * math.sin(f / 22.0) * k, 0.1 * math.sin(f / 30.0) * k, z0 - 0.15 + 6.0 * k)
        c.root.keyframe_insert('location', frame=f)
    hp = d * rescue.HOVER_OFF + Vector((0, 0, rescue.HOVER_Z))
    hroot, rotor = rescue.heli(lambda f: hp, N, hover=True, yaw_deg=math.degrees(math.atan2(d.y, d.x)) + 90)
    s = rescue.strop(c)
    hook = bpy.data.objects.new('HoistHook', None); sc.collection.objects.link(hook)
    hook.parent = hroot; hook.location = (130, -150, 260)   # door hoist (model cm space)
    ring = bpy.data.objects.new('StropRing', None); sc.collection.objects.link(ring)
    ring.parent = c.pivot; ring.location = (0, -0.2, 0.32)        # D-ring in front of the chest
    rescue.cable(hook, ring)
    rescue.downwash(bpy.data.objects.new('WashC', None), (1, N), rate=2000)
    sc.collection.objects.link(bpy.data.objects['WashC'])
    rescue.churn_water(o)
    droplets(c, bones=('foot.L', 'foot.R', 'lowerleg02.L', 'lowerleg02.R'), frames=(70, N), rate=90, speed=0.0, size=(0.004, 0.012))
    for e_ in [o_ for o_ in bpy.data.objects if o_.name.startswith('Drops_')]:
        st_ = e_.particle_systems[0].settings; st_.factor_random = 0.15; st_.normal_factor = 0.0; st_.object_align_factor = (0, 0, 0)
    cam = env.add_camera('Cam', lens=18)
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    for f in range(1, N + 1, 3):
        aimt.location = d * 0.6 + Vector((0, 0, 2.6 + 4.2 * ease_in(f / N))); aimt.keyframe_insert('location', frame=f)
    env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, -d * (3.4 - 0.4 * k) + side * 1.3 + Vector((0, 0, 0.4)))
    ch.ride_swell(cam, probe, 1, N, amount=0.8, min_clear=0.2)
    env.handheld(cam, amp_loc=0.025, amp_rot=0.01, freq=1.1, seed=28)
    return sc
