#!/usr/bin/env python3
"""Chinatown zombie sprites (SPEC.md 3.3): ZCV1..ZCV4 shamblers, ZRUN runner,
ZKID kid.

Bodies are Quaternius' CC0 "Universal Base Characters" (realistic male and
female meshes on the UAL rig) animated with the CC0 "Universal Animation
Library" 1 and 2, which share that rig (zombie walk, zombie scratch, sprint,
jog, death, knockback). Each civilian is dressed procedurally: vertices are
zoned by their dominant bone and rest-pose position into skin / shirt /
trousers / shoes / accessories (hi-vis vest, chef whites and apron, shirt and
tie, qipao), painted as vertex colours with pallid grey-green skin, dark eye
sockets, open mouths, grime, torn cloth and blood; cloth zones are inflated a
little, and hair, hats (hard hat, chef toque) and a skirt are added as
skinned/bone-parented geometry. Poses come straight from the animation
f-curves with per-bone tweaks (straighter shambling back, flinch, reaching
arms), are snapped to the ground and rendered in Blender (bpy, Cycles CPU) at
3x with an orthographic camera and a key light from the camera's upper
front-left. The renders are box-downscaled in linear light, alpha-thresholded,
given a dark 1-px outline and quantized to the DOOM palette (no dithering).

Rotation convention (verified with --rotation-test against the engine's own
selection formula in src/render/view.js and src/vox/voxelize.js): image r
(1..8) is what a viewer sees when looking along pi + (r-1)*pi/4 in the
thing's frame (x forward, y left), i.e. the camera sits at angle (r-1)*45
degrees counter-clockwise from the thing's facing: 1 front, 3 the thing's
left side (it faces screen left), 5 back, 7 its right side.

Outputs:
  build/ct/lumps/sprites/<P><F><R>.lmp   P in ZCV1..ZCV4, ZRUN, ZKID;
                                         F A-D walk, E-F attack, G pain
                                         (R 1-8), H-L death (R 0)
  build/ct/previews/zombies/             contact sheets (3x, DOOM palette),
                                         line-up vs POSS, raw renders in raw/
  tools/ct/credits/zombies.md            sources and licences

Usage: python3 tools/ct/render_zombies.py [--only ZCV1,ZKID] [--jobs 2]
       [--force] [--samples 16] [--rotation-test] [--no-verify]
Needs a Python with the `bpy` module (CT_BPY_PYTHON, default the scratchpad
bpyvenv) or a Blender binary (CT_BLENDER). Renders are cached in
build/ct/previews/zombies/raw/<P>/ keyed by a hash of the job, so reruns only
redo the post-processing.
"""

import hashlib
import json
import math
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
VERSION = 'zombies-v8'

ADULT_H = 58   # target walk-frame height in pixels (1 px = 1 map unit)
ADULT_PPM = 33.2  # px per metre for all adults: a male shambler's walk frames are ~58 px
KID_H = 42
CANVAS = 120   # square render canvas in output pixels (rendered at 3x)
GROUND = 12    # canvas rows below the ground line
SS = 3         # supersampling factor

# ---------------------------------------------------------------------------
# Characters. Colours are sRGB 0..1. Sleeve/leg lengths are named cuts (see
# the worker's paint()). 'thin' squeezes the body toward the bones.
# ---------------------------------------------------------------------------

CHARS = {
    'ZCV1': dict(
        desc='construction worker: tan work shirt, orange hi-vis vest, jeans, boots, yellow hard hat',
        body='male', hair='Hair_Buzzed', hair_rgb=(0.08, 0.07, 0.06), thin=1.0, head_scale=1.12,
        skin=(0.50, 0.55, 0.43), motion='shamble', seed=11, blood=0.45, tears=0.30,
        outfit=dict(shirt=(0.58, 0.47, 0.32), sleeve='elbow', collar=True,
                    pants=(0.26, 0.32, 0.46), legs='long', shoes=(0.36, 0.23, 0.11),
                    vest=(0.98, 0.42, 0.04), belt=(0.18, 0.12, 0.07),
                    hat='hardhat', hat_rgb=(0.92, 0.70, 0.06))),
    'ZCV2': dict(
        desc='chef: white double-breasted jacket, apron, dark trousers, toque',
        body='male', hair='Hair_Buzzed', hair_rgb=(0.10, 0.09, 0.08), thin=1.0, head_scale=1.12,
        skin=(0.53, 0.56, 0.45), motion='shamble', seed=23, blood=0.60, tears=0.20,
        outfit=dict(shirt=(0.86, 0.86, 0.82), sleeve='forearm', collar=True, buttons=(0.15, 0.15, 0.15),
                    pants=(0.12, 0.12, 0.13), legs='long', shoes=(0.08, 0.08, 0.08),
                    apron=(0.82, 0.81, 0.76), hat='toque', hat_rgb=(0.88, 0.88, 0.85))),
    'ZCV3': dict(
        desc='office worker: white shirt, dark navy tie, charcoal trousers, black shoes',
        body='male', hair='Hair_SimpleParted', hair_rgb=(0.05, 0.045, 0.04), thin=0.97, head_scale=1.12,
        skin=(0.47, 0.52, 0.44), motion='shamble', seed=37, blood=0.55, tears=0.30,
        outfit=dict(shirt=(0.68, 0.69, 0.70), sleeve='long', collar=True, tie=(0.10, 0.12, 0.26),
                    pants=(0.17, 0.17, 0.19), legs='long', shoes=(0.05, 0.05, 0.05),
                    belt=(0.06, 0.05, 0.05))),
    'ZCV4': dict(
        desc='woman in a red qipao with gold trim, hair in buns, black flats',
        body='female', hair='Hair_Buns', hair_rgb=(0.05, 0.04, 0.04), thin=1.0, head_scale=1.10,
        skin=(0.56, 0.58, 0.48), motion='shamble', seed=41, blood=0.55, tears=0.25,
        outfit=dict(dress=(0.66, 0.07, 0.09), trim=(0.88, 0.66, 0.18), sleeve='cap', collar=True,
                    legs='skirt', skirt_len=0.52, shoes=(0.05, 0.04, 0.04))),
    'ZRUN': dict(
        desc='runner: lean, bald, ashen grey skin, torn blood-soaked mustard tank top, ragged cut-off jeans, barefoot',
        body='male', hair=None, hair_rgb=(0.1, 0.1, 0.1), thin=0.84, head_scale=1.10,
        skin=(0.60, 0.60, 0.57), motion='runner', seed=53, blood=1.0, tears=0.55,
        outfit=dict(shirt=(0.58, 0.50, 0.26), sleeve='none', collar=False, tank=True,
                    pants=(0.16, 0.20, 0.30), legs='calf', shoes=None)),
    'ZKID': dict(
        desc='kid: red T-shirt with a white band, navy shorts, white sneakers',
        body='male', hair='Hair_SimpleParted', hair_rgb=(0.06, 0.05, 0.04), thin=0.84,
        scale=0.66, head_scale=1.32,
        skin=(0.52, 0.57, 0.46), motion='kid', seed=67, blood=0.6, tears=0.30,
        outfit=dict(shirt=(0.72, 0.12, 0.10), sleeve='short', collar=False, band=(0.85, 0.85, 0.80),
                    pants=(0.14, 0.18, 0.36), legs='shorts', shoes=(0.85, 0.85, 0.82))),
}

# Per-bone pose tweaks: local Euler degrees post-multiplied onto the animated
# rotation ('add') or replacing it ('set'). Spine/neck/head +X bends forward.
SHAMBLE_UP = {'spine_02': (-8, 0, 0), 'spine_03': (-10, 0, 0), 'neck_01': (-14, 0, 0), 'Head': (-30, 0, 0)}
FLINCH = {'spine_01': (-10, 0, 6), 'spine_02': (-16, 4, 0), 'spine_03': (-14, 6, 0), 'neck_01': (-12, 0, 0),
          'Head': (-32, 10, 14), 'upperarm_l': (0, 0, 28), 'upperarm_r': (0, 0, -28),
          'lowerarm_l': (0, 0, 30), 'lowerarm_r': (0, 0, -30)}
REACH_L = (78, 0, -14)   # upperarm_l: swing forward, slightly down
REACH_R = (78, 0, 14)


def reach_arms(lift_l, lift_r, bend=18):
    """Both arms reaching forward (runner/kid), lifts in degrees."""
    return {'clavicle_l': (0, 0, 0), 'clavicle_r': (0, 0, 0),
            'upperarm_l': (REACH_L[0], 0, REACH_L[2] + lift_l),
            'upperarm_r': (REACH_R[0], 0, REACH_R[2] - lift_r),
            'lowerarm_l': (bend, 0, 0), 'lowerarm_r': (bend, 0, 0),
            'hand_l': (0, 0, 0), 'hand_r': (0, 0, 0)}


def frames_for(motion):
    """Frame list: name, kind (rot/death), action, time, tweaks."""
    W = 'Zombie_Walk_Fwd_Loop'
    S = 'Zombie_Scratch'
    out = []
    if motion == 'shamble':
        for f, t in zip('ABCD', (0, 8, 16, 24)):
            out.append(dict(name=f, kind='rot', action=W, time=t, add=SHAMBLE_UP, measure=True))
        out.append(dict(name='E', kind='rot', action=S, time=9.0, add={'Head': (-14, 0, 0)}))
        out.append(dict(name='F', kind='rot', action=S, time=14.4, add={'Head': (-12, 0, 0)}))
        out.append(dict(name='G', kind='rot', action=W, time=4, add=dict(SHAMBLE_UP, **FLINCH)))
        death = ('Death01', (8.5, 16.0, 22.5, 27.5, 57.6))
    elif motion == 'runner':
        R = 'Sprint_Loop'
        lifts = ((14, -6), (4, 4), (-6, 14), (4, 4))
        for (f, t), (ll, lr) in zip(zip('ABCD', (0, 4, 8, 12)), lifts):
            out.append(dict(name=f, kind='rot', action=R, time=t, set=reach_arms(ll, lr),
                            add={'spine_02': (6, 0, 0), 'neck_01': (-6, 0, 0), 'Head': (-16, 0, 0)}, measure=True))
        out.append(dict(name='E', kind='rot', action=S, time=8.0, add={'Head': (-14, 0, 0)}))
        out.append(dict(name='F', kind='rot', action=S, time=14.4, add={'Head': (-12, 0, 0)}))
        out.append(dict(name='G', kind='rot', action=R, time=4, set=reach_arms(30, 30, 50),
                        add=dict(FLINCH, spine_02=(-6, 4, 0))))
        death = ('Hit_Knockback', (1.0, 3.0, 5.5, 8.0, 20.0))
    elif motion == 'kid':
        R = 'Jog_Fwd_Loop'
        lifts = ((6, -10), (-2, -2), (-10, 6), (-2, -2))
        for (f, t), (ll, lr) in zip(zip('ABCD', (0, 5.6, 11.2, 16.8)), lifts):
            out.append(dict(name=f, kind='rot', action=R, time=t, set=reach_arms(ll - 10, lr - 10, 30),
                            add={'Head': (-10, 0, 0)}, measure=True))
        out.append(dict(name='E', kind='rot', action=S, time=9.0, add={'Head': (-14, 0, 0)}))
        out.append(dict(name='F', kind='rot', action=S, time=14.4, add={'Head': (-12, 0, 0)}))
        out.append(dict(name='G', kind='rot', action=R, time=5.6, set=reach_arms(20, 20, 50), add=FLINCH))
        death = ('Death01', (8.5, 16.0, 22.5, 27.5, 57.6))
    else:
        raise ValueError(motion)
    act, times = death
    for f, t in zip('HIJKL', times):
        out.append(dict(name=f, kind='death', action=act, time=t))
    return out


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------

ASSETS = {
    'ual1': dict(dir='anim_quaternius_universal_animation_library', file='UAL1_Standard.glb',
                 zip='Universal_Animation_Library_Standard_.zip', game='universal-animation-library',
                 title='Universal Animation Library (Standard)', page='https://quaternius.itch.io/universal-animation-library'),
    'ual2': dict(dir='anim_quaternius_universal_animation_library_2', file='UAL2_Standard.glb',
                 zip='Universal_Animation_Library_2_Standard_.zip', game='universal-animation-library-2',
                 title='Universal Animation Library 2 (Standard)', page='https://quaternius.itch.io/universal-animation-library-2'),
    'ubc': dict(dir='char_quaternius_universal_base_characters', file='x',
                zip='Universal_Base_Characters_Standard_.zip', game='universal-base-characters',
                title='Universal Base Characters (Standard)', page='https://quaternius.itch.io/universal-base-characters'),
}


def cache_dir():
    return os.environ.get('CT_CACHE', os.path.join(ROOT, 'build', 'ct', 'cache'))


def itch_download(game, dest_zip):
    """Quaternius' free itch.io flow (page -> download_url -> file url)."""
    import http.cookiejar
    import re
    import urllib.parse
    import urllib.request
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) ct-zombies/1.0')]
    base = 'https://quaternius.itch.io/' + game
    tok = lambda html: re.search(r'name="csrf_token" value="([^"]*)"', html).group(1)
    html = op.open(base, timeout=60).read().decode('utf8', 'replace')
    r = op.open(base + '/download_url', data=urllib.parse.urlencode({'csrf_token': tok(html)}).encode(), timeout=60)
    dl = json.loads(r.read())['url']
    page = op.open(dl, timeout=60).read().decode('utf8', 'replace')
    uploads = re.findall(r'data-upload_id="(\d+)"', page)
    names = re.findall(r'<strong title="([^"]*)" class="name"', page)
    # the free "Standard" archive (other uploads, if any, are paid tiers)
    uid = next((u for u, n in zip(uploads, names) if 'standard' in n.lower()), uploads[0])
    req = urllib.request.Request(base + '/file/%s?source=game_download' % uid,
                                 data=urllib.parse.urlencode({'csrf_token': tok(page)}).encode(),
                                 headers={'X-Requested-With': 'XMLHttpRequest', 'Referer': dl})
    url = json.loads(op.open(req, timeout=60).read())['url']
    tmp = dest_zip + '.part'
    with op.open(url, timeout=600) as src, open(tmp, 'wb') as f:
        shutil.copyfileobj(src, f)
    os.replace(tmp, dest_zip)


def ensure_assets():
    """Paths of the three Quaternius packs, downloading/extracting only what
    is missing. Archives are only unzipped (never executed)."""
    import zipfile
    c = cache_dir()
    paths = {}
    for key, a in ASSETS.items():
        d = os.path.join(c, a['dir'])
        target = os.path.join(d, a['file'])
        if not os.path.exists(target):
            os.makedirs(d, exist_ok=True)
            z = os.path.join(d, a['zip'])
            if not os.path.exists(z):
                print('downloading', a['title'], 'from', a['page'])
                itch_download(a['game'], z)
            with zipfile.ZipFile(z) as zf:
                if key == 'ubc':
                    for info in zf.infolist():
                        n = info.filename
                        if not n.endswith('/') and ('Godot - UE' in n or 'glTF (Godot)' in n or n.endswith('.txt')):
                            zf.extract(info, target)
                else:
                    member = next(n for n in zf.namelist() if n.endswith(a['file']))
                    with zf.open(member) as src, open(target, 'wb') as f:
                        shutil.copyfileobj(src, f)
        paths[key] = target
    ubc = os.path.join(paths['ubc'], 'Universal Base Characters[Standard]')
    paths['body_male'] = os.path.join(ubc, 'Base Characters', 'Godot - UE', 'Superhero_Male_FullBody.gltf')
    paths['body_female'] = os.path.join(ubc, 'Base Characters', 'Godot - UE', 'Superhero_Female_FullBody.gltf')
    paths['hair_dir'] = os.path.join(ubc, 'Hairstyles', 'Origin at 0', 'glTF (Godot)')
    for k in ('body_male', 'body_female', 'hair_dir'):
        if not os.path.exists(paths[k]):
            raise SystemExit('missing ' + paths[k])
    return paths


def blender_cmd(script, args):
    """Command line running `script` with bpy: CT_BLENDER (a Blender binary)
    or CT_BPY_PYTHON / the scratchpad bpy venv (bpy as a Python module)."""
    bl = os.environ.get('CT_BLENDER') or shutil.which('blender')
    py = os.environ.get('CT_BPY_PYTHON')
    if not py and not bl:
        for cand in ('/tmp/claude-0/-home-user-code/2139ba89-9871-5bc9-a1b9-3df0ca0d94e2/scratchpad/bpyvenv/bin/python',):
            if os.path.exists(cand):
                py = cand
    if py:
        return [py, script] + args
    if bl:
        return [bl, '-b', '--factory-startup', '--python', script, '--'] + args
    raise SystemExit('no bpy: set CT_BPY_PYTHON (python with the bpy module) or CT_BLENDER')


# ===========================================================================
# Blender worker (runs inside bpy)
# ===========================================================================

def worker(job_path):
    import re
    import bpy  # noqa: F401  (must come before bmesh/bpy_extras)
    import bmesh
    import numpy as np
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Euler, Quaternion, Vector, noise

    job = json.load(open(job_path))
    cfg = job['cfg']
    outfit = cfg['outfit']
    A = job['assets']
    out_dir = job['out_dir']
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene

    # --- animations (UAL1 + UAL2 share the rig) ---------------------------------
    for f in (A['ual1'], A['ual2']):
        bpy.ops.import_scene.gltf(filepath=f)
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    for a in bpy.data.actions:
        a.use_fake_user = True
    RX = re.compile(r'pose\.bones\["([^"]+)"\]\.(location|rotation_quaternion|scale)')
    curves = {}
    for a in bpy.data.actions:
        d = {}
        for lay in a.layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    for fc in cb.fcurves:
                        m = RX.match(fc.data_path)
                        if m:
                            d.setdefault((m.group(1), m.group(2)), {})[fc.array_index] = fc
        curves[a.name] = (tuple(a.frame_range), d)

    # --- body ------------------------------------------------------------------------
    bpy.ops.import_scene.gltf(filepath=A['body_' + cfg['body']])
    for o in list(sc.objects):
        if o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    body = next(o for o in sc.objects if o.type == 'MESH' and o.name.lower().startswith('superhero'))
    eyes = next(o for o in sc.objects if o.name.startswith('Eyes'))
    brows = next((o for o in sc.objects if o.name.startswith('Eyebrows')), None)
    bones = {b.name: (Vector(b.head_local), Vector(b.tail_local)) for b in arm.data.bones}

    me = body.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nr = np.empty(n * 3)
    me.vertices.foreach_get('normal', nr)
    nr = nr.reshape(-1, 3)
    M = np.array(body.matrix_world)
    P = co @ M[:3, :3].T + M[:3, 3]
    N3 = nr @ M[:3, :3].T
    gname = {g.index: g.name for g in body.vertex_groups}
    dom = []
    for v in me.vertices:
        best, bw = None, -1.0
        for g in v.groups:
            if g.weight > bw:
                best, bw = gname[g.group], g.weight
        dom.append(best)

    def family(b):
        if b is None:
            return 'torso'
        if b == 'Head':
            return 'head'
        if b == 'neck_01':
            return 'neck'
        if b.startswith(('thumb', 'index', 'middle', 'ring', 'pinky', 'hand')):
            return 'hand'
        if b.startswith('lowerarm'):
            return 'forearm'
        if b.startswith('upperarm'):
            return 'upperarm'
        if b.startswith('thigh'):
            return 'thigh'
        if b.startswith('calf'):
            return 'calf'
        if b.startswith(('foot', 'ball')):
            return 'foot'
        return 'torso'
    fam = np.array([family(b) for b in dom])

    # Landmarks (rest pose; character faces -Y, its left is +X).
    sh_x = bones['upperarm_l'][0].x
    elbow_a = bones['lowerarm_l'][0].x - sh_x
    wrist_a = bones['hand_l'][0].x - sh_x
    z_neck = bones['neck_01'][0].z
    z_chest = bones['spine_03'][0].z
    z_belt = 0.5 * (bones['pelvis'][0].z + bones['spine_01'][0].z) + 0.015
    z_knee = bones['calf_l'][0].z
    z_ankle = bones['foot_l'][0].z
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ax = np.abs(x)
    is_arm = np.isin(fam, ('upperarm', 'forearm', 'hand'))
    is_torso = fam == 'torso'
    is_head = fam == 'head'
    arm_a = ax - sh_x
    front = N3[:, 1] < -0.15

    eco = np.array([eyes.matrix_world @ v.co for v in eyes.data.vertices])
    eye_l = eco[eco[:, 0] > 0].mean(0)
    eye_r = eco[eco[:, 0] < 0].mean(0)
    eye_z = 0.5 * (eye_l[2] + eye_r[2])
    head_pts = P[is_head]
    head_top = head_pts[:, 2].max()
    head_h = head_top - z_neck
    mouth_z = eye_z - 0.36 * (head_top - eye_z) - 0.035 * (head_h / 0.3)

    rng_off = Vector((cfg['seed'] * 1.37, cfg['seed'] * 2.11, cfg['seed'] * 0.73))

    def nz(p, s, off=0.0):
        return noise.noise(Vector((p[0] * s, p[1] * s, p[2] * s)) + rng_off + Vector((off, off * 0.5, -off)))

    def fr(p, s, off=0.0):
        return noise.fractal(Vector((p[0] * s, p[1] * s, p[2] * s)) + rng_off + Vector((off, -off, off * 0.3)), 0.6, 2.0, 3)

    # --- paint -----------------------------------------------------------------------
    skin = np.array(cfg['skin'], dtype=float)
    col = np.tile(skin, (n, 1))
    cloth = np.zeros(n, dtype=bool)
    thick = np.zeros(n)
    o = outfit
    sleeve = {'none': -0.04, 'cap': 0.05, 'short': 0.13, 'elbow': elbow_a + 0.02,
              'forearm': elbow_a + 0.09, 'long': wrist_a - 0.02}[o.get('sleeve', 'short')]
    collar_z = z_neck + (0.035 if o.get('collar') else -0.015)
    legs = o.get('legs', 'long')
    leg_cut = {'long': z_ankle + 0.035, 'calf': 0.5 * (z_knee + z_ankle), 'knee': z_knee - 0.05,
               'shorts': z_knee + 0.11, 'skirt': z_ankle + 0.035}[legs]
    top_rgb = np.array(o.get('dress') or o['shirt'])
    bot_rgb = np.array(o.get('dress') or o.get('pants') or o['shirt'])
    shoes = o.get('shoes')
    qipao = 'dress' in o

    for i in range(n):
        f = fam[i]
        p = P[i]
        c = None
        t = 0.0
        if f in ('upperarm', 'forearm', 'hand'):
            if f != 'hand' and arm_a[i] < sleeve:
                c, t = top_rgb, 0.016
        elif f in ('torso', 'neck'):
            if p[2] >= z_belt:
                if p[2] < collar_z or f == 'torso':
                    c, t = top_rgb, 0.016
                if o.get('tank') and ((abs(p[0]) > 0.105 and p[2] > z_chest + 0.02) or
                                      (p[2] > z_neck - 0.08 and p[1] < 0.0) or p[2] > z_neck - 0.03):
                    c, t = None, 0.0
                if c is not None and p[2] > collar_z:
                    c, t = None, 0.0
            else:
                c, t = bot_rgb, 0.014
        elif f in ('thigh', 'calf'):
            if qipao:
                c = None
            elif p[2] > leg_cut:
                c, t = bot_rgb, 0.014
        if f == 'foot' or (f == 'calf' and p[2] < z_ankle + 0.03):
            c, t = (np.array(shoes), 0.006) if shoes else (None, 0.0)
        if c is not None:
            col[i] = c
            cloth[i] = True
            thick[i] = t

    is_top = cloth & (is_torso | is_arm | (fam == 'neck')) & (z >= z_belt - 0.001)
    # accessories
    if o.get('vest'):
        m = is_torso & (z >= z_belt - 0.07) & (z < collar_z - 0.02) & ~((y < 0) & (ax < 0.022))
        col[m] = o['vest']
        thick[m] = 0.02
        cloth |= m
        for zc in (z_belt + 0.12, z_belt + 0.27):
            s = m & (np.abs(z - zc) < 0.022)
            col[s] = (0.82, 0.83, 0.78)
    if o.get('belt'):
        m = cloth & is_torso & (np.abs(z - (z_belt - 0.012)) < 0.022)
        col[m] = o['belt']
    if o.get('buttons'):
        for bx in (-0.065, 0.065):
            for k in range(5):
                bz = z_belt + 0.06 + k * 0.075
                m = is_torso & front & (y < 0) & (np.abs(x - bx) < 0.014) & (np.abs(z - bz) < 0.013)
                col[m] = o['buttons']
    if o.get('apron'):
        m = (is_torso | (fam == 'thigh') | (fam == 'calf')) & (N3[:, 1] < 0.05) & (z < z_belt + 0.04) & (z > z_knee - 0.06)
        col[m] = o['apron']
        thick[m] = 0.016
        cloth |= m
        tie_m = is_torso & (np.abs(z - (z_belt + 0.03)) < 0.012) & cloth
        col[tie_m] = np.array(o['apron']) * 0.85
    if o.get('band'):
        m = is_top & (np.abs(z - (z_chest - 0.02)) < 0.035)
        col[m] = o['band']
    if qipao:
        trim = np.array(o['trim'])
        m = cloth & ((fam == 'neck') & (z > collar_z - 0.018))
        col[m] = trim
        m = cloth & is_arm & (arm_a > sleeve - 0.02)
        col[m] = trim
        # diagonal front opening from the collar to the wearer's right armpit (-X)
        for i in np.nonzero(cloth & is_torso & front & (y < 0) & (z > z_chest - 0.05))[0]:
            s = (collar_z - z[i]) / 0.13
            if 0 <= s <= 1 and abs(x[i] - (-0.13 * s)) < 0.013:
                col[i] = trim
        for i in np.nonzero(cloth & ~((fam == 'neck') & (z > collar_z - 0.018)))[0]:
            if nz(P[i], 40.0, 3.0) > 0.58:
                col[i] = (0.85, 0.55, 0.22)

    # face: sockets, mouth
    for i in np.nonzero(is_head | (fam == 'neck'))[0]:
        p = Vector(P[i])
        d = min((p - Vector(eye_l)).length, (p - Vector(eye_r)).length)
        if d < 0.024:
            col[i] = (0.07, 0.05, 0.05)
        elif d < 0.036:
            col[i] = col[i] * 0.55
    mouth = is_head & (N3[:, 1] < -0.35) & (ax < 0.026) & (np.abs(z - mouth_z) < 0.012)
    col[mouth] = (0.20, 0.03, 0.03)

    # grime, mottling, tears, blood
    blood_dark = np.array((0.36, 0.03, 0.03))
    blood_fresh = np.array((0.55, 0.06, 0.05))
    amt = cfg['blood']
    tear_thr = 0.62 - 0.35 * cfg['tears']
    for i in range(n):
        p = P[i]
        if cloth[i]:
            g = 0.80 + 0.20 * fr(p, 5.0, 1.0)
            if p[2] < z_knee:
                g *= 0.85
            col[i] = col[i] * g
            tv = nz(p, 9.0, 7.0)
            if tv > tear_thr and fam[i] not in ('foot',):
                col[i] = skin * 0.8
                cloth[i] = False
                thick[i] = 0.0
            elif tv > tear_thr - 0.07 and fam[i] not in ('foot',):
                col[i] = col[i] * 0.45 + blood_dark * 0.3
        else:
            col[i] = col[i] * (0.86 + 0.16 * nz(p, 14.0, 2.0))
            if fam[i] == 'hand' or (fam[i] == 'foot' and not shoes):
                col[i] = col[i] * 0.80
        # blood: splotches (more on the front torso), mouth dribble, hands
        b = fr(p, 3.2, 11.0) + 0.25 * nz(p, 11.0, 5.0)
        bonus = 0.10 if (front[i] and fam[i] in ('torso', 'neck')) else 0.0
        if b + bonus > 0.62 - 0.38 * amt:
            col[i] = blood_dark if b > 0.75 - 0.3 * amt else blood_fresh * 0.85 + col[i] * 0.15
        if front[i] and fam[i] in ('head', 'neck', 'torso') and abs(p[0]) < 0.045 + 0.03 * amt \
                and z_chest - 0.12 * amt < p[2] < mouth_z + 0.005:
            if nz(Vector((p[0] * 3.0, p[1], p[2] * 0.12)), 10.0, 4.0) > 0.15 - 0.25 * amt:
                col[i] = blood_fresh if p[2] > z_neck else blood_dark
        if fam[i] == 'hand' and nz(p, 20.0, 9.0) > -0.2:
            col[i] = col[i] * 0.4 + blood_dark * 0.6

    if o.get('tie'):
        # painted after the blood so the tie stays readable
        span = max(collar_z - (z_belt + 0.08), 0.1)
        w = 0.016 + 0.014 * np.clip((collar_z - z) / span, 0, 1)
        m = is_torso & front & (y < 0) & (ax < w) & (z > z_belt + 0.08) & (z < collar_z)
        col[m] = o['tie']
        knot = is_torso & front & (y < 0) & (ax < 0.02) & (z > collar_z - 0.05) & (z < collar_z)
        col[knot] = np.array(o['tie']) * 0.8
        coll = (fam == 'neck') & (z > collar_z - 0.03) & (z < collar_z) & cloth
        col[coll] = (0.85, 0.87, 0.90)

    # --- reshape: thin toward the bones, inflate cloth --------------------------------
    thin = cfg.get('thin', 1.0)
    if thin != 1.0:
        for i in range(n):
            b = dom[i]
            if b is None or fam[i] in ('head', 'hand', 'foot'):
                continue
            h, tl = bones[b]
            seg = tl - h
            L2 = seg.length_squared
            p = Vector(P[i])
            u = 0.0 if L2 < 1e-9 else max(0.0, min(1.0, (p - h).dot(seg) / L2))
            q = h + seg * u
            k = thin if fam[i] != 'neck' else 0.5 * (1 + thin)
            if fam[i] == 'torso' and not b.startswith('clavicle'):
                # spine bones are vertical: squeeze sideways/depth, keep heights
                q = Vector((h.x, h.y, p.z))
            P[i] = np.array(q + (p - q) * k)
    P = P + N3 * thick[:, None]
    Minv = np.linalg.inv(M)
    co2 = P @ Minv[:3, :3].T + Minv[:3, 3]
    me.vertices.foreach_set('co', co2.ravel())
    me.update()

    def lin(c):
        c = np.asarray(c, dtype=float)
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    def set_colors(mesh, rgb):
        attr = mesh.color_attributes.new(name='ZCol', type='FLOAT_COLOR', domain='POINT')
        rgba = np.concatenate([lin(np.clip(rgb, 0, 1)), np.ones((len(rgb), 1))], axis=1)
        attr.data.foreach_set('color', rgba.astype(np.float32).ravel())

    def mat_attr(name):
        mat = bpy.data.materials.new(name)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
        at = nt.nodes.new('ShaderNodeAttribute')
        at.attribute_name = 'ZCol'
        nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.8
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.2
        # inside of the skirt tube: dim flat cloth colour instead of black
        out = next(nd for nd in nt.nodes if nd.type == 'OUTPUT_MATERIAL')
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Strength'].default_value = 0.7
        nt.links.new(at.outputs['Color'], em.inputs['Color'])
        mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
        nt.links.new(bsdf.outputs['BSDF'], mix.inputs[1])
        nt.links.new(em.outputs['Emission'], mix.inputs[2])
        nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
        return mat

    def mat_rgb(name, rgb, rough=0.85, emit=False):
        mat = bpy.data.materials.new(name)
        try:
            mat.use_nodes = True
        except Exception:
            pass
        nt = mat.node_tree
        bsdf = next(nd for nd in nt.nodes if nd.type == 'BSDF_PRINCIPLED')
        c = tuple(lin(rgb)) + (1.0,)
        bsdf.inputs['Base Color'].default_value = c
        bsdf.inputs['Roughness'].default_value = rough
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.2
        if emit:
            bsdf.inputs['Emission Color'].default_value = c
            bsdf.inputs['Emission Strength'].default_value = 3.0
        return mat

    def one_material(obj, mat):
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj.data.polygons.foreach_set('material_index', [0] * len(obj.data.polygons))

    set_colors(me, col)
    body_mat = mat_attr('Z_body')
    one_material(body, body_mat)
    one_material(eyes, mat_rgb('Z_eyes', (0.05, 0.04, 0.035)))
    hair_mat = mat_rgb('Z_hair', cfg['hair_rgb'], 0.9)
    if brows:
        one_material(brows, hair_mat)

    head_c = Vector((0.0, float(head_pts[:, 1].mean()), 0.0))
    head_half_w = float(np.percentile(np.abs(head_pts[:, 0]), 99))

    def bone_parent(obj, bone='Head'):
        mw = obj.matrix_world.copy()
        obj.parent = arm
        obj.parent_type = 'BONE'
        obj.parent_bone = bone
        bpy.context.view_layer.update()
        obj.matrix_world = mw

    extra = []
    if cfg.get('hair'):
        before = set(bpy.data.objects.keys())
        bpy.ops.import_scene.gltf(filepath=os.path.join(A['hair_dir'], cfg['hair'] + '.gltf'))
        for nm in set(bpy.data.objects.keys()) - before:
            ob = bpy.data.objects[nm]
            if ob.type == 'MESH':
                one_material(ob, hair_mat)
                bpy.context.view_layer.update()
                bone_parent(ob)
                extra.append(ob)

    def add_bm_object(name, bm, mat, loc):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        ob = bpy.data.objects.new(name, mesh)
        sc.collection.objects.link(ob)
        ob.location = loc
        one_material(ob, mat)
        bpy.context.view_layer.update()
        return ob

    hat = outfit.get('hat')
    if hat == 'hardhat':
        r = head_half_w * 1.22
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=r)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
        bmesh.ops.scale(bm, vec=(1.0, 1.12, 0.78), verts=bm.verts)
        ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=r * 1.16,
                                    radius2=r * 1.16, depth=0.014)
        bmesh.ops.scale(bm, vec=(1.0, 1.22, 1.0), verts=ret['verts'])
        bmesh.ops.translate(bm, vec=(0.0, -0.025, 0.0), verts=ret['verts'])
        ob = add_bm_object('Z_hat', bm, mat_rgb('Z_hatm', outfit['hat_rgb'], 0.5),
                           Vector((0.0, head_c.y + 0.005, head_top - 0.75 * r * 0.78 + 0.03)))
        bone_parent(ob)
        extra.append(ob)
    elif hat == 'toque':
        r = head_half_w * 1.05
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=20, radius1=r, radius2=r * 1.12, depth=0.16)
        bmesh.ops.translate(bm, vec=(0.0, 0.0, 0.08), verts=bm.verts)
        ret = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r * 1.35)
        bmesh.ops.scale(bm, vec=(1.0, 1.0, 0.55), verts=ret['verts'])
        bmesh.ops.translate(bm, vec=(0.0, 0.0, 0.17), verts=ret['verts'])
        ob = add_bm_object('Z_hat', bm, mat_rgb('Z_hatm', outfit['hat_rgb'], 0.8),
                           Vector((0.0, head_c.y + 0.01, head_top - 0.06)))
        ob.rotation_euler = (math.radians(-8), 0, 0)
        bpy.context.view_layer.update()
        bone_parent(ob)
        extra.append(ob)

    if outfit.get('legs') == 'skirt':
        # qipao skirt: elliptical rings fitted around the hips/legs, pelvis at
        # the top blending to the thighs below so it follows the stride.
        K, S = 8, 28
        z0 = z_belt - 0.02
        z1 = z0 - outfit.get('skirt_len', 0.6)
        rings = []
        for k in range(K + 1):
            zk = z0 + (z1 - z0) * k / K
            sel = P[(np.abs(P[:, 2] - zk) < 0.03) & np.isin(fam, ('torso', 'thigh', 'calf'))]
            cx = 0.0
            cy = float(0.5 * (sel[:, 1].min() + sel[:, 1].max())) if len(sel) else 0.0
            rx = float(np.abs(sel[:, 0]).max()) + 0.02 if len(sel) else 0.2
            ry = float(0.5 * (sel[:, 1].max() - sel[:, 1].min())) + 0.03 if len(sel) else 0.15
            flare = 1.0 + 0.04 * k / K
            rings.append((zk, cx, cy, rx * flare, ry * flare))
        bm = bmesh.new()
        vv = []
        for (zk, cx, cy, rx, ry) in rings:
            row = []
            for s in range(S):
                th = 2 * math.pi * s / S
                row.append(bm.verts.new((cx + rx * math.cos(th), cy + ry * math.sin(th), zk)))
            vv.append(row)
        for k in range(K):
            for s in range(S):
                a0, a1 = vv[k][s], vv[k][(s + 1) % S]
                b0, b1 = vv[k + 1][s], vv[k + 1][(s + 1) % S]
                bm.faces.new((a0, a1, b1, b0))
        bm.normal_update()
        mesh = bpy.data.meshes.new('Z_skirt')
        bm.to_mesh(mesh)
        bm.free()
        sk = bpy.data.objects.new('Z_skirt', mesh)
        sc.collection.objects.link(sk)
        sk.parent = arm
        vg = {nm: sk.vertex_groups.new(name=nm) for nm in ('pelvis', 'thigh_l', 'thigh_r')}
        scol = []
        for vi, v in enumerate(mesh.vertices):
            k = vi // S
            t = k / K
            rx = rings[k][3]
            s_ = max(-1.0, min(1.0, v.co.x / rx * 1.6))
            wl = 0.5 * (s_ + 1)
            wth = min(0.8, t * 1.1)   # legs may poke through the side slits
            vg['pelvis'].add([vi], 1.0 - wth, 'REPLACE')
            vg['thigh_l'].add([vi], wth * wl, 'REPLACE')
            vg['thigh_r'].add([vi], wth * (1 - wl), 'REPLACE')
            pc = np.array(outfit['dress'], dtype=float) * (0.80 + 0.2 * fr(v.co, 5.0, 1.0))
            if k == K or (abs(v.co.x) > rx * 0.93 and k >= K - 3):
                pc = np.array(outfit['trim'])
            elif nz(v.co, 40.0, 3.0) > 0.58:
                pc = np.array((0.85, 0.55, 0.22))
            b = fr(v.co, 3.2, 11.0) + 0.25 * nz(v.co, 11.0, 5.0)
            if b > 0.62 - 0.38 * cfg['blood']:
                pc = blood_dark
            scol.append(pc)
        mod = sk.modifiers.new('arm', 'ARMATURE')
        mod.object = arm
        set_colors(mesh, np.array(scol))
        one_material(sk, body_mat)
        extra.append(sk)

    markers = []
    if job.get('marker'):
        for nm, pos, rgb in (('Z_mark_left', (0.42, 0.0, z_chest), (1, 0, 0)),
                             ('Z_mark_front', (0.0, -0.42, z_neck + 0.05), (0, 0, 1))):
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=0.14)
            ob = add_bm_object(nm, bm, mat_rgb(nm + 'm', rgb, emit=True), Vector(pos))
            ob.parent = arm
            markers.append(ob)

    # --- orientation: face +X (thing frame: x forward, y left) ---------------------------
    arm.rotation_mode = 'XYZ'
    arm.rotation_euler = (0, 0, math.pi / 2)
    s = cfg.get('scale', 1.0)
    arm.scale = (s, s, s)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    render_objs = [body, eyes] + ([brows] if brows else []) + extra

    ARM_BONES = tuple(b.name for b in arm.data.bones if b.name.startswith(
        ('clavicle', 'upperarm', 'lowerarm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky')))

    def sample(action, t):
        (f0, f1), d = curves[action]
        if action.endswith('_Loop'):
            t = f0 + (t - f0) % (f1 - f0)
        t = min(max(t, f0), f1)
        pose = {}
        for (b, prop), comps in d.items():
            dflt = {'location': (0, 0, 0), 'rotation_quaternion': (1, 0, 0, 0), 'scale': (1, 1, 1)}[prop]
            pose.setdefault(b, {})[prop] = [comps[i].evaluate(t) if i in comps else dflt[i] for i in range(len(dflt))]
        return pose

    def apply_pose(fspec):
        pose = sample(fspec['action'], fspec['time'])
        for pb in arm.pose.bones:
            v = pose.get(pb.name, {})
            pb.location = v.get('location', (0, 0, 0))
            q = Quaternion(v.get('rotation_quaternion', (1, 0, 0, 0)))
            q.normalize()
            if pb.name in fspec.get('set', {}):
                q = Euler([math.radians(a) for a in fspec['set'][pb.name]], 'XYZ').to_quaternion()
            if pb.name in fspec.get('add', {}):
                q = q @ Euler([math.radians(a) for a in fspec['add'][pb.name]], 'XYZ').to_quaternion()
            pb.rotation_quaternion = q
            pb.scale = v.get('scale', (1, 1, 1))
        if cfg.get('head_scale'):
            hs = cfg['head_scale']
            arm.pose.bones['Head'].scale = (hs, hs, hs)
        arm.location = (0, 0, 0)
        bpy.context.view_layer.update()

    def bounds():
        dgr = bpy.context.evaluated_depsgraph_get()
        pts = []
        for ob in render_objs:
            oe = ob.evaluated_get(dgr)
            m = oe.to_mesh()
            a = np.empty(len(m.vertices) * 3)
            m.vertices.foreach_get('co', a)
            a = a.reshape(-1, 3)
            W = np.array(oe.matrix_world)
            pts.append(a @ W[:3, :3].T + W[:3, 3])
            oe.to_mesh_clear()
        return np.concatenate(pts)

    frames = job['frames']
    info = {}
    for fs in frames:
        apply_pose(fs)
        b = bounds()
        lo, hi = float(b[:, 2].min()), float(b[:, 2].max())
        dz = -lo   # lowest point (planted foot, lying body) on the ground
        info[fs['name']] = dict(dz=dz, h=hi + dz, xmin=float(b[:, 0].min()), xmax=float(b[:, 0].max()))
    walk_h = max(info[f['name']]['h'] for f in frames if f.get('measure'))
    ppm = job.get('ppm') or job['target_h'] / walk_h
    print('walk height %.3f m -> %.2f px/m' % (walk_h, ppm))

    # --- camera, lights, render settings -----------------------------------------------
    Nc, G = job['canvas'], job['ground']
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = Nc / ppm
    cam.data.clip_start = 0.1
    cam.data.clip_end = 100.0

    def sun(name, d_cam, strength, angle=0.2):
        lt = bpy.data.lights.new(name, 'SUN')
        lt.energy = strength
        lt.angle = angle
        ob = bpy.data.objects.new(name, lt)
        sc.collection.objects.link(ob)
        ob.parent = cam
        dv = Vector(d_cam).normalized()
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = (-dv).to_track_quat('Z', 'Y')
        return ob
    L = job['light']
    sun('key', (0.62, -0.62, -0.55), L['key'])          # from the upper front-left of the view
    sun('fill', (-0.75, -0.05, -0.45), L['fill'])       # dim fill from the right
    sun('rim', (0.1, -0.35, 0.95), L['rim'])            # faint back light for the silhouette
    world = bpy.data.worlds.new('W')
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = next((nd for nd in world.node_tree.nodes if nd.type == 'BACKGROUND'), None) if world.node_tree else None
    if bg:
        bg.inputs['Color'].default_value = (L['amb'], L['amb'], L['amb'], 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        world.color = (L['amb'],) * 3

    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = job['samples']
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 0
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.filter_width = 1.0
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = job.get('threads', 2)
    sc.render.use_persistent_data = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = Nc * SS
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'

    def place_cam(phi, elev):
        zt = (Nc / 2 - G) / (math.cos(elev) * ppm)
        T = Vector((0.0, 0.0, zt))
        dv = Vector((math.cos(elev) * math.cos(phi), math.cos(elev) * math.sin(phi), math.sin(elev)))
        cam.location = T + dv * 30.0
        cam.rotation_mode = 'XYZ'
        cam.rotation_euler = (math.pi / 2 - elev, 0.0, phi + math.pi / 2)
        bpy.context.view_layer.update()

    images = []
    R = Nc * SS
    for fs in frames:
        apply_pose(fs)
        arm.location = (0, 0, info[fs['name']]['dz'])
        bpy.context.view_layer.update()
        if fs['kind'] == 'rot':
            views = [(r, math.radians(45 * (r - 1)), 0.0) for r in fs.get('rots', range(1, 9))]
        else:
            views = [(0, math.radians(job['death_view'][0]), math.radians(job['death_view'][1]))]
        for r, phi, elev in views:
            place_cam(phi, elev)
            path = os.path.join(out_dir, '%s%d.png' % (fs['name'], r))
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            uv = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
            images.append(dict(frame=fs['name'], rot=r, kind=fs['kind'], file=path,
                               origin=[uv.x * R, (1 - uv.y) * R], time=fs['time']))
    json.dump(dict(job_hash=job['hash'], ppm=ppm, walk_h=walk_h, info=info, images=images),
              open(os.path.join(out_dir, 'meta.json'), 'w'), indent=1)
    print('worker done', len(images), 'images')


# ===========================================================================
# Driver (system python: numpy, PIL, doomgfx)
# ===========================================================================

PREFIXES = list(CHARS)


def make_job(prefix, assets, samples, raw_root, marker=False):
    cfg = CHARS[prefix]
    frames = frames_for(cfg['motion'])
    if marker:
        frames = [dict(f, name='M') for f in frames if f['name'] == 'A']
    job = dict(prefix=prefix, cfg=cfg, frames=frames, assets=assets, samples=samples,
               target_h=KID_H if prefix == 'ZKID' else ADULT_H, canvas=CANVAS, ground=GROUND,
               death_view=(72.0, 18.0), marker=marker, threads=2,
               light=dict(key=4.6, fill=1.5, rim=0.8, amb=0.18),
               ppm=None if prefix == 'ZKID' else ADULT_PPM,
               out_dir=os.path.join(raw_root, prefix + ('_marker' if marker else '')))
    h = hashlib.sha1((VERSION + json.dumps({k: v for k, v in job.items() if k not in ('assets', 'out_dir')},
                                           sort_keys=True)).encode()).hexdigest()[:16]
    job['hash'] = h
    return job


def run_jobs(jobs, nproc, force):
    """Render jobs (in parallel) whose cached meta.json is missing/stale."""
    todo = []
    for job in jobs:
        meta = os.path.join(job['out_dir'], 'meta.json')
        if not force and os.path.exists(meta):
            try:
                if json.load(open(meta)).get('job_hash') == job['hash']:
                    continue
            except Exception:
                pass
        os.makedirs(job['out_dir'], exist_ok=True)
        jp = os.path.join(job['out_dir'], 'job.json')
        json.dump(job, open(jp, 'w'), indent=1)
        todo.append((job, jp))
    running = []
    while todo or running:
        while todo and len(running) < nproc:
            job, jp = todo.pop(0)
            log = open(os.path.join(job['out_dir'], 'render.log'), 'w')
            cmd = blender_cmd(os.path.abspath(__file__), ['--worker', jp])
            print('rendering', job['prefix'], '(%d frames)' % len(job['frames']))
            running.append((job, subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT), log))
        job, p, log = running[0]
        rc = p.wait()
        log.close()
        running.pop(0)
        if rc != 0 or not os.path.exists(os.path.join(job['out_dir'], 'meta.json')):
            raise SystemExit('render failed for %s, see %s' % (job['prefix'], log.name))


def load_meta(job):
    m = json.load(open(os.path.join(job['out_dir'], 'meta.json')))
    if m.get('job_hash') != job['hash']:
        raise SystemExit('stale render cache for ' + job['prefix'])
    return m


def srgb_to_lin(c):
    import numpy as np
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    import numpy as np
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def downscale(path):
    """3x render -> (rgb sRGB float, alpha) at sprite resolution."""
    import numpy as np
    from PIL import Image
    im = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0
    a = im[..., 3:4]
    pm = srgb_to_lin(im[..., :3]) * a
    H, W = a.shape[:2]

    def box(v):
        return v.reshape(H // SS, SS, W // SS, SS, v.shape[2]).mean(axis=(1, 3))
    pmd, ad = box(pm), box(a)
    rgb = lin_to_srgb(pmd / np.maximum(ad, 1e-5))
    return rgb, ad[..., 0]


def finish(rgb, alpha, grade):
    """Threshold alpha, grade, outline, quantize. Returns (indices, mask)."""
    import numpy as np
    import doomgfx as dg
    mask = alpha >= 0.5
    c = np.clip(rgb, 0, 1)
    c = np.clip((c - 0.5) * grade['contrast'] + 0.5, 0, 1) * grade['bright']
    lum = c.mean(axis=2, keepdims=True)
    c = np.clip(lum + (c - lum) * grade['sat'], 0, 1)
    # dark 1-px outline on silhouette pixels touching transparency (4-neighbour)
    pad = np.pad(mask, 1)
    inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    edge = mask & ~inner
    c[edge] *= grade['outline']
    ind = keep_reds(c, dg.quantize(c * 255.0))
    return ind, mask


# DOOM's COLORMAP keeps the pure red ramp (palette 176-191, what id's blood
# uses) red down to the darkest light levels, but the brick/flesh reds
# (16-47) that plain nearest-colour quantization picks for blood, the qipao
# and the kid's shirt turn brown at ordinary street distances (light 112-160,
# levels ~15-24). Strongly saturated red pixels are therefore quantized to the
# pure ramp. (Same rule as render_props.py.)
RED_RAMP = tuple(range(176, 192))


def keep_reds(c, ind):
    """c: graded sRGB 0..1 (H, W, 3); ind: its plain quantization."""
    import numpy as np
    import doomgfx as dg
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    hue = (g - b) / np.maximum(r - mn, 1e-6)        # x60 deg when red is the max
    red = (r >= mx) & (sat >= 0.6) & (r >= 0.25) & (hue > -0.3) & (hue < 0.22)
    if red.any():
        other = set(range(256)) - set(RED_RAMP)
        ind = ind.copy()
        ind[red] = dg.quantize(c[red][None] * 255.0, exclude=other)[0]
    return ind


GRADE = dict(contrast=1.10, bright=1.0, sat=0.95, outline=0.68)


def build_prefix(prefix, job, meta, previews):
    """Post-process one prefix: lumps + contact sheet. Returns sprite list."""
    import numpy as np
    import doomgfx as dg
    N, G = job['canvas'], job['ground']
    ox_c, oy_c = N / 2.0, float(N - G)
    out = []
    recs = meta['images']
    death = [r for r in recs if r['kind'] == 'death']
    # death sequence: drift the origin from the standing pose to the centre of
    # the lying body so the corpse sits on the thing's position.
    dshift = {}
    if death:
        last = death[-1]
        rgb, al = downscale(last['file'])
        cols = np.nonzero((al >= 0.5).any(axis=0))[0]
        cL = 0.5 * (cols.min() + cols.max() + 1)
        w = [0.0, 0.2, 0.45, 0.8, 1.0]
        for i, r in enumerate(death):
            dshift[r['frame']] = (cL - r['origin'][0] / SS) * w[min(i, len(w) - 1)]
    for r in recs:
        rgb, al = downscale(r['file'])
        ox, oy = r['origin'][0] / SS, r['origin'][1] / SS
        if abs(ox - ox_c) > 0.01 or (r['kind'] == 'rot' and abs(oy - oy_c) > 0.01):
            raise SystemExit('origin not on the pixel grid: %r' % r)
        ind, mask = finish(rgb, al, GRADE)
        ys, xs = np.nonzero(mask)
        if not len(ys):
            raise SystemExit('empty sprite ' + r['file'])
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        ind, mask = ind[y0:y1, x0:x1], mask[y0:y1, x0:x1]
        if r['kind'] == 'death':
            left = int(round(ox + dshift.get(r['frame'], 0) - x0))
            top = int(y1 - y0) - 1         # body rests on the floor, 1 px sunk
        else:
            left = int(round(ox - x0))
            top = int(round(oy - y0))
        name = '%s%s%d' % (prefix, r['frame'], r['rot'])
        dg.write_lump('sprites', name, dg.encode_picture(ind, mask, left, top))
        out.append(dict(name=name, frame=r['frame'], rot=r['rot'], ind=ind, mask=mask, left=left, top=top))
    if previews:
        contact_sheet(prefix, out, os.path.join(dg.BUILD, 'previews', 'zombies', prefix + '.png'))
    return out


def poss_sprites():
    """Shareware zombieman frames for the line-up (decoded from doom1.wad)."""
    import struct
    import numpy as np
    import doomgfx as dg
    data = open(dg.IWAD, 'rb').read()
    _, n, off = struct.unpack_from('<4sii', data, 0)
    res = {}
    for i in range(n):
        lo, ls, ln = struct.unpack_from('<ii8s', data, off + i * 16)
        nm = ln.rstrip(b'\0').decode('ascii', 'replace')
        if nm in ('POSSA1', 'POSSA2A8', 'POSSA3A7', 'POSSE1', 'POSSG1', 'POSSL0'):
            res[nm] = decode_picture(data[lo:lo + ls])
    return res


def decode_picture(b):
    import struct
    import numpy as np
    w, h, l, t = struct.unpack_from('<HHhh', b, 0)
    ind = np.zeros((h, w), np.uint8)
    m = np.zeros((h, w), bool)
    for xx in range(w):
        p = struct.unpack_from('<I', b, 8 + 4 * xx)[0]
        while b[p] != 255:
            ys, ln = b[p], b[p + 1]
            ind[ys:ys + ln, xx] = list(b[p + 3:p + 3 + ln])
            m[ys:ys + ln, xx] = True
            p += ln + 4
    return dict(ind=ind, mask=m, left=l, top=t)


def paste(canvas, spr, ox, oy, pal):
    """Paste a sprite with its origin at canvas (ox, oy)."""
    import numpy as np
    h, w = spr['ind'].shape
    x0, y0 = ox - spr['left'], oy - spr['top']
    rgb = pal[spr['ind']]
    sub = canvas[y0:y0 + h, x0:x0 + w]
    mk = spr['mask'][:sub.shape[0], :sub.shape[1]]
    sub[mk] = rgb[:sub.shape[0], :sub.shape[1]][mk]


def contact_sheet(prefix, sprites, path, scale=3):
    import numpy as np
    from PIL import Image, ImageDraw
    import doomgfx as dg
    pal = dg.palette()
    rows = [f for f in 'ABCDEFG']
    cw = max(max(s['left'], s['ind'].shape[1] - s['left']) for s in sprites) * 2 + 6
    up = max(s['top'] for s in sprites) + 4
    down = max(max(0, s['ind'].shape[0] - s['top']) for s in sprites) + 4
    ch = up + down
    W = 8 * cw + 20
    H = (len(rows) + 1) * ch + 4
    can = np.zeros((H, W, 3), np.uint8)
    can[:] = (52, 50, 56)
    by = {(s['frame'], s['rot']): s for s in sprites}
    for ri, f in enumerate(rows):
        for r in range(1, 9):
            s = by.get((f, r))
            if s:
                can[ri * ch + up, 20 + (r - 1) * cw:20 + r * cw - 2] = (80, 78, 86)
                paste(can, s, 20 + (r - 1) * cw + cw // 2, ri * ch + up, pal)
    for i, f in enumerate('HIJKL'):
        s = by.get((f, 0))
        if s:
            yb = len(rows) * ch + up
            can[yb, 20 + i * cw * 8 // 5:20 + (i + 1) * cw * 8 // 5 - 4] = (80, 78, 86)
            paste(can, s, 20 + i * cw * 8 // 5 + cw * 4 // 5, yb, pal)
    im = Image.fromarray(can).resize((W * scale, H * scale), Image.NEAREST)
    d = ImageDraw.Draw(im)
    for ri, f in enumerate(rows + ['H-L']):
        d.text((4, ri * ch * scale + 4), f, fill=(230, 230, 230))
    d.text((W * scale - 120, 4), prefix + ' rot 1..8', fill=(230, 230, 230))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


def lineup(all_sprites, path):
    """POSS vs every zombie (front walk, side walk, attack, pain, corpse) at
    1x and 3x on a dark street-ish background, to judge DOOM-scale reading."""
    import numpy as np
    from PIL import Image
    import doomgfx as dg
    pal = dg.palette()
    poss = poss_sprites()
    cols = [('POSS', [poss['POSSA1'], poss['POSSA3A7'], poss['POSSE1'], poss['POSSG1'], poss['POSSL0']])]
    for p, spr in all_sprites.items():
        by = {(s['frame'], s['rot']): s for s in spr}
        cols.append((p, [by[('A', 1)], by[('B', 3)], by[('E', 2)], by[('G', 1)], by[('L', 0)]]))
    # one row per character: POSS first, then the zombies, all at 1 px = 1 unit
    cw, ch = 76, 76
    can = np.zeros((ch * len(cols), 8 + 5 * cw, 3), np.uint8)
    for ri, (p, ss) in enumerate(cols):
        y0 = ri * ch
        can[y0:y0 + ch] = np.linspace(34, 62, ch).astype(np.uint8)[:, None, None]
        can[y0 + ch - 10:y0 + ch] = (58, 56, 54)
        for k, s in enumerate(ss):
            paste(can, s, 8 + k * cw + cw // 2, y0 + ch - 10, pal)
    im = Image.fromarray(can)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path.replace('.png', '_1x.png'))
    im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(path)


def verify_lumps(prefixes):
    """Decode every lump with the engine's decodePatch and check sizes."""
    import doomgfx as dg
    d = os.path.join(dg.LUMPS, 'sprites')
    js = r'''
import fs from 'fs';
const { decodePatch } = await import(process.argv[1]);
const dir = process.argv[2]; const pre = process.argv[3].split(',');
const res = {};
for (const f of fs.readdirSync(dir)) {
  if (!pre.some((p) => f.startsWith(p))) continue;
  const b = new Uint8Array(fs.readFileSync(dir + '/' + f));
  const img = decodePatch(b);
  if (!img) { res[f] = null; continue; }
  let opaque = 0; for (const m of img.mask) if (m) opaque++;
  res[f] = [img.width, img.height, img.leftOffset, img.topOffset, opaque];
}
console.log(JSON.stringify(res));
'''
    url = 'file://' + os.path.join(ROOT, 'src', 'wad', 'graphics.js')
    r = subprocess.run(['node', '--input-type=module', '-e', js, url, d, ','.join(prefixes)],
                       capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit('node verify failed: ' + r.stderr)
    res = json.loads(r.stdout)
    bad = [k for k, v in res.items() if v is None]
    if bad:
        raise SystemExit('engine could not decode: %s' % bad)
    return res


def rotation_test(assets, raw_root, samples):
    """Render ZCV1 with a red cube on its LEFT (+y) and a blue cube in FRONT
    (+x), then ask the engine's rotation formula (src/render/view.js) which
    image it shows for viewers all around things at several angles, and
    check the markers appear where that viewer would see them."""
    import numpy as np
    from PIL import Image
    job = make_job('ZCV1', assets, min(samples, 8), raw_root, marker=True)
    job['ppm'] = 34.0
    job['hash'] = job['hash'] + 'm'
    run_jobs([job], 1, False)
    meta = load_meta(job)
    seen = {}
    for rec in meta['images']:
        im = np.asarray(Image.open(rec['file']).convert('RGBA')).astype(int)
        ox = rec['origin'][0]
        res = {}
        for key, sel in (('left', (im[..., 0] > 200) & (im[..., 1] < 60) & (im[..., 2] < 60)),
                         ('front', (im[..., 2] > 200) & (im[..., 0] < 60) & (im[..., 1] < 60))):
            xs = np.nonzero(sel)[1]
            res[key] = None if len(xs) < 20 else float(xs.mean() - ox) / job['ppm'] / SS
        seen[rec['rot']] = res
    js = r'''
const { normAngle } = await import(process.argv[1]);
const out = [];
for (const ta of [0, 0.7, 2.2, 3.9, 5.5]) for (let k = 0; k < 32; k++) {
  const ca = k * Math.PI / 16 + 0.05;
  const cam = { x: 500 * Math.cos(ca), y: 500 * Math.sin(ca) };
  const mo = { x: 0, y: 0, angle: ta };
  // src/render/view.js sprite rotation selection
  const ang = Math.atan2(mo.y - cam.y, mo.x - cam.x);
  const rot = Math.floor(normAngle(ang - mo.angle + (Math.PI / 8) * 9) / (Math.PI / 4)) & 7;
  out.push({ ta, ca, rot: rot + 1 });
}
console.log(JSON.stringify(out));
'''
    url = 'file://' + os.path.join(ROOT, 'src', 'game', 'defs.js')
    r = subprocess.run(['node', '--input-type=module', '-e', js, url], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    cases = json.loads(r.stdout)
    fails = 0
    checked = 0
    for c in cases:
        ta, ca, rot = c['ta'], c['ca'], c['rot']
        # viewer looks from cam toward the thing; screen right = (sin a, -cos a)
        a = math.atan2(-math.sin(ca), -math.cos(ca))
        right = (math.sin(a), -math.cos(a))
        exp = {'left': (-0.42 * math.sin(ta), 0.42 * math.cos(ta)),
               'front': (0.42 * math.cos(ta), 0.42 * math.sin(ta))}
        for key, (mx, my) in exp.items():
            e = mx * right[0] + my * right[1]
            got = seen[rot][key]
            if got is None or abs(e) < 0.2:
                continue
            checked += 1
            if (got > 0) != (e > 0) or abs(got - e) > 0.25:
                fails += 1
                print('MISMATCH thing %.2f cam %.2f rot %d %s expected %.2f got %.2f' % (ta, ca, rot, key, e, got))
    print('rotation test: %d marker checks over %d viewer positions, %d mismatches' % (checked, len(cases), fails))
    for r_ in range(1, 9):
        print('  rot %d: left marker %s, front marker %s' % (r_, fmt(seen[r_]['left']), fmt(seen[r_]['front'])))
    if fails:
        raise SystemExit('rotation test failed')


def fmt(v):
    return 'hidden' if v is None else '%+.2f m' % v


def write_credits(prefixes):
    path = os.path.join(HERE, 'credits', 'zombies.md')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = [
        '# Zombie sprites (tools/ct/render_zombies.py)',
        '',
        'Lumps: %s, frames A-D walk, E-F attack, G pain (rotations 1-8), H-L death (rotation 0).' % ', '.join(prefixes),
        'All sprites are original renders made by `tools/ct/render_zombies.py` in Blender (bpy, Cycles) from the CC0',
        'models and animations below; clothing, skin, blood, hats and skirt are generated procedurally by the script.',
        '',
        '| asset | author | licence | source | used for |',
        '|---|---|---|---|---|',
        '| Universal Base Characters (Standard): Superhero_Male_FullBody, Superhero_Female_FullBody, Hair_Buzzed, '
        'Hair_SimpleParted, Hair_Buns | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-base-characters | '
        'body meshes, eyes, eyebrows, hair |',
        '| Universal Animation Library (Standard), UAL1_Standard.glb: Sprint_Loop, Jog_Fwd_Loop, Death01 | Quaternius | '
        'CC0 1.0 | https://quaternius.itch.io/universal-animation-library | runner/kid run cycles, deaths |',
        '| Universal Animation Library 2 (Standard), UAL2_Standard.glb: Zombie_Walk_Fwd_Loop, Zombie_Scratch, '
        'Hit_Knockback | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-animation-library-2 | '
        'shambler walk, attacks, pain base pose, runner death |',
        '| DOOM palette (PLAYPAL of the shareware doom1.wad) | id Software | read at build time only, not redistributed by '
        'this script | assets/wads/doom1.wad | colour quantization; POSS frames only appear in the local preview line-up |',
        '',
        'The three Quaternius packs are fetched through itch.io\'s free-download flow into `build/ct/cache/` when',
        'missing (the licence text ships inside each zip as License.txt / License_Standard.txt).',
        '',
    ]
    for p in prefixes:
        lines.append('- `%s`: %s.' % (p, CHARS[p]['desc']))
    lines.append('')
    open(path, 'w').write('\n'.join(lines))


def main(argv):
    if '--worker' in argv:
        worker(argv[argv.index('--worker') + 1])
        return
    sys.path.insert(0, os.path.join(HERE, 'lib'))
    import doomgfx as dg
    args = argv[1:]

    def opt(name, default=None):
        return args[args.index(name) + 1] if name in args else default
    prefixes = opt('--only', ','.join(PREFIXES)).split(',')
    for p in prefixes:
        if p not in CHARS:
            raise SystemExit('unknown prefix ' + p)
    samples = int(opt('--samples', '16'))
    nproc = int(opt('--jobs', '2'))
    force = '--force' in args
    assets = ensure_assets()
    raw_root = os.path.join(dg.BUILD, 'previews', 'zombies', 'raw')
    if '--rotation-test' in args:
        rotation_test(assets, raw_root, samples)
        return
    jobs = [make_job(p, assets, samples, raw_root) for p in prefixes]
    run_jobs(jobs, nproc, force)
    sdir = os.path.join(dg.LUMPS, 'sprites')
    all_sprites = {}
    for job in jobs:
        p = job['prefix']
        if os.path.isdir(sdir):
            for f in os.listdir(sdir):
                if f.startswith(p) and f.endswith('.lmp'):
                    os.remove(os.path.join(sdir, f))
        meta = load_meta(job)
        all_sprites[p] = build_prefix(p, job, meta, previews=True)
        hs = [s['ind'].shape[0] for s in all_sprites[p] if s['frame'] in 'ABCD']
        print('%s: %d lumps, walk heights %d-%d px (%.1f px/m)' % (p, len(all_sprites[p]), min(hs), max(hs), meta['ppm']))
    if all_sprites:
        lineup(all_sprites, os.path.join(dg.BUILD, 'previews', 'zombies', 'lineup.png'))
    write_credits(PREFIXES)
    if '--no-verify' not in args:
        res = verify_lumps(prefixes)
        n = len(res)
        exp = 61 * len(prefixes)
        print('engine decodePatch: %d/%d lumps decoded' % (n, exp))
        if n != exp:
            raise SystemExit('expected %d lumps' % exp)
        for k, (w, h, l, t, op) in sorted(res.items()):
            if not (0 <= l <= w and 0 < t <= h + 2 and op > 30):
                raise SystemExit('odd sprite %s: %r' % (k, (w, h, l, t, op)))


if __name__ == '__main__':
    main(sys.argv)
