"""Per-frame compositor (numpy / OpenCV / OpenColorIO).

plate shots : plate (homography re-projected to the frame camera, variants blended)
              x shadow-catcher multiplier, character pass alpha-over, low-res breath pass,
              depth fog from mist, bloom, AgX display transform (Blender's own OCIO config),
              cold grade, vignette, grain, lens frost.
thermal     : low-res emission render -> upscaled, sensor noise, thermal UI.
Output: 1080x1920 PNG frames (overlays/captions are applied later by overlays.py).
"""
import os, sys, json, math, glob
import numpy as np, cv2, OpenEXR
import PyOpenColorIO as OCIO

W, H = 1080, 1920
OCIO_CFG = "/opt/blender_dl/blender-4.5.15-linux-x64/4.5/datafiles/colormanagement/config.ocio"
_cfg = OCIO.Config.CreateFromFile(OCIO_CFG)
_dvt = OCIO.DisplayViewTransform(src="Linear Rec.709", display="sRGB", view="AgX")
_grp = OCIO.GroupTransform()
_lk = OCIO.LookTransform(src="Linear Rec.709", dst="Linear Rec.709", looks="AgX - Medium High Contrast")
_proc = _cfg.getProcessor(_dvt).getDefaultCPUProcessor()
try:
    _proc_look = _cfg.getProcessor(OCIO.DisplayViewTransform(src="Linear Rec.709", display="sRGB", view="AgX",
                                                             looksBypass=False)).getDefaultCPUProcessor()
except Exception:
    _proc_look = _proc
LENS_FROST = cv2.imread("/opt/assets/gen/lens_frost.png", cv2.IMREAD_UNCHANGED)
LENS_FROST = cv2.cvtColor(LENS_FROST, cv2.COLOR_BGRA2RGBA).astype(np.float32) / 255.0
RNG = np.random.default_rng(1)
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_VIG = np.clip(np.sqrt(((_xx - W / 2) / (W / 2)) ** 2 * 0.9 + ((_yy - H / 2) / (H / 2)) ** 2 * 0.6) - 0.45, 0, 1) ** 1.6
_TVIG = 1 - 0.35 * np.clip(np.sqrt(((_xx - W / 2) / (W / 2)) ** 2 + ((_yy - H / 2) / (H / 2)) ** 2 * 0.7) - 0.5, 0, 1)
del _yy, _xx


def read_exr(path):
    f = OpenEXR.File(path)
    ch = f.parts[0].channels
    out = {}
    for k, v in ch.items():
        out[k.split(".", 1)[1]] = np.asarray(v.pixels, dtype=np.float32)
    return out


def to_display(lin):
    img = np.ascontiguousarray(np.clip(lin, 0, 1e4).astype(np.float32))
    _proc_look.applyRGB(img)
    return np.clip(img, 0, 1)


def cam_K(lens, w, h):
    f = lens / 24.0 * h
    return np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1.0]])


def quat_to_R(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def homography(plate, frame_cam):
    """Map plate pixels -> frame pixels (same camera centre, different rotation/focal length)."""
    Kp = cam_K(plate["lens"], plate["w"], plate["h"]); Kf = cam_K(frame_cam["lens"], W, H)
    Rp = quat_to_R(plate["q"]); Rf = quat_to_R(frame_cam["q"])
    # camera space (Blender): x right, y up, -z forward ; pixel: u right, v down
    flip = np.diag([1, -1, -1])
    Hm = Kf @ flip @ Rf.T @ Rp @ flip @ np.linalg.inv(Kp)
    return Hm / Hm[2, 2]


def gaussian(img, sigma):
    k = int(sigma * 3) * 2 + 1
    return cv2.GaussianBlur(img, (k, k), sigma)


class Shot:
    def __init__(self, sid, rdir, meta):
        self.sid, self.rdir, self.meta = sid, rdir, meta
        self.cam = {int(k): v for k, v in json.load(open(f"{rdir}/{sid}_cam.json")).items()}
        self.mode = meta["mode"]
        self.plates = []
        if self.mode != "thermal" and os.path.exists(f"{rdir}/{sid}_plate.json"):
            self.pmeta = json.load(open(f"{rdir}/{sid}_plate.json"))
            for vi in range(len(self.pmeta["variants"])):
                d = read_exr(f"{rdir}/{sid}_plate{vi}.exr")
                self.plates.append((d["Combined"][..., :3].copy(), d["Mist.Z"].copy()))

    def variant_weights(self, f):
        vs = self.pmeta["variants"]
        if len(vs) == 1: return [1.0]
        c = self.cam[f]
        if "door" in vs[0]:
            a0, a1 = vs[0]["door"], vs[1]["door"]
            t = np.clip((c.get("door", a0) - a0) / (a1 - a0 + 1e-6), 0, 1)
            t = t ** 0.6  # light floods in early as the gap opens
            return [1 - t, t]
        if "frost" in vs[0]:
            fr = c.get("frost", vs[0]["frost"]); xs = [v["frost"] for v in vs]
            w = [0.0] * len(vs)
            if fr <= xs[0]: w[0] = 1
            elif fr >= xs[-1]: w[-1] = 1
            else:
                for i in range(len(xs) - 1):
                    if xs[i] <= fr <= xs[i + 1]:
                        t = (fr - xs[i]) / (xs[i + 1] - xs[i]); w[i] = 1 - t; w[i + 1] = t
            return w
        return [1.0] + [0.0] * (len(vs) - 1)


def comp_plate(shot, f, grade):
    c = shot.cam[f]
    Hm = homography(shot.pmeta, c)
    wts = shot.variant_weights(f)
    rgb = np.zeros((H, W, 3), np.float32); mist = np.zeros((H, W), np.float32)
    for (p_rgb, p_mist), w in zip(shot.plates, wts):
        if w <= 1e-4: continue
        rgb += w * cv2.warpPerspective(p_rgb, Hm, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        mist += w * cv2.warpPerspective(p_mist, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    cp = f"{shot.rdir}/{shot.sid}_char_{f:04d}.exr"
    if os.path.exists(cp):
        d = read_exr(cp)
        ch = cv2.resize(d["Combined"], (W, H), interpolation=cv2.INTER_LANCZOS4)
        a = np.clip(ch[..., 3:4], 0, 1)
        scp = d.get("Shadow Catcher")
        if scp is not None:
            # The char pass is a border render without crop: outside the border rectangle every pass is 0, but the
            # shadow catcher is a multiplier whose neutral value is 1. Make it 1 there in the low-res buffer
            # *before* resampling (filling after the resize misses the 1-2 px row/column that the bilinear filter
            # blends from 0 and ~1, which darkened the plate along the border: line / rectangle outline), and ease
            # it to 1 over the last few px inside interior border edges so a catcher shadow clipped by the border
            # fades out instead of ending in a hard step. The rectangle comes from lossless channels (Mist.Z
            # float32, alpha), which are exactly 0 outside the border.
            hb, wb = scp.shape[:2]
            inside = (d["Mist.Z"] > 0) | (d["Combined"][..., 3] > 0)
            rows = np.flatnonzero(inside.any(1)); cols = np.flatnonzero(inside.any(0))
            if len(rows) == 0:
                scp = np.ones((H, W, 3), np.float32)
            else:
                r0, r1, c0, c1 = rows[0], rows[-1], cols[0], cols[-1]
                yy = np.arange(hb, dtype=np.float32)[:, None]; xx = np.arange(wb, dtype=np.float32)[None, :]
                dist = np.full((hb, wb), 1e6, np.float32)        # px to the nearest border edge inside the frame
                if r0 > 0: dist = np.minimum(dist, yy - r0 + 0.5)
                if r1 < hb - 1: dist = np.minimum(dist, r1 - yy + 0.5)
                if c0 > 0: dist = np.minimum(dist, xx - c0 + 0.5)
                if c1 < wb - 1: dist = np.minimum(dist, c1 - xx + 0.5)
                ramp = np.clip(dist / 20.0, 0, 1); ramp = ramp * ramp * (3 - 2 * ramp)   # 0 outside -> 1 at 20 px in
                scp = 1.0 - (1.0 - np.clip(scp, 0.0, 1.0)) * ramp[..., None]
                scp = cv2.resize(scp, (W, H), interpolation=cv2.INTER_LINEAR)
            scp = np.clip(scp, 0.0, 1.0)
            rgb = rgb * scp
        cm = cv2.resize(d["Mist.Z"], (W, H), interpolation=cv2.INTER_LINEAR)
        rgb = rgb * (1 - a) + np.clip(ch[..., :3], 0, None)
        mist = mist * (1 - a[..., 0]) + cm * a[..., 0]
    bp = f"{shot.rdir}/{shot.sid}_breath_{f:04d}.exr"
    if os.path.exists(bp):
        d = read_exr(bp)
        b = cv2.resize(d["Combined"], (W, H), interpolation=cv2.INTER_CUBIC)
        b = gaussian(b, 2.0)
        a0 = np.clip(b[..., 3:4], 0, 1)
        cap = grade.get("breath_cap", 0.42); gain = grade.get("breath_gain", 1.0)
        ba = cap * (1 - np.exp(-a0 * gain / cap))           # soft-limited opacity: wisps, never a veil
        k = np.where(a0 > 1e-4, ba / np.maximum(a0, 1e-4), 0)
        rgb = rgb * (1 - ba) + np.clip(b[..., :3], 0, None) * k
    return rgb, mist


def finish(rgb_lin, mist, grade, f):
    # depth haze (cold air), stronger with distance
    fog_amt = grade.get("fog", 0.35)
    fcol = np.array(grade.get("fog_col", (0.42, 0.55, 0.72)), np.float32) * grade.get("fog_lum", 0.55)
    t = np.clip((mist - 0.04) / 0.45, 0, 1) ** 0.9 * fog_amt
    rgb = rgb_lin * (1 - t[..., None]) + fcol * t[..., None]
    rgb *= grade.get("exposure", 1.0)
    # bloom
    br = np.clip(rgb - grade.get("bloom_thr", 1.2), 0, 8)
    small = cv2.resize(br, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    bl = cv2.resize(gaussian(small, 6) * 0.6 + gaussian(small, 18) * 0.6, (W, H), interpolation=cv2.INTER_LINEAR)
    rgb = rgb + bl * grade.get("bloom", 0.35) * np.array([0.85, 0.95, 1.1], np.float32)
    disp = to_display(rgb)
    return grade_display(disp, grade, f)


def grade_display(disp, grade, f):
    # cold split tone
    lum = disp @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    sh = np.clip(1 - lum * 2.2, 0, 1)[..., None]; hi = np.clip(lum * 1.6 - 0.6, 0, 1)[..., None]
    warm = grade.get("warm", 0.0)
    sh_col = np.array([-0.012, 0.006, 0.03], np.float32) * (1 - warm) + np.array([0.02, 0.005, -0.015], np.float32) * warm
    hi_col = np.array([-0.015, 0.0, 0.02], np.float32) * (1 - warm) + np.array([0.03, 0.012, -0.02], np.float32) * warm
    disp = disp + sh * sh_col * grade.get("tone", 1.0) * 2 + hi * hi_col * grade.get("tone", 1.0)
    sat = grade.get("sat", 0.9)
    lum = (disp @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    disp = lum + (disp - lum) * sat
    # gentle S-curve
    disp = np.clip(disp, 0, 1)
    disp = disp + grade.get("contrast", 0.06) * np.sin((disp - 0.5) * math.pi) / math.pi * 2 * 0.5
    # vignette
    disp *= (1 - grade.get("vignette", 0.28) * _VIG)[..., None]
    # lens frost (late in the story)
    lf = grade.get("lens_frost", 0.0)
    if lf > 0:
        a = LENS_FROST[..., 3:4] * np.clip(lf, 0, 1.2)
        a = np.clip(a * (1.0 + 0.6 * lf), 0, 0.92)
        blur = cv2.GaussianBlur(disp, (0, 0), 6)
        disp = disp * (1 - a) + (blur * 0.5 + LENS_FROST[..., :3] * 0.6) * a
    # drifting ice-crystal motes in the frozen air (deterministic per frame -> temporally coherent)
    mo = grade.get("motes", 1.0)
    if mo > 0:
        prng = np.random.default_rng(11)
        n = 140
        x0 = prng.uniform(0, W, n); y0 = prng.uniform(0, H, n)
        vx = prng.uniform(-14, 6, n); vy = prng.uniform(4, 22, n)       # px per second (slow fall + fan drift)
        sz = prng.uniform(0.8, 2.6, n); br = prng.uniform(0.25, 0.85, n); ph = prng.uniform(0, 6.28, n)
        t = f / 30.0
        xs = (x0 + vx * t + 18 * np.sin(t * 0.7 + ph)) % W; ys = (y0 + vy * t) % H
        lay = np.zeros((H, W), np.float32)
        tw = br * (0.55 + 0.45 * np.sin(t * 5.0 + ph * 3))
        for x, y, r, b in zip(xs, ys, sz, tw):
            cv2.circle(lay, (int(x), int(y)), max(1, int(r)), float(b), -1, lineType=cv2.LINE_AA)
        lay = cv2.GaussianBlur(lay, (0, 0), 1.2) * mo
        disp = disp + lay[..., None] * np.array([0.85, 0.92, 1.0], np.float32) * (1 - disp)
    # film grain
    g = grade.get("grain", 0.018)
    rng = np.random.default_rng(f)
    n = rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32)
    n = cv2.resize(n, (W, H), interpolation=cv2.INTER_LINEAR)
    disp = disp + n[..., None] * g * (0.6 + 0.4 * (1 - disp))
    return np.clip(disp, 0, 1)


def comp_thermal(shot, f, grade):
    p = f"{shot.rdir}/{shot.sid}_thermal_{f:04d}.png"
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    im = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 65535.0
    im = cv2.resize(im, (W, H), interpolation=cv2.INTER_CUBIC)
    im = gaussian(im, 2.2)
    rng = np.random.default_rng(f + 77)
    n = cv2.resize(rng.normal(0, 1, (H // 3, W // 3)).astype(np.float32), (W, H))
    im = im + n[..., None] * 0.025
    # faint scanlines / fixed-pattern
    im *= (0.97 + 0.03 * np.sin(np.arange(H) * 1.3))[:, None, None]
    im *= _TVIG[..., None]
    return np.clip(im, 0, 1)


def run(sid, rdir, outdir, shots_meta, grade, frames=None):
    os.makedirs(outdir, exist_ok=True)
    meta = shots_meta[sid]
    shot = Shot(sid, rdir, meta)
    fr = frames or list(range(meta["f0"], meta["f1"] + 1))
    for f in fr:
        out = f"{outdir}/{f:05d}.jpg"  # intermediate: JPEG q95 keeps disk use in budget
        g = dict(grade); g.update(shot.cam[f].get("grade", {}))
        if shot.mode == "thermal":
            img = comp_thermal(shot, f, g)
        else:
            rgb, mist = comp_plate(shot, f, g)
            img = finish(rgb, mist, g, f)
        cv2.imwrite(out, cv2.cvtColor((img * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
    return fr


if __name__ == "__main__":
    sid, rdir, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    shots_meta = json.load(open(sys.argv[4]))
    grade = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
    frames = [int(x) for x in sys.argv[6].split(",")] if len(sys.argv) > 6 else None
    run(sid, rdir, outdir, shots_meta, grade, frames)
