"""SH08 - "and drowning is usually quiet. No splashing, no cries for help."
Water-level, close: exhausted, upright, head tipped back, mouth at the waterline; arms pressing down at the
surface (the instinctive drowning response). No waving, no shouting - his mouth slips under, comes up, gasps."""
from common import *

def build():
    sc, c, o, sun = setup('SH08', res=(648, 1152), tod='day', ocean='calm', water_mode='clear', vignette=0.38)
    N = sc.frame_end   # 135
    c.condition(wet=1.0, fatigue=0.35)
    def idr(f):
        t = f / 30.0; ph = 2 * math.pi * t / 1.6
        d = {}
        for s, sg in (('L', 1), ('R', -1)):
            o_ = 0 if s == 'L' else 0.3
            press = math.sin(ph + o_)
            d['upperarm01.%s' % s] = compose(R('Y', -sg * (28 + 10 * press)), R('X', -18))
            d['lowerarm01.%s' % s] = R('X', 34 + 6 * press)
            d['wrist.%s' % s] = R('X', 25 - 15 * press)
            d['upperleg01.%s' % s] = R('X', -12 + 6 * math.sin(ph * 0.8 + o_ * 3))
            d['lowerleg01.%s' % s] = R('X', 20 + 8 * math.sin(ph * 0.8 + o_ * 3 + 1))
        d['neck01'] = R('X', -16); d['neck02'] = R('X', -8); d['head'] = R('X', -14)
        return d
    c.add(idr)
    c.add(ch.micro_head(seed=9, amp=3.0, freq=0.7))
    # submersion cycle: mouth goes under (f) -> up -> quick gasp
    dips = [(18, 34), (62, 80), (104, 122)]
    def under(f):
        for a, b in dips:
            if a <= f <= b: return math.sin(math.pi * (f - a) / (b - a))
        return 0.0
    c.add(ch.breathing(rate_bpm=40, depth=1.4, gasp_frames=tuple((b, b + 10, 2.5) for a, b in dips)))
    c.add_face(lambda f: dict(face('fear', 0.55), eyeBlinkLeft=0.25 + 0.4 * under(f), eyeBlinkRight=0.25 + 0.4 * under(f),
                              jawOpen=(0.05 if under(f) > 0.2 else 0.32), mouthClose=(0.3 if under(f) > 0.2 else 0.0),
                              browInnerUp=0.9, mouthStretchLeft=0.3, mouthStretchRight=0.3))
    c.add(ch.look(lambda f: (6 * math.sin(f / 11.0), -12)))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.33 - 0.09 * under(f) + 0.02 * math.sin(f * 0.25))), compose(R('X', -4), R('Z', 15)))
    probe = finish(c, o, N, inertia=(0.25, 0.55))
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.35
    cam = env.add_camera('Cam', lens=48, dof={'fstop': 2.4})
    aimt = cam_target(c.root, (0, 0, 0.12)); env.aim(cam, aimt)
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='head')
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.9 - 0.25 * k, -1.55 + 0.35 * k, 0.07)), lens=48 + 10 * k)
    ch.ride_swell(cam, probe, 1, N, amount=0.92, min_clear=0.06)
    env.handheld(cam, amp_loc=0.01, amp_rot=0.006, freq=0.6, seed=8)
    return sc
