"""SH02 - "First comes the shock. In cold water, your body gasps uncontrollably,"
Underwater, looking up: the castaway (just fallen in) claws up toward the bright
surface through a cloud of his own bubbles, god rays slanting down, and breaks through."""
import math
from common import *
from char import R, compose, KeyPoses, ease, ease_in, ease_out, face, expression
import marine

def build():
    sc, c, o, sun = setup('SH02', tod='day', ocean='moderate', water_mode='under', grade='under', vignette=0.4)
    N = sc.frame_end   # 126
    c.condition(wet=1.0)
    marine.underwater_camera_setup(sc, o, sun, volume_density=0.045, absorb_density=0.3)

    # rise path of the chest pivot (world z), slight drift; must end with the head through the actual swell
    probe = ch.OceanProbe(o['ocean'])
    zs = {f: z for f, z, _, _ in probe.sample(range(100, N + 1), lambda f: (0.0, 0.0), radius=0.6)}
    def chest_z(f):
        top = zs.get(min(max(f, 100), N), 0.0) - 0.12
        k = ease_out((f - 1) / (N - 6)) ** 1.15
        return -4.2 + (top + 4.2) * min(k, 1.0)
    # strokes: arms pull down hard twice, legs kick (panicked swim-up)
    strokes = [(1, 34), (34, 70), (70, 104)]
    def arms(f):
        d = {}
        for a, b in strokes:
            if a <= f < b:
                u = (f - a) / (b - a)
                # 0..0.55: pull from overhead down to the sides (power), 0.55..1: recover up close to the body
                if u < 0.55:
                    k = ease_out(u / 0.55); ang = 165 - 160 * k   # arm angle about X from rest-down (+ = up through the front)
                    bend = 30 * math.sin(math.pi * k)
                else:
                    k = ease((u - 0.55) / 0.45); ang = 5 + 160 * k
                    bend = 85 * math.sin(math.pi * k)
                for s, sg in (('L', 1), ('R', -1)):
                    d['upperarm01.%s' % s] = compose(R('Y', sg * 20), R('X', -ang), R('Y', -sg * 18))
                    d['lowerarm01.%s' % s] = R('X', 40 - bend)
                    d['wrist.%s' % s] = R('X', -15)
                break
        return d
    c.add(arms)
    def legs(f):
        t = f / 30.0; ph = 2 * math.pi * t * 2.4
        d = {}
        for s, sg in (('L', 1), ('R', -1)):
            o_ = 0 if s == 'L' else math.pi
            d['upperleg01.%s' % s] = R('X', -10 + 22 * math.sin(ph + o_))
            d['lowerleg01.%s' % s] = R('X', 20 + 25 * max(0, math.sin(ph + o_ + 0.9)))
            d['foot.%s' % s] = R('X', 50)
        return d
    c.add(legs)
    c.add(lambda f: {'neck01': R('X', -18), 'head': R('X', -14 + 6 * math.sin(f * 0.13)), 'spine03': R('X', -6)})
    c.add(ch.micro_head(seed=2, amp=3.0, freq=0.6))
    # holding breath: cheeks puffed, eyes squeezed; near the top the mouth bursts open (gasp)
    c.add_face(expression([(1, {'cheekPuff': 0.55, 'mouthPressLeft': 0.6, 'mouthPressRight': 0.6, 'eyeSquintLeft': 0.8, 'eyeSquintRight': 0.8,
                                 'eyeBlinkLeft': 0.55, 'eyeBlinkRight': 0.55, 'browDownLeft': 0.5, 'browDownRight': 0.5, 'browInnerUp': 0.5}),
                           (100, {'cheekPuff': 0.6, 'mouthPressLeft': 0.7, 'mouthPressRight': 0.7, 'eyeSquintLeft': 0.9, 'eyeSquintRight': 0.9,
                                  'eyeBlinkLeft': 0.6, 'eyeBlinkRight': 0.6, 'browInnerUp': 0.8, 'noseSneerLeft': 0.3, 'noseSneerRight': 0.3}),
                           (112, face('gasp')), (126, face('gasp', 0.9))]))
    def pivot(f):
        return (Vector((0.15 * math.sin(f * 0.05), 0.0, chest_z(f))), compose(R('X', -8 + 4 * math.sin(f * 0.2)), R('Z', 20), R('Y', 3 * math.sin(f * 0.17))))
    c.pivot_fn = pivot
    c.bake(1, N)
    # body is under water: root stays at world 0 (pivot carries the rise)

    # bubbles: escaping from nose/mouth in bursts + trapped air streaming from clothes/hair
    marine.bubble_emitter(c.rig, bone='head', offset=(0, 0.12, -0.11), frames=(1, 110), rate=70, size=(0.012, 0.045), name='BubMouth', seed=1)
    marine.bubble_emitter(c.rig, bone='spine02', offset=(0, 0.0, 0), frames=(1, 60), rate=150, size=(0.01, 0.035), name='BubBody', seed=2, spread=0.25)
    marine.bubble_emitter(c.rig, bone='upperleg02.L', offset=(0, 0.0, 0), frames=(1, 40), rate=50, size=(0.008, 0.025), name='BubLeg', seed=3)

    # camera: below and to the side, looking up past him at the bright surface (Snell's window)
    cam = env.add_camera('Cam', lens=22, dof={'fstop': 4.0})
    tgt = bpy.data.objects.new('CamTarget', None); bpy.data.collections['Cameras'].objects.link(tgt)
    tgt.parent = c.rig; tgt.parent_type = 'BONE'; tgt.parent_bone = 'spine01'
    cam.data.dof.focus_object = tgt
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        p = Vector((1.9 - 0.4 * k, -2.6 + 0.3 * k, -4.6 + 2.6 * k))
        aim = Vector((0.1, 0.0, chest_z(f) + 0.8 + 0.6 * k))
        env.key_cam(cam, f, p, aim, lens=22)
    env.handheld(cam, amp_loc=0.02, amp_rot=0.006, freq=0.35, seed=2)
    marine.marine_snow(cam, n=700)
    marine.god_rays(sun['dir'], center=(0, 0, 0), count=18, radius=6.0, length=13.0, strength=0.34, avoid=(1.7, -2.45, -3.3), avoid_r=2.2)
    marine.fill_light(target=(0, 0, -2.5), loc=(1.5, -3.0, -8.0), energy=120)
    return sc
