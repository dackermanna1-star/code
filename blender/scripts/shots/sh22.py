"""SH22 - "By day two, thirst and exhaustion cloud your mind." Grey, windy morning on a lumpy sea;
he floats limp, sunburnt and crusted with salt, eyes half shut."""
from common import *

def build():
    sc, c, o, sun = setup('SH22', tod='overcast', ocean='moderate', water_mode='clear', vignette=0.42, grade='overcast',
                          water_kw={'near_transmission': 20.0, 'transmit_tint': (0.75, 0.92, 0.95)})   # limbs under the surface keep their colour
    for m in (o['mat'], o.get('volmat')):
        if m is not None and 'vol_glow' in m.node_tree.nodes:
            m.node_tree.nodes['vol_glow'].inputs['Strength'].default_value = 0.15     # greyer, less teal under the overcast
            m.node_tree.nodes['vol_abs'].inputs['Density'].default_value = 0.15       # shallow limbs keep skin tone in the dim light
    N = sc.frame_end   # 108
    c.condition(wet=1.0, fatigue=0.85, sunburn=0.58, salt=0.6, cold=0.6)
    c.add(ch.float_back(c, spread=0.85, head_back=0.9)); c.add(ch.breathing(rate_bpm=16, depth=0.9))
    c.add(lambda f: {'head': R('Z', -14 + 8 * ch.fbm(f / 30, 22, 0.4))})
    c.add_face(lambda f: dict(face('exhausted', 1.0), eyeBlinkLeft=0.55, eyeBlinkRight=0.55))
    c.add_face(ch.blinks(seed=22, mean_gap=4.0))
    c.pivot_fn = lambda f: (Vector((0, 0.15, -0.09)), compose(R('X', -74), R('Z', 120)))   # chest fully above the surface (no shirt 'islands')
    probe = finish(c, o, N, inertia=(0.25, 0.55), radius=1.0)
    # soft overcast fill from above: shadow rays pass the water surface, so the shallow submerged shoulders and arms get
    # enough light to keep their skin/shirt colour instead of reading as a charcoal wetsuit
    fl = bpy.data.lights.new('OvercastFill', 'AREA'); fl.shape = 'DISK'; fl.size = 4.0; fl.energy = 260.0; fl.color = (0.92, 0.95, 1.0)
    fo = bpy.data.objects.new('OvercastFill', fl); sc.collection.objects.link(fo); fo.location = (0.0, 0.3, 3.0)
    fo.visible_glossy = False          # light the body only; no milky reflection of the fill in the water
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.15
    cam = env.add_camera('Cam', lens=35, dof={'fstop': 4.0})
    # overhead, face upright in frame (head direction = 90 + 120 deg yaw): never looks up the throat
    head = overhead_face_cam(c, cam, 210, height=(1.0, 0.9), toward_crown=0.3, N=N, aim_offset=0.06)
    cam.data.dof.focus_object = head
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.3)
    env.handheld(cam, amp_loc=0.012, amp_rot=0.005, freq=0.5, seed=22)
    return sc
