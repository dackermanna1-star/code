"""SH28 - "Your odds depend on the water temperature, staying afloat, and whether anyone knows you're missing."
Side-on wide: the hoist takes up the slack and lifts him out of the sea in the yellow strop, legs trailing and
water pouring off him, swinging gently as he rises toward the open door (labels added in the edit, above the helicopter)."""
from common import *
import rescue

LIFT0 = 22          # cable takes his weight
LIFT_TOP = 8.2      # chest height at the end of the shot (SH29 reels in the rest)

def lift_profile(N, f0=LIFT0, top=LIFT_TOP, ramp=30):
    v = [0.0] * (N + 2); z = [0.0] * (N + 2)
    for f in range(1, N + 2): v[f] = ease((f - f0) / float(ramp))
    tot = sum(v[1:N + 1]); acc = 0.0
    for f in range(1, N + 2):
        acc += v[f] * top / tot; z[f] = acc
    return z

def hoist_layers(c, yaw, f_off=0, w=None):
    """Pose layers + pivot for him hanging in the strop. f_off continues the motion phases across the SH28/SH29 cut."""
    w = w or (lambda f: 1.0)
    # arms clamped over the strop; legs go from a slow tread to trailing and bent
    c.add(lambda f: ch.hug_shiver_pose())
    def legs(f):
        k = w(f); g = f + f_off; dd = {}
        for s, sg in (('L', 1), ('R', -1)):
            o_ = 0.0 if s == 'L' else 1.3
            thigh = (-10 + 6 * math.sin(g / 9.0 + o_)) * (1 - k) + (-30 + 5 * math.sin(g / 24.0 + o_)) * k
            knee = (22 + 8 * math.sin(g / 9.0 + o_ + 0.8)) * (1 - k) + (48 + 6 * math.sin(g / 21.0 + o_)) * k
            dd['upperleg01.%s' % s] = compose(R('X', thigh), R('Y', -sg * (6 + 3 * k)))
            dd['lowerleg01.%s' % s] = R('X', knee)
            dd['foot.%s' % s] = R('X', 25 + 12 * k)
        return dd
    c.add(legs)
    c.add(ch.breathing(rate_bpm=20, depth=1.0))
    c.add_face(lambda f: dict(face('exhausted', 0.9), eyeBlinkLeft=0.45, eyeBlinkRight=0.45))
    c.add_face(ch.blinks(seed=28, mean_gap=2.2))
    # hangs from the strop under the arms: slight lean back, slow spin and pendulum tilt once clear of the water
    def pivot(f):
        k = w(f); g = f + f_off
        rot = compose(R('X', -4 * (1 - k) - 8 * k + 3 * k * math.sin(g / 21.0)), R('Y', 4 * k * math.sin(g / 26.0)),
                      R('Z', yaw + k * 28 * math.sin((g - LIFT0) / 55.0)))
        return (Vector((0, 0, -0.2 * (1 - k))), rot)
    c.pivot_fn = pivot

def swing(f, side, d):
    return 0.22 * math.sin((f - LIFT0) / 21.0) * side + 0.1 * math.sin((f - LIFT0) / 27.0) * d

def build():
    sc, c, o, sun = setup('SH28', tod='golden', ocean='calm', water_mode='opaque', vignette=0.35)
    N = sc.frame_end   # 189
    c.condition(wet=1.0, fatigue=0.95, sunburn=0.62, salt=0.7, cold=0.4)
    d, side, yaw = rescue.rescue_frame(sun)
    w = lambda f: ease((f - LIFT0) / 26.0)             # 0 in the water -> 1 hanging
    zl = lift_profile(N)
    hoist_layers(c, yaw, 0, w)
    c.add(KeyPoses([(1, {'neck01': [('X', -16)], 'head': [('X', -12)]}), (LIFT0 + 10, {'neck01': [('X', -6)], 'head': [('X', -4)]}),
                    (95, {'neck01': [('X', 12)], 'head': [('X', 9)]}), (N, {'neck01': [('X', 15)], 'head': [('X', 11)]})]))
    c.bake(1, N)
    # root: rides the swell in the water, then the hoist takes over (blend), with a small pendulum swing
    probe = ch.OceanProbe(o['ocean'])
    s = probe.sample(list(range(1, N + 1)), lambda f: (0.0, 0.0), radius=0.7)
    zw = ch.spring_filter([v[1] for v in s], 0.25, 0.55)
    z_hold = zw[LIFT0 - 1]
    off = -d * 0.3                                      # strop ring (in front of his chest) under the hook
    for f in range(1, N + 1):
        k = w(f)
        z = zw[f - 1] * (1 - k) + z_hold * k + zl[f]
        sw = k * swing(f, side, d)
        c.root.location = off + sw + Vector((0, 0, z)); c.root.keyframe_insert('location', frame=f)
    hroot, rotor = rescue.heli(lambda f: rescue.hook_over_xy(d) + Vector((0, 0, rescue.HOVER_Z)), N, hover=True, yaw_deg=rescue.heli_yaw(d))
    rescue.strop(c)
    hook = rescue.hoist_hook(hroot)
    ring = bpy.data.objects.new('StropRing', None); sc.collection.objects.link(ring)
    ring.parent = c.pivot; ring.location = (0, -0.3, 0.12)        # D-ring in front of the chest
    rescue.cable(hook, ring)
    wash = bpy.data.objects.new('WashC', None); sc.collection.objects.link(wash)
    rescue.downwash(wash, (1, N), radius=(2.0, 9.0), rate=2600)
    rescue.churn_water(o)
    droplets(c, bones=('foot.L', 'foot.R', 'lowerleg02.L', 'lowerleg02.R', 'upperleg02.L', 'upperleg02.R'),
             frames=(LIFT0 + 12, LIFT0 + 95), rate=150, speed=0.0, size=(0.004, 0.012))
    for e_ in [o_ for o_ in bpy.data.objects if o_.name.startswith('Drops_') and o_.particle_systems]:
        st_ = e_.particle_systems[0].settings; st_.factor_random = 0.2; st_.normal_factor = 0.0; st_.object_align_factor = (0, 0, 0)
    # camera: side-on from the door side, below the helicopter; he rises through the empty middle of the frame
    # (layout at 1920 px: labels <= ~440, rotor top ~440, skids ~670, him 1380 -> ~800)
    cam = env.add_camera('Cam', lens=30, clip=(0.3, 80000))
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        r = 23.0 - 1.0 * k
        env.key_loc(cam, f, -side * r + d * (1.5 - 1.0 * k) + Vector((0, 0, 5.0)))
        aimt.location = d * 0.2 + Vector((0, 0, 5.0 + r * math.tan(math.radians(3.4 + 0.6 * k)))); aimt.keyframe_insert('location', frame=f)
    env.aim(cam, aimt)
    env.handheld(cam, amp_loc=0.05, amp_rot=0.0015, freq=0.35, seed=28)
    return sc
