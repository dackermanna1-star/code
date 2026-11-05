"""SH09 - "Instead, float. Tilt your head back, ears under, arms and legs spread."
Overhead: he stops fighting, leans back, ears go under, arms and legs open into a star. Breathing slows."""
from common import *

def build():
    # light transmission tint + dimmer volume glow: the body just under the surface keeps its colours (skin, shirt,
    # shorts) instead of reading as a black wetsuit, while the deep water stays ocean-blue
    sc, c, o, sun = setup('SH09', tod='day', ocean='calm', water_mode='clear', vignette=0.3,
                          water_kw={'near_transmission': 20.0, 'transmit_tint': (0.55, 0.8, 0.85)})
    for m in (o['mat'], o.get('volmat')):
        if m is not None and 'vol_glow' in m.node_tree.nodes: m.node_tree.nodes['vol_glow'].inputs['Strength'].default_value = 0.25
    N = sc.frame_end   # 159
    c.condition(wet=1.0, fatigue=0.35)
    w_float = ch.ramp(35, 105)
    c.add(ch.weight(ch.tread_water(c, 1, N, speed=0.8, effort=0.7), lambda f: 1 - w_float(f)))
    c.add(ch.weight(ch.float_back(c), w_float))
    c.add(ch.breathing(rate_bpm=30, depth=1.3))
    c.add(ch.breathing(rate_bpm=12, depth=1.0))
    c.add_face(expression([(1, face('effort', 0.8)), (60, face('calm_focus')), (110, {'eyeBlinkLeft': 0.85, 'eyeBlinkRight': 0.85, 'browInnerUp': 0.3}),
                           (135, {'eyeBlinkLeft': 0.3, 'eyeBlinkRight': 0.3}), (159, {'eyeBlinkLeft': 0.2, 'eyeBlinkRight': 0.2})]))
    c.add_face(ch.blinks(seed=12, f0=130))
    def pivot(f):
        k = w_float(f)
        return (Vector((0, 0.15 * k, -0.24 + 0.19 * k)), compose(R('X', 8 - 86 * k), R('Z', 30)))   # settled chest clear of the surface (no shirt 'islands')
    c.pivot_fn = pivot
    probe = finish(c, o, N, inertia=(0.22, 0.6), radius=1.0)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.12
    cam = env.add_camera('Cam', lens=28)
    aimt = cam_target(c.root, (0, 0.3, 0)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        a = math.radians(-100 + 35 * k)
        env.key_loc(cam, f, Vector((0.9 * math.cos(a), 0.9 * math.sin(a), 4.3 - 0.6 * k)))
    env.handheld(cam, amp_loc=0.02, amp_rot=0.004, freq=0.4, seed=9)
    return sc
