"""SH29 - "Because out here, survival isn't about swimming to safety. It's about lasting long enough to be found."
The helicopter, man aboard, banks away toward the low sun while the camera climbs and climbs until the ocean
is everything."""
from common import *
import rescue

def build():
    sc, c, o, sun = setup('SH29', tod='golden', ocean='calm', water_mode='opaque', vignette=0.3, with_char=False,
                          water_kw={'deep': (0.0025, 0.02, 0.055), 'crest': (0.008, 0.07, 0.09)})
    N = sc.frame_end   # 258
    az = sun_az(sun)
    d = Vector((math.cos(az), math.sin(az), 0))
    def path(f):
        k = ease_in(min(1.0, f / N))
        return Vector((0, 0, 14 + 25 * k)) + d * (5 + 420 * k)
    hroot, rotor = rescue.heli(path, N)
    rescue.downwash(bpy.data.objects.new('WashC', None), (1, 70), radius=(2.0, 9.0), rate=3000)
    sc.collection.objects.link(bpy.data.objects['WashC'])
    rescue.churn_water(o) if 'ripple_amp' in o['mat'].node_tree.nodes else None
    cam = env.add_camera('Cam', lens=28, clip=(0.5, 90000))
    aimt = bpy.data.objects.new('Aim', None); sc.collection.objects.link(aimt)
    for f in range(1, N + 1, 2):
        k = ease((f - 1) / (N - 1))
        kk = ease(max(0.0, (k - 0.45) / 0.55))     # hold on the helicopter, then settle on the sun-glitter horizon
        aimt.location = path(f) * (1 - kk) + (d * 2500 + Vector((0, 0, -60))) * kk; aimt.keyframe_insert('location', frame=f)
        env.key_loc(cam, f, -d * (22 + 160 * k) + Vector((8 * (1 - k), 6, 6 + 260 * k ** 1.3)))
    env.aim(cam, aimt)
    env.handheld(cam, amp_loc=0.05, amp_rot=0.002, freq=0.3, seed=29)
    return sc
