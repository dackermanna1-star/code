#!/usr/bin/env python3
"""Build public/assets/textures/<set>/{albedo,normal,arm[,height]}.jpg from downloaded sources.

usage: python3 -I tools/assets/textures/build.py <raw_src_dir> <out_textures_dir> [id ...]
  albedo.jpg  sRGB, 4:2:0
  normal.jpg  OpenGL (+Y = +V), 4:4:4, box-downsampled + renormalized
  arm.jpg     R=AO G=roughness B=metalness, 4:4:4 (built from separate maps when the source has none)
  height.jpg  terrain sets only, 1024 px, normalized to the 0.5..99.5 percentile range
Resizing wrap-pads the source so every output stays seamless (checked and reported).
"""
import glob, json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sets import SETS, VEGETATION, DECALS  # noqa: E402
import texlib as T  # noqa: E402

RAW = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
ONLY = set(sys.argv[3:])

Q_ALBEDO, Q_NORMAL, Q_ARM, Q_HEIGHT = 86, 86, 85, 88
NORMAL_SS = 0  # 1024 sets: full-res chroma for normals


def acg_maps(aid, res):
    d = os.path.join(RAW, 'acg', aid, res)
    if not os.path.isdir(d):
        d = os.path.join(RAW, 'acg', aid, '2K' if res == '4K' else '4K')
    m = {}
    for f in glob.glob(os.path.join(d, f'{aid}_*-JPG_*.*')):
        key = f.rsplit('_', 1)[1].split('.')[0]
        m[key] = f
    return m


def source_maps(src, size):
    """Return dict with arrays: albedo(rgb), normal(rgb enc), ao, rough, metal, height (any may be None)."""
    kind, i = src.split(':', 1)
    out = dict(albedo=None, normal=None, ao=None, rough=None, metal=None, height=None, opacity=None)
    if kind == 'ph':
        res = '4k' if size > 1024 else '2k'
        d = os.path.join(RAW, 'ph', i, res)
        f = lambda n: (glob.glob(os.path.join(d, n + '.*')) or [None])[0]
        out['albedo'] = T.load(f('diff'))[..., :3]
        out['normal'] = T.load(f('nor_gl'))[..., :3]
        arm = T.load(f('arm'))
        out['ao'], out['rough'], out['metal'] = arm[..., 0:1], arm[..., 1:2], arm[..., 2:3]
        if f('disp'):
            out['height'] = T.load_gray(f('disp'))
    elif kind == 'acg':
        m = acg_maps(i, '4K' if size > 1024 else '2K')
        out['albedo'] = T.load(m['Color'])[..., :3]
        out['normal'] = T.load(m['NormalGL'])[..., :3]
        if 'Roughness' in m:
            out['rough'] = T.load_gray(m['Roughness'])
        if 'AmbientOcclusion' in m:
            out['ao'] = T.load_gray(m['AmbientOcclusion'])
        if 'Metalness' in m:
            out['metal'] = T.load_gray(m['Metalness'])
        if 'Displacement' in m:
            out['height'] = T.load_gray(m['Displacement'])
        if 'Opacity' in m:
            out['opacity'] = T.load_gray(m['Opacity'])
    elif kind == 'tc':
        d = os.path.join(RAW, 'tc', i)
        g = lambda n: (glob.glob(os.path.join(d, f'{i}_{n}_*')) or [None])[0]
        out['albedo'] = T.load(g('color'))[..., :3]
        out['normal'] = T.load(g('normal_opengl'))[..., :3]
        out['rough'] = T.load_gray(g('roughness'))
        if g('ao'):
            out['ao'] = T.load_gray(g('ao'))
        if g('height'):
            out['height'] = T.load_gray(g('height'))
    else:
        raise ValueError(src)
    return out


def finish_maps(m, size, out_dir, height=False, adjust=None, rough_range=None):
    os.makedirs(out_dir, exist_ok=True)
    report = {}
    alb = T.resize(m['albedo'], size, Image.LANCZOS)
    if adjust:
        alb = T.rgb_to_hsv_adjust(alb, **adjust)
    big = size > 1024
    # 1024 sets are small, so spend a little more on quality (normal-map JPEG blocking shows in highlights)
    T.save_jpg(alb, os.path.join(out_dir, 'albedo.jpg'), Q_ALBEDO if big else 88, 2)
    nrm = T.resize_normal(m['normal'], size)
    # 2048 terrain normals: 4:2:0 keeps the file ~half size; the x/y detail survives in luma (see README)
    T.save_jpg(nrm, os.path.join(out_dir, 'normal.jpg'), Q_NORMAL if big else 90, 2 if big else NORMAL_SS)
    # AO/roughness/metal are low-frequency enough to stay at 1024 even for 2048 terrain sets
    size = min(size, 1024)
    shape = (size, size, 1)
    ao = T.resize(m['ao'], size, Image.LANCZOS) if m['ao'] is not None else None
    if ao is None and m['height'] is not None:
        ao = T.cavity_ao(T.resize(m['height'], size, Image.LANCZOS), 0.8)
        report['ao'] = 'cavity-from-height'
    if ao is None:
        ao = np.ones(shape, np.float32)
    rough = T.resize(m['rough'], size, Image.LANCZOS) if m['rough'] is not None else np.full(shape, 0.8, np.float32)
    metal = T.resize(m['metal'], size, Image.BOX) if m['metal'] is not None else np.zeros(shape, np.float32)
    if rough_range:
        # remap the source's 1..99 percentile roughness into a physically plausible range for this surface
        lo, hi = np.percentile(rough, [1, 99])
        t = np.clip((rough - lo) / max(hi - lo, 1e-4), 0, 1)
        rough = rough_range[0] + t * (rough_range[1] - rough_range[0])
        report['rough_remap'] = rough_range
    arm = np.concatenate([ao, rough, metal], -1)
    T.save_jpg(arm, os.path.join(out_dir, 'arm.jpg'), Q_ARM, 0)
    if height and m['height'] is not None:
        hs = 1024 if isinstance(size, int) else (1024, int(1024 * size[1] / size[0]))
        h = T.resize(m['height'], hs, Image.LANCZOS)
        lo, hi = np.percentile(h, [0.5, 99.5])
        h = np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1)
        T.save_jpg(h, os.path.join(out_dir, 'height.jpg'), Q_HEIGHT)
        report['height'] = True
    report['seam_albedo'] = round(T.edge_seam_error(alb), 2)
    report['seam_arm'] = round(T.edge_seam_error(arm), 2)
    report['seam_normal'] = round(T.edge_seam_error(nrm), 2)
    report['albedo_mean_srgb'] = [round(float(x), 3) for x in alb.reshape(-1, 3).mean(0)]
    report['rough_mean'] = round(float(rough.mean()), 3)
    report['metal_mean'] = round(float(metal.mean()), 3)
    return report


def crop_tile_u(m, a, b, blend):
    """Keep source columns [a,b) (fractions) and make them tile along U by cross-fading the strip's end into its start.
    Used for patch-like scans (e.g. furrows with a headland border) whose interior repeats along U."""
    out = {}
    for k, v in m.items():
        if v is None:
            out[k] = None
            continue
        W = v.shape[1]
        S = v[:, int(a * W):int(b * W)]
        w = S.shape[1]
        bw = int(blend * w)
        t = (np.arange(bw, dtype=np.float32) / bw)[None, :, None]
        head = S[:, :bw] * t + S[:, w - bw:] * (1 - t)
        out[k] = np.concatenate([head, S[:, bw:w - bw]], 1)
    return out


def build_set(sid, s):
    size = s['size']
    out_dir = os.path.join(OUT, sid)
    if s['src'].startswith('gen:'):
        import generate
        base = source_maps(s['base'], size)
        m = getattr(generate, 'make_' + s['src'][4:])(base, size)
    else:
        m = source_maps(s['src'], size)
    if s.get('crop_u'):
        m = crop_tile_u(m, *s['crop_u'])
    return finish_maps(m, size, out_dir, height=s.get('height', False), adjust=s.get('adjust'), rough_range=s.get('rough'))


def dilate_color(rgb, alpha, iters=24):
    """Push opaque colors into transparent texels so mips/bilinear don't bleed black around cut-outs."""
    a = (alpha[..., 0] > 0.5).astype(np.float32)
    col = rgb * a[..., None]
    w = a.copy()
    filled = a > 0
    for _ in range(iters):
        acc = np.zeros_like(col); wa = np.zeros_like(w)
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
            acc += np.roll(col, (dy, dx), (0, 1)); wa += np.roll(w, (dy, dx), (0, 1))
        newm = (~filled) & (wa > 0)
        col[newm] = acc[newm] / wa[newm][:, None]
        w[newm] = 1.0
        filled = filled | newm
        if filled.all():
            break
    if not filled.all():
        mean = (rgb * a[..., None]).sum((0, 1)) / max(a.sum(), 1)
        col[~filled] = mean
    return col


def build_cutout(sid, s, as_png_alpha=False):
    """Vegetation atlases / decals: albedo + opacity (+normal, arm). Decals get one RGBA albedo.png."""
    import generate
    size = s['size']
    out_dir = os.path.join(OUT, sid)
    os.makedirs(out_dir, exist_ok=True)
    if s['src'].startswith('gen:'):
        m = getattr(generate, 'make_' + s['src'][4:])(None, size)
    else:
        m = source_maps(s['src'], 2048)
    if s.get('post') == 'tire_tracks':
        m = generate.make_tire_tracks_from(m)
    if s.get('post') == 'conifer':
        m['albedo'] = generate.recolor_conifer(m['albedo'], m['opacity'])
    wrap = s.get('wrap', False)
    H, W = m['albedo'].shape[:2]
    tsize = size if H == W else (size, int(round(size * H / W)))
    alb = T.resize(m['albedo'], tsize, Image.LANCZOS, wrap=wrap)
    op = T.resize(m['opacity'], tsize, Image.LANCZOS, wrap=wrap) if m.get('opacity') is not None else None
    if op is not None:
        op = np.clip(op, 0, 1)
        if not as_png_alpha:
            alb = dilate_color(np.clip(alb, 0, 1), op)
    nrm = T.resize_normal(m['normal'], tsize)
    shape = alb.shape[:2] + (1,)
    rs = lambda k, d, f=Image.LANCZOS: T.resize(m[k], tsize, f, wrap=wrap) if m.get(k) is not None else np.full(shape, d, np.float32)
    ao, rough, metal = rs('ao', 1.0), rs('rough', 0.7), rs('metal', 0.0, Image.BOX)
    if as_png_alpha:
        a = op if op is not None else np.ones(shape, np.float32)
        T.save_png(np.concatenate([alb, a], -1), os.path.join(out_dir, 'albedo.png'))
    else:
        T.save_jpg(alb, os.path.join(out_dir, 'albedo.jpg'), 90, 2)
        if op is not None:
            T.save_jpg(op, os.path.join(out_dir, 'opacity.jpg'), 92)
    T.save_jpg(nrm, os.path.join(out_dir, 'normal.jpg'), Q_NORMAL, 0)
    T.save_jpg(np.concatenate([ao, rough, metal], -1), os.path.join(out_dir, 'arm.jpg'), Q_ARM, 0)
    if s.get('height') and m.get('height') is not None:
        h = T.resize(m['height'], tsize, Image.LANCZOS, wrap=wrap)
        lo, hi = np.percentile(h, [0.5, 99.5])
        T.save_jpg(np.clip((h - lo) / max(hi - lo, 1e-4), 0, 1), os.path.join(out_dir, 'height.jpg'), Q_HEIGHT)
    return dict(size=[alb.shape[1], alb.shape[0]], has_opacity=op is not None,
                coverage=round(float(op.mean()), 3) if op is not None else 1.0)


def main():
    reports = {}
    rp = os.path.join(RAW, 'build_report.json')
    if os.path.exists(rp):
        reports = json.load(open(rp))
    for sid, s in SETS.items():
        if ONLY and sid not in ONLY:
            continue
        print('build', sid, s['src'], flush=True)
        reports[sid] = build_set(sid, s)
        print('  ', reports[sid], flush=True)
    for sid, s in VEGETATION.items():
        if ONLY and sid not in ONLY:
            continue
        print('build', sid, flush=True)
        reports[sid] = build_cutout(sid, s)
        print('  ', reports[sid], flush=True)
    for sid, s in DECALS.items():
        if ONLY and sid not in ONLY:
            continue
        print('build', sid, flush=True)
        reports[sid] = build_cutout(sid, s, as_png_alpha=True)
        print('  ', reports[sid], flush=True)
    json.dump(reports, open(rp, 'w'), indent=1)


if __name__ == '__main__':
    main()
