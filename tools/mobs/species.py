"""Coat shaders of the animals. Each shader gets the texels of one face (positions in model space,
see mobs.paint.Samples) and returns their colours; patterns are evaluated in 3D so they run
continuously over the whole body."""
import numpy as np

from mobs.paint import fbm, fur, grain, mix, ramp, rgb, smoothstep, vnoise, worley

BLACK = rgb('#1A1614')


class Ctx:
    """Per-model helpers: bounding boxes of parts and the eye positions."""

    def __init__(self, model, quads):
        self.model = model
        self.boxes = {}
        for q in quads:
            for vt in q['verts']:
                for key in (q['part'],) + ((q['tag'],) if q['tag'] else ()):
                    lo, hi = self.boxes.get(key, (np.full(3, 1e9), np.full(3, -1e9)))
                    p = np.array(vt[:3])
                    self.boxes[key] = (np.minimum(lo, p), np.maximum(hi, p))
        self.eyes = []
        if getattr(model, 'eyes', None):
            part, (x, y, z), r = model.eyes
            self.eyes = [(model.world(part, (x, y, z)), r), (model.world(part, (-x, y, z)), r)]

    def frac(self, s, key, axis):
        """0..1 position of the texels within the bounding box of a part or tag along an axis."""
        lo, hi = self.boxes[key]
        return np.clip((s.pos[:, axis] - lo[axis]) / max(1e-6, hi[axis] - lo[axis]), 0, 1)

    def eye(self, s, scale=1.0):
        """Distance to the nearest eye centre divided by the eye radius (<1 inside the eye)."""
        if not self.eyes:
            return np.full(s.n, 9.0)
        return np.min([np.linalg.norm(s.pos - c, axis=1) / (r * scale) for c, r in self.eyes], axis=0)


def paint_eye(col, s, ctx, iris='#2A1A10', ring=None, pupil='#0A0806', highlight=True):
    d = ctx.eye(s)
    side = np.abs(s.nrm[:, 0]) > 0.3
    if ring:
        col = np.where(((d < 1.7) & side)[:, None], mix(col, rgb(ring), 0.8), col)
    col = np.where(((d < 1.0) & side)[:, None], rgb(iris), col)
    col = np.where(((d < 0.55) & side)[:, None], rgb(pupil), col)
    return col


def is_(s, *names):
    return s.is_part(*names) or s.tag in names


def up(s):
    return np.clip(-s.nrm[:, 1], 0, 1)


def down(s):
    return np.clip(s.nrm[:, 1], 0, 1)


def hooves(col, s, height=1.2, color='#2A2420'):
    return np.where(((s.height < height) & (s.tag == 'leg'))[:, None], rgb(color), col)


# ============================================================================ savanna

def elephant(ctx):
    def sh(s):
        n = fbm(s.pos, 9, 1)
        col = ramp(n, (0, '#6A615D'), (0.5, '#7C716B'), (1, '#8D8079'))
        # red dust from dust baths, thickest low down
        dust = smoothstep(18, 3, s.height) * (0.35 + 0.4 * vnoise(s.pos, 6, 2))
        col = mix(col, rgb('#8E6B4E'), dust)
        if is_(s, 'trunk1', 'trunk2', 'trunk3'):
            wr = np.sin(s.y * 3.9 + vnoise(s.pos, 3, 3) * 2.5) > 0.55
            col = np.where(wr[:, None], col * 0.82, col)
        elif s.tag == 'leg':
            wr = np.sin(s.y * 2.1 + vnoise(s.pos, 4, 4) * 3) > 0.8
            col = np.where(wr[:, None], col * 0.86, col)
            nail = (s.height < 2.2) & (s.height > 0.6) & (s.nrm[:, 2] < -0.5) & (np.sin(s.x * 2.4) > 0.2)
            col = np.where(nail[:, None], rgb('#C8BBA6'), col)
        elif is_(s, 'ear_l', 'ear_r'):
            d1, d2, _ = worley(s.pos, 3.0, 5)
            vein = (d2 - d1) < 0.12
            inner = np.abs(s.nrm[:, 0]) > 0.5
            col = np.where(inner[:, None], mix(col, rgb('#8E7470'), 0.35), col)
            col = np.where((vein & inner)[:, None], col * 0.8, col)
        else:
            d1, d2, _ = worley(s.pos, 5.5, 6)
            col = np.where(((d2 - d1) < 0.06)[:, None], col * 0.88, col)
        if s.tag == 'tusk':
            t = smoothstep(0, 1, ctx.frac(s, 'tusk', 2))
            col = ramp(1 - t, (0, '#B49A70'), (0.35, '#DCCDAA'), (1, '#F2EADA')) * (1 + 0.04 * grain(s))[:, None]
            return col
        if s.tag == 'tuft':
            col = ramp(vnoise(s.pos, 1.5, 7), (0, '#141210'), (1, '#3A322C'))
        col = paint_eye(col, s, ctx, iris='#3A2618', ring='#4E4440')
        return fur(col, s, 0.07, 11)
    return sh


def giraffe(ctx):
    def sh(s):
        cream = rgb('#E9DAB4')
        head = is_(s, 'head', 'ear_l', 'ear_r')
        scale = 2.6 if head else 4.4
        d1, d2, ident = worley(s.pos * np.array([1.0, 0.85, 1.0]), scale, 21, 0.8)
        patch = ramp(ident, (0, '#7C3E1A'), (0.5, '#9A5424'), (1, '#B0662C'))
        patch = mix(patch, patch * 0.82, smoothstep(0.35, 0.0, d1))
        width = 0.13 if not head else 0.2
        col = np.where(((d2 - d1) < width)[:, None], cream, patch)
        if s.tag == 'leg':
            col = mix(col, cream, smoothstep(20, 9, s.height))
        col = mix(col, cream, down(s) * 0.55)
        if s.tag == 'muzzle':
            col = mix(col, rgb('#D8C29A'), 0.6)
        if s.tag == 'mane':
            col = ramp(vnoise(s.pos, 2, 22), (0, '#5E3A1E'), (1, '#8A5A30'))
        if s.tag == 'ossicone':
            col = np.where((ctx.frac(s, 'ossicone', 1) < 0.4)[:, None], rgb('#2A2018'), rgb('#B08860'))
        if s.tag == 'tuft':
            col = ramp(vnoise(s.pos, 1.5, 23), (0, '#141210'), (1, '#2E2620'))
        col = hooves(col, s, 1.3)
        col = paint_eye(col, s, ctx, iris='#2A1A10', ring='#5A3A20')
        return fur(col, s, 0.05, 12)
    return sh


def zebra(ctx):
    neck_axis = np.array([0.0, -0.866, -0.5])

    def stripes(phase, width=0.5):
        return np.sin(phase * 2 * np.pi) > (1 - 2 * width)

    def sh(s):
        white = rgb('#EEEAE0')
        black = rgb('#1A1716')
        warp = vnoise(s.pos, 5, 31) * 0.9
        if s.is_part('body') and s.tag != 'tail':
            k = smoothstep(-3, 8, s.z)
            phase = (s.z * (1 - 0.55 * k) + (s.y - 3) * 0.9 * k) / 3.4 + warp
            st = stripes(phase, 0.48)
            belly = (s.nrm[:, 1] > 0.5)
            st = np.where(belly, np.abs(s.x) < 0.8, st)
            col = np.where(st[:, None], black, white)
            shadow = (~st) & (k > 0.6) & (np.sin(phase * 2 * np.pi + np.pi) > 0.6)
            col = np.where(shadow[:, None], rgb('#B8A890'), col)
        elif s.tag == 'leg':
            col = np.where(stripes(s.y / 2.4 + warp * 0.4, 0.5)[:, None], black, white)
            col = hooves(col, s, 1.0, '#141210')
        elif s.tag == 'neck':
            col = np.where(stripes((s.pos @ neck_axis) / 3.0 + warp * 0.5, 0.5)[:, None], black, white)
        elif s.tag == 'mane':
            col = np.where(stripes((s.pos @ neck_axis) / 2.2, 0.45)[:, None], black, white)
            col = np.where((s.nrm[:, 2] > 0.5)[:, None], col * 0.85, col)
        elif s.tag == 'muzzle':
            col = ramp(vnoise(s.pos, 2, 32), (0, '#1C1A18'), (1, '#3A3430'))
        elif s.tag == 'ear':
            col = np.where((s.y < -12.3 + 4.0 * 0)[:, None] & (ctx.frac(s, 'ear', 1)[:, None] < 0.35), black, white)
        elif s.tag == 'tail':
            col = np.where((ctx.frac(s, 'tail', 1) > 0.45)[:, None], black,
                           np.where(stripes(s.y / 2.0)[:, None], black, white))
        else:
            col = np.where(stripes((s.pos @ neck_axis) / 1.8 + s.x * 0.1, 0.45)[:, None], black, white)
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#1A1614')
        return fur(col, s, 0.05, 13)
    return sh


def wildebeest(ctx):
    def sh(s):
        base = ramp(fbm(s.pos, 6, 41), (0, '#545B66'), (1, '#6B717A'))
        front = smoothstep(4, -12, s.z)
        brindle = (np.sin(s.z * 1.5 + vnoise(s.pos, 3, 42) * 3.5) > 0.4) & s.is_part('body', 'neck')
        col = np.where(brindle[:, None], mix(base, rgb('#30353C'), 0.4 + 0.5 * front[:, None]), base)
        col = mix(col, rgb('#7C7A76'), down(s) * 0.35)
        if s.tag == 'leg':
            col = ramp(s.height / 13, (0, '#3A322C'), (0.5, '#5E544A'), (1, '#6A645E'))
            col = hooves(col, s, 1.0)
        if is_(s, 'head', 'ear_l', 'ear_r') and s.tag != 'horn':
            col = ramp(vnoise(s.pos, 3, 43), (0, '#1E1C1C'), (1, '#3A3532'))
            if s.tag == 'muzzle':
                col = mix(col, rgb('#4A443E'), 0.5)
        if s.tag in ('mane', 'beard', 'tuft'):
            col = ramp(vnoise(s.pos, 1.5, 44), (0, '#121010'), (1, '#2A2624'))
        if s.tag == 'horn':
            col = ramp(ctx.frac(s, 'horn', 1), (0, '#C8C0B0'), (0.5, '#5A544C'), (1, '#2E2A26'))
        col = paint_eye(col, s, ctx, iris='#1A1210')
        return fur(col, s, 0.06, 14)
    return sh


GAZELLES = {
    'thomsons_gazelle': dict(back='#B4783E', back2='#C68B4C', stripe='#2A1E18', stripe_strength=1.0, face_marks=True),
    'dorcas_gazelle': dict(back='#C9A26C', back2='#D8B47E', stripe='#9A7444', stripe_strength=0.6, face_marks=True),
    'mongolian_gazelle': dict(back='#C2AE86', back2='#D2BE96', stripe='#A89470', stripe_strength=0.0, face_marks=False),
}


def gazelle(ctx, variant):
    v = GAZELLES[variant]
    white = rgb('#EEE8DC')

    def sh(s):
        col = ramp(fbm(s.pos, 4, 51), (0, v['back']), (1, v['back2']))
        if s.is_part('body'):
            t = ctx.frac(s, 'body', 1)
            side = np.abs(s.nrm[:, 0]) > 0.5
            band = side & (t > 0.55) & (t < 0.72)
            col = np.where(band[:, None], mix(col, rgb(v['stripe']), v['stripe_strength']), col)
            col = np.where(((t >= 0.72) & side | (s.nrm[:, 1] > 0.5))[:, None], white, col)
            rump = (s.nrm[:, 2] > 0.5) & (t > 0.25)
            col = np.where(rump[:, None], white, col)
        if s.tag == 'leg':
            inner = (s.nrm[:, 2] > 0.5) | (s.nrm[:, 0] * np.sign(s.x) < -0.5)
            col = np.where(inner[:, None], white, col)
            col = hooves(col, s, 0.8)
        if s.is_part('neck'):
            col = np.where((s.nrm[:, 2] < -0.5)[:, None], mix(col, white, 0.7), col)
        if s.is_part('head') and s.tag != 'horn':
            if v['face_marks']:
                rel = ctx.frac(s, 'head', 2)
                side = np.abs(s.nrm[:, 0]) > 0.5
                ys = ctx.frac(s, 'head', 1)
                # a pale line from the eye to the nose above a dark cheek stripe
                col = np.where((side & (ys > 0.34) & (ys < 0.5) & (rel < 0.62))[:, None], mix(col, white, 0.85), col)
                col = np.where((side & (ys >= 0.5) & (ys < 0.66) & (rel < 0.55))[:, None], mix(col, rgb('#4A3020'), 0.6), col)
            col = np.where((s.nrm[:, 1] > 0.5)[:, None], white, col)
        if s.tag == 'horn':
            ring = np.sin(s.y * 3.0) > 0.3
            col = np.where(ring[:, None], rgb('#2A2420'), rgb('#4A423A'))
        if s.tag == 'ear':
            col = np.where((s.nrm[:, 2] < -0.5)[:, None], white, col)
        if s.is_part('tail'):
            col = rgb('#1C1814') * np.ones((s.n, 1))
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#EEE8DC')
        return fur(col, s, 0.05, 15)
    return sh


def hippo(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 8, 61), (0, '#5E5056'), (1, '#74646A'))
        pink = rgb('#C48A82')
        t = smoothstep(14, 4, s.height)
        col = mix(col, pink, t * 0.55)
        if s.is_part('head'):
            edge = smoothstep(0.5, 1.0, np.abs(s.nrm[:, 0]))
            col = mix(col, pink, 0.25 + 0.2 * edge)
        if s.tag == 'jaw':
            inside = s.nrm[:, 1] < -0.5
            col = np.where(inside[:, None], rgb('#D27C80'), mix(col, pink, 0.45))
        if s.tag == 'tooth':
            col = rgb('#EFE8D8') * np.ones((s.n, 1))
        if s.tag == 'nostrils':
            col = np.where((np.abs(np.abs(s.x) - 2.5) < 1.0)[:, None] & (s.nrm[:, 1] < -0.5)[:, None], rgb('#3A2A2C'), col)
        if is_(s, 'ear_l', 'ear_r') or s.tag == 'eyebump':
            col = mix(col, pink, 0.5)
        col = paint_eye(col, s, ctx, iris='#3A2216', ring='#B87870')
        return fur(col, s, 0.05, 16)
    return sh


def lion(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 5, 71), (0, '#B88648'), (0.5, '#C6965A'), (1, '#D0A468'))
        pale = rgb('#E4CDA2')
        col = mix(col, pale, down(s) * 0.7)
        if s.tag in ('leg', 'paw'):
            inner = s.nrm[:, 0] * np.sign(s.x) < -0.5
            col = np.where(inner[:, None], mix(col, pale, 0.6), col)
        if s.tag == 'muzzle':
            col = mix(col, rgb('#EADCC2'), 0.75)
            nose = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'muzzle', 1) < 0.45) & (np.abs(s.x) < 1.2)
            col = np.where(nose[:, None], rgb('#3A2622'), col)
        if is_(s, 'ear_l', 'ear_r'):
            col = np.where((s.nrm[:, 2] > 0.5)[:, None], rgb('#2E2018'), col)
        if s.tag == 'mane':
            depth = np.linalg.norm((s.pos - ctx.boxes['head'][0] * 0 - (ctx.boxes['head'][0] + ctx.boxes['head'][1]) / 2) * np.array([1, 1, 0.6]), axis=1)
            strands = vnoise(s.pos * np.array([3, 0.6, 3]), 1.6, 72)
            col = ramp(smoothstep(3, 9, depth) * 0.75 + strands * 0.35, (0, '#B48448'), (0.5, '#7A5028'), (1, '#3A2414'))
        if s.tag == 'tuft':
            col = ramp(vnoise(s.pos, 1.5, 73), (0, '#1A1410'), (1, '#3A2A1E'))
        col = paint_eye(col, s, ctx, iris='#B07A28', ring='#3A2A1E')
        return fur(col, s, 0.06, 17)
    return sh


def ostrich(ctx, female=False):
    def sh(s):
        if female:
            plum = ramp(vnoise(s.pos, 2, 81), (0, '#6A5C4E'), (1, '#8A7A68'))
            tips = rgb('#C8C0B4')
        else:
            plum = ramp(vnoise(s.pos, 2, 81), (0, '#141212'), (1, '#2E2A28'))
            tips = rgb('#F2F0EA')
        skin = rgb('#C9A6A0')
        col = plum
        if s.tag == 'wing':
            col = np.where((ctx.frac(s, 'wing', 1) > 0.55)[:, None], tips, plum)
        if s.tag == 'plume':
            col = mix(tips, plum, 0.15 * vnoise(s.pos, 1.5, 82))
        if s.is_part('neck') or (s.is_part('head') and s.tag is None):
            col = mix(skin, rgb('#A88C88'), vnoise(s.pos, 2, 83))
            fluff = (grain(s, 84) > 0.7)
            col = np.where(fluff[:, None], col * 0.85, col)
        if s.tag == 'beak':
            col = ramp(vnoise(s.pos, 2, 85), (0, '#C8AE9C'), (1, '#E0CABA'))
        if s.tag == 'thigh':
            col = rgb('#D8B6AE') * np.ones((s.n, 1))
        if s.tag in ('leg', 'foot'):
            col = ramp(s.height / 18, (0, '#8A7A74'), (0.4, '#C88C7A' if not female else '#A89088'), (1, '#C9A49A'))
        col = paint_eye(col, s, ctx, iris='#2A1A10', ring='#7A6A64')
        return fur(col, s, 0.06, 18)
    return sh


def crocodilian(ctx, back, band, side, belly, eye):
    def sh(s):
        col = ramp(fbm(s.pos, 4, 91), (0, back), (1, mix(rgb(back), rgb(side), 0.3)))
        if s.is_part('tail', 'tail2', 'tail3') or s.is_part('body'):
            bands = np.sin(s.z * 0.7 + vnoise(s.pos, 3, 92) * 2) > 0.45
            col = np.where(bands[:, None], mix(col, rgb(band), 0.7), col)
        sideways = np.abs(s.nrm[:, 0]) > 0.5
        col = np.where(sideways[:, None], mix(col, rgb(side), 0.45 + 0.3 * (grain(s, 93) > 0.6)[:, None]), col)
        col = np.where((s.nrm[:, 1] > 0.5)[:, None], rgb(belly) * (1 + 0.05 * grain(s, 94))[:, None], col)
        scute = (s.nrm[:, 1] < -0.5) & (np.abs(np.abs(s.x) - 2.0) < 0.6) & (np.sin(s.z * 1.6) > 0.1)
        col = np.where(scute[:, None], col * 0.72, col)
        if s.tag == 'jaw' or s.tag == 'snout':
            teeth = sideways & ((s.y > 19.6) & (s.y < 20.6)) & (np.sin(s.z * 2.2) > 0.4)
            col = np.where(teeth[:, None], rgb('#E8E0C8'), col)
        if s.tag == 'crest':
            col = col * 0.8
        col = paint_eye(col, s, ctx, iris=eye, pupil='#0A0806')
        return fur(col, s, 0.06, 19)
    return sh


# ============================================================================ Sahara

def fennec(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 4, 101), (0, '#D8BA86'), (1, '#E8D0A2'))
        white = rgb('#F3EBDC')
        col = mix(col, white, down(s) * 0.8)
        if s.tag == 'ear':
            inner = s.nrm[:, 2] < -0.5
            col = np.where(inner[:, None], mix(rgb('#EED4CC'), white, 0.4 * vnoise(s.pos, 1, 102)[:, None]), col)
        if s.tag == 'muzzle':
            col = mix(col, white, 0.6)
            tip = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'muzzle', 1) < 0.55)
            col = np.where(tip[:, None], rgb('#2A2220'), col)
        if s.tag == 'tail':
            tipd = ctx.frac(s, 'tail', 1) > 0.78
            col = np.where(tipd[:, None], rgb('#2A221C'), col)
        col = paint_eye(col, s, ctx, iris='#2A1A10', ring='#8A6A48')
        return fur(col, s, 0.05, 20)
    return sh


def addax(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 5, 111), (0, '#E2D8C4'), (1, '#F0E8D8'))
        col = mix(col, rgb('#B4A288'), up(s) * 0.5 * (s.is_part('body') * 1.0))
        if s.is_part('neck', 'head') and s.tag not in ('horn', 'forelock'):
            col = ramp(fbm(s.pos, 3, 112), (0, '#9E8A70'), (1, '#B49E84'))
            if s.is_part('head'):
                zf = ctx.frac(s, 'head', 2)
                col = np.where(((zf > 0.35) & (zf < 0.6))[:, None], rgb('#EEE8DC'), col)
                col = np.where((s.nrm[:, 1] > 0.5)[:, None], rgb('#E8E0D0'), col)
        if s.tag == 'forelock':
            col = ramp(vnoise(s.pos, 1.5, 113), (0, '#3A2618'), (1, '#5A3E28'))
        if s.tag == 'horn':
            col = np.where((np.sin(s.pos[:, 1] * 2.4 + s.pos[:, 2] * 1.2) > 0.4)[:, None], rgb('#8A7458'), rgb('#C8B08A'))
        if s.tag == 'ear':
            col = rgb('#EEE6D8') * np.ones((s.n, 1))
        if s.tag == 'tuft':
            col = rgb('#5A4634') * np.ones((s.n, 1))
        col = hooves(col, s, 0.8, '#3A3028')
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#4A3828')
        return fur(col, s, 0.05, 21)
    return sh


# ============================================================================ Amazon

def jaguar(ctx):
    def sh(s):
        base = ramp(fbm(s.pos, 5, 121), (0, '#C68C34'), (1, '#D8A44A'))
        cream = rgb('#EADCC0')
        base = mix(base, cream, smoothstep(0.2, 0.8, down(s)))
        black = rgb('#1C1610')
        head = s.is_part('head', 'ear_l', 'ear_r')
        limb = s.tag in ('leg', 'paw') or s.is_part('tail', 'tail2')
        if head or limb:
            sc = 1.6 if head else 2.2
            d1, _, _ = worley(s.pos, sc, 122, 0.9)
            col = np.where((d1 < 0.3)[:, None], black, base)
            if s.is_part('tail2'):
                rings = np.sin(s.pos @ np.array([0, 0.6, 0.8]) * 1.6) > 0.55
                col = np.where(rings[:, None], black, col)
        else:
            d1, d2, ident = worley(s.pos, 4.2, 123, 0.7)
            ring = (d1 > 0.24) & (d1 < 0.4) & (vnoise(s.pos, 1.4, 124) > 0.3)
            inside = d1 <= 0.24
            col = np.where(inside[:, None], mix(base, rgb('#B0702A'), 0.6), base)
            dots = inside & (worley(s.pos, 1.2, 125, 0.9)[0] < 0.22)
            col = np.where((ring | dots)[:, None], black, col)
            under = s.nrm[:, 1] > 0.5
            col = np.where(under[:, None], np.where((d1 < 0.3)[:, None], black, cream), col)
        if s.tag == 'muzzle':
            col = mix(base, cream, 0.6)
            nose = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'muzzle', 1) < 0.5) & (np.abs(s.x) < 1.0)
            col = np.where(nose[:, None], rgb('#8A5A48'), col)
        if is_(s, 'ear_l', 'ear_r'):
            col = np.where((s.nrm[:, 2] > 0.5)[:, None], black, col)
        col = paint_eye(col, s, ctx, iris='#C8A030', ring='#1C1610')
        return fur(col, s, 0.06, 22)
    return sh


def capybara(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 3, 131), (0, '#7A4C2E'), (0.5, '#8E5E3A'), (1, '#9E6E46'))
        col = mix(col, rgb('#A8865A'), down(s) * 0.5)
        col = mix(col, col * 0.85, up(s) * 0.4)
        strands = grain(s, 132) > 0.55
        col = np.where(strands[:, None], col * 0.82, col)
        if s.is_part('head'):
            col = mix(col, rgb('#5E3C26'), 0.35)
            nose = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'head', 1) < 0.55)
            col = np.where(nose[:, None], rgb('#2E2018'), col)
        col = hooves(col, s, 0.8, '#2A1E16')
        col = paint_eye(col, s, ctx, iris='#1A1210')
        return fur(col, s, 0.05, 23)
    return sh


def tapir(ctx, baby=False):
    def sh(s):
        if baby:
            col = ramp(fbm(s.pos, 3, 141), (0, '#7E4E30'), (1, '#94603C'))
            cream = rgb('#E8DCC4')
            if s.is_part('body'):
                st = np.sin(s.y * 1.25 + vnoise(s.pos, 4, 142) * 2.2) > 0.55
                sp = worley(s.pos, 2.2, 143)[0] < 0.22
                col = np.where((st | sp)[:, None], cream, col)
            elif s.tag == 'leg' or s.is_part('head'):
                sp = worley(s.pos, 1.8, 144)[0] < 0.25
                col = np.where(sp[:, None], cream, col)
        else:
            col = ramp(fbm(s.pos, 4, 141), (0, '#3E3430'), (1, '#54483F'))
        if s.is_part('head') and not baby:
            col = mix(col, rgb('#665A50'), 0.35)
        if s.tag == 'snout':
            col = mix(col, rgb('#4A3E38'), 0.4)
        if s.tag == 'crest':
            col = rgb('#241C18') * np.ones((s.n, 1))
        if s.tag == 'ear':
            col = np.where((ctx.frac(s, 'ear', 1) < 0.3)[:, None], rgb('#E6E0D6'), col)
        col = hooves(col, s, 0.8, '#1E1814')
        col = paint_eye(col, s, ctx, iris='#1A1210')
        return fur(col, s, 0.05, 24)
    return sh


def toucan(ctx):
    def sh(s):
        black = ramp(vnoise(s.pos, 1.5, 151), (0, '#121212'), (1, '#1E1E20'))
        col = black
        if s.is_part('body'):
            front = (s.nrm[:, 2] < -0.3) | (s.nrm[:, 1] < -0.5)
            upper = ctx.frac(s, 'body', 1) < 0.5
            col = np.where((front & upper)[:, None], ramp(ctx.frac(s, 'body', 1) * 2, (0, '#F4EFD8'), (1, '#F2D86A')), col)
        if s.is_part('tail'):
            red = ctx.frac(s, 'tail', 1) < 0.3
            col = np.where((red & (s.nrm[:, 1] > 0.0))[:, None], rgb('#C41E1E'), col)
        if s.is_part('head') and s.tag is None:
            cheek = (np.abs(s.nrm[:, 0]) > 0.5) & (ctx.frac(s, 'head', 1) > 0.45)
            col = np.where(cheek[:, None], rgb('#F2EEDC'), col)
            d = ctx.eye(s)
            col = np.where(((d < 2.0) & (np.abs(s.nrm[:, 0]) > 0.5))[:, None], rgb('#3C7ACC'), col)
            col = np.where(((d < 1.35) & (np.abs(s.nrm[:, 0]) > 0.5))[:, None], rgb('#E8862A'), col)
        if s.tag == 'bill':
            zf = ctx.frac(s, 'bill', 2)
            col = ramp(zf, (0, '#E86A1A'), (0.25, '#F49A24'), (0.85, '#F7A82E'), (1, '#E8601C'))
            tip = (zf < 0.18)
            col = np.where(tip[:, None], rgb('#141210'), col)
            base = zf > 0.92
            col = np.where(base[:, None], rgb('#1A1614'), col)
        if s.tag == 'bill_lower':
            col = ramp(ctx.frac(s, 'bill_lower', 2), (0, '#141210'), (0.2, '#E8781E'), (1, '#E86A1A'))
        if s.tag == 'leg':
            col = rgb('#5A6A8E') * np.ones((s.n, 1))
        col = paint_eye(col, s, ctx, iris='#0E0E10', ring=None)
        return fur(col, s, 0.04, 25)
    return sh


def river_dolphin(ctx):
    def sh(s):
        pink = ramp(fbm(s.pos, 4, 161), (0, '#E09098'), (1, '#EEAAB0'))
        grey = rgb('#8E8288')
        topness = smoothstep(0.2, 0.9, up(s)) * (s.is_part('body', 'tail', 'head') * 1.0)
        col = mix(pink, grey, topness * 0.7)
        if s.tag == 'beak':
            col = mix(pink, grey, 0.3)
        mottle = vnoise(s.pos, 2.5, 162) > 0.68
        col = np.where(mottle[:, None], col * 0.93, col)
        col = paint_eye(col, s, ctx, iris='#1A1214')
        return fur(col, s, 0.03, 26)
    return sh


# ============================================================================ steppe

def yak(ctx):
    def sh(s):
        strands = vnoise(s.pos * np.array([2.5, 0.35, 2.5]), 1.5, 171)
        col = ramp(strands, (0, '#1E1814'), (0.6, '#2E2620'), (1, '#4A3C30'))
        if s.tag == 'skirt':
            col = mix(col, rgb('#3A2E24'), smoothstep(0.6, 1.0, ctx.frac(s, 'skirt', 1)))
        if s.is_part('head') and s.tag not in ('horn', 'forelock'):
            muzzle = (s.nrm[:, 2] < -0.5) | (ctx.frac(s, 'head', 2) < 0.2)
            col = np.where(muzzle[:, None] & (ctx.frac(s, 'head', 1)[:, None] > 0.5), rgb('#A8A098') * (1 + 0.05 * grain(s))[:, None], col)
        if s.tag == 'horn':
            t = np.linalg.norm(s.pos[:, [0]], axis=1)
            col = ramp(smoothstep(4, 9, t), (0, '#CFC8BA'), (0.7, '#B0A898'), (1, '#3A3530'))
        col = hooves(col, s, 1.0, '#141210')
        col = paint_eye(col, s, ctx, iris='#1A1210')
        return fur(col, s, 0.06, 27)
    return sh


def saiga(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 4, 181), (0, '#B8905A'), (1, '#CCA46C'))
        white = rgb('#EEE6D8')
        col = mix(col, white, smoothstep(0.3, 0.9, down(s)))
        if s.is_part('body'):
            col = np.where((ctx.frac(s, 'body', 1) > 0.72)[:, None] & (np.abs(s.nrm[:, 0]) > 0.5)[:, None], white, col)
        if s.tag == 'nose':
            col = mix(col, rgb('#A0805A'), 0.4)
            nostril = (s.nrm[:, 2] < -0.5) & (np.abs(np.abs(s.x) - 0.9) < 0.6) & (ctx.frac(s, 'nose', 1) > 0.4)
            col = np.where(nostril[:, None], rgb('#3A2A1E'), col)
        if s.tag == 'horn':
            col = np.where((np.sin(s.y * 3.2) > 0.2)[:, None], rgb('#C8B484'), rgb('#E2D2A8'))
        col = hooves(col, s, 0.8)
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#8A6A48')
        return fur(col, s, 0.05, 28)
    return sh


def snow_leopard(ctx):
    def sh(s):
        base = ramp(fbm(s.pos, 5, 191), (0, '#BDB6A6'), (1, '#D4CEC0'))
        white = rgb('#EEECE6')
        base = mix(base, white, smoothstep(0.2, 0.8, down(s)))
        dark = rgb('#4A4844')
        head = s.is_part('head', 'ear_l', 'ear_r')
        if head or s.tag in ('leg', 'paw'):
            d1, _, _ = worley(s.pos, 1.5 if head else 2.0, 192, 0.9)
            col = np.where((d1 < 0.28)[:, None], dark, base)
        else:
            d1, d2, _ = worley(s.pos, 4.6, 193, 0.75)
            ring = (d1 > 0.27) & (d1 < 0.42) & (vnoise(s.pos, 1.3, 194) > 0.38)
            col = np.where(ring[:, None], dark, base)
            if s.is_part('tail2'):
                tipd = ctx.frac(s, 'tail2', 1) > 0.75
                col = np.where(tipd[:, None], rgb('#2A2826'), col)
        if s.tag == 'muzzle':
            col = mix(base, white, 0.5)
            nose = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'muzzle', 1) < 0.5) & (np.abs(s.x) < 1.0)
            col = np.where(nose[:, None], rgb('#B08E8A'), col)
        col = paint_eye(col, s, ctx, iris='#A8B494', ring='#3A3836')
        return fur(col, s, 0.06, 29)
    return sh


def marmot(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 3, 201), (0, '#9A7A4C'), (1, '#B4925E'))
        agouti = grain(s, 202) > 0.45
        col = np.where(agouti[:, None], col * 0.78, col)
        col = mix(col, rgb('#C8A070'), down(s) * 0.6)
        if s.is_part('head'):
            cap = (s.nrm[:, 1] < -0.5) | (ctx.frac(s, 'head', 1) < 0.35)
            col = np.where(cap[:, None], rgb('#54402C') * (1 + 0.06 * grain(s, 203))[:, None], col)
            nose = (s.nrm[:, 2] < -0.5) & (ctx.frac(s, 'head', 1) > 0.5) & (np.abs(s.x) < 0.9)
            col = np.where(nose[:, None], rgb('#2A1E16'), col)
        if s.is_part('tail'):
            col = np.where((ctx.frac(s, 'tail', 2) > 0.6)[:, None], rgb('#3A2A1E'), col)
        if is_(s, 'ear_l', 'ear_r'):
            col = rgb('#4A3828') * np.ones((s.n, 1))
        col = paint_eye(col, s, ctx, iris='#0E0A08')
        return fur(col, s, 0.05, 30)
    return sh


def przewalski_horse(ctx):
    neck_axis = np.array([0.0, -0.866, -0.5])

    def sh(s):
        col = ramp(fbm(s.pos, 5, 211), (0, '#AE8854'), (1, '#C29C66'))
        pale = rgb('#E6D6B4')
        col = mix(col, pale, down(s) * 0.65)
        if s.is_part('body') and s.tag != 'tail':
            stripe = (s.nrm[:, 1] < -0.5) & (np.abs(s.x) < 0.8)
            col = np.where(stripe[:, None], rgb('#4A3622'), col)
        if s.tag == 'leg':
            col = mix(col, rgb('#2A2018'), smoothstep(6, 2, s.height))
            bars = (np.sin(s.y * 2.6) > 0.6) & (s.height > 5) & (s.height < 9)
            col = np.where(bars[:, None], col * 0.75, col)
        if s.tag == 'muzzle':
            col = mix(col, pale, 0.75)
        if s.tag == 'mane':
            col = ramp(vnoise(s.pos, 1.2, 212), (0, '#1E1812'), (1, '#3A2C20'))
            col = np.where((s.nrm[:, 2] < -0.5)[:, None], mix(col, rgb('#8A6A44'), 0.4), col)
        if s.tag == 'tail':
            col = ramp(ctx.frac(s, 'tail', 1), (0, '#8A6A44'), (0.25, '#2A2018'), (1, '#1C1612'))
        if s.tag == 'ear':
            col = np.where((ctx.frac(s, 'ear', 1) < 0.4)[:, None], rgb('#2A2018'), col)
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#3A2C20')
        return fur(col, s, 0.05, 31)
    return sh


def bactrian_camel(ctx):
    def sh(s):
        col = ramp(fbm(s.pos, 5, 221), (0, '#866440'), (1, '#9C7A52'))
        shag = vnoise(s.pos * np.array([2.4, 0.4, 2.4]), 1.5, 222)
        col = mix(col, rgb('#A8875E'), down(s) * 0.4)
        if s.tag == 'hump':
            col = mix(col, ramp(shag, (0, '#4A3424'), (1, '#6E5034')), smoothstep(0.0, 0.7, 1 - ctx.frac(s, 'hump', 1)) * 0.9)
        if s.tag == 'neck':
            under = s.nrm[:, 1] > 0.5
            col = np.where(under[:, None], ramp(shag, (0, '#4E3826'), (1, '#6A4E34')), col)
        if s.tag == 'leg':
            upper = (s.height > 14) & (s.pos[:, 2] < 0)
            col = np.where(upper[:, None], ramp(shag, (0, '#4E3826'), (1, '#6A4E34')), col)
            col = hooves(col, s, 1.0, '#3A2E24')
        if s.tag == 'muzzle':
            col = mix(col, rgb('#B89A78'), 0.6)
        if s.tag == 'tail':
            col = np.where((ctx.frac(s, 'tail', 1) > 0.6)[:, None], rgb('#3A2A1E'), col)
        col = paint_eye(col, s, ctx, iris='#1A1210', ring='#4A3424')
        return fur(col, s, 0.06, 32)
    return sh
