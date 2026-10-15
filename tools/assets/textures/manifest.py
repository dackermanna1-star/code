#!/usr/bin/env python3
"""Write public/assets/textures/manifest.json and public/assets/hdri/manifest.json from sets.py + build outputs.

usage: python3 -I tools/assets/textures/manifest.py <raw_src_dir> <ph_textures_api.json> <acg_all_api.json>
"""
import json, os, sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sets import SETS, VEGETATION, DECALS, HDRIS, SKY_BACKGROUNDS  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
TEX = os.path.join(REPO, 'public/assets/textures')
HDR = os.path.join(REPO, 'public/assets/hdri')
RAW = os.path.abspath(sys.argv[1])
PH = json.load(open(sys.argv[2]))
ACG = {a['assetId']: a for a in json.load(open(sys.argv[3]))}
REPORT = json.load(open(os.path.join(RAW, 'build_report.json'))) if os.path.exists(os.path.join(RAW, 'build_report.json')) else {}
CC0 = 'CC0-1.0'


def source_info(src):
    kind, i = src.split(':', 1)
    if kind == 'ph':
        return dict(provider='Poly Haven', id=i, url=f'https://polyhaven.com/a/{i}', license=CC0,
                    authors=list(PH[i].get('authors', {}).keys()))
    if kind == 'acg':
        return dict(provider='ambientCG', id=i, url=f'https://ambientcg.com/a/{i}', license=CC0)
    if kind == 'tc':
        return dict(provider='TextureCan', id=i, url='https://texturecan.com/details/221/', license=CC0,
                    note='TextureCan terms: all textures CC0 1.0 (https://texturecan.com/terms/)')
    if kind == 'gen':
        return dict(provider='generated', id=i, url='tools/assets/textures/generate.py', license=CC0)
    raise ValueError(src)


def tile_size(s):
    """Real-world repeat size in meters: explicit tile_m wins, else Poly Haven dimensions (mm) / ambientCG cm."""
    if 'tile_m' in s:
        t = s['tile_m']
        return (t if isinstance(t, list) else [t, t]), bool(s.get('tile_est'))
    kind, i = s['src'].split(':', 1)
    if kind == 'ph':
        d = PH[i]['dimensions']
        return [round(d[0] / 1000, 2), round(d[1] / 1000, 2)], False
    if kind == 'acg' and ACG[i]['dimensionX']:
        return [ACG[i]['dimensionX'] / 100, ACG[i]['dimensionY'] / 100], False
    return None, True


def files_of(d):
    out = {}
    for f in sorted(os.listdir(d)):
        p = os.path.join(d, f)
        w, h = Image.open(p).size
        out[f.split('.')[0]] = dict(file=f, px=[w, h], bytes=os.path.getsize(p))
    return out


def main():
    sets = []
    for sid, s in SETS.items():
        d = os.path.join(TEX, sid)
        if not os.path.isdir(d):
            print('missing', sid)
            continue
        tile, est = tile_size(s)
        e = dict(id=sid, kind=s['kind'], description=s['desc'], path=f'assets/textures/{sid}/',
                 files=files_of(d), tile_m=tile, tile_estimated=est,
                 source=source_info(s['src']), license=CC0)
        if 'base' in s:
            e['base_source'] = source_info(s['base'])
        r = REPORT.get(sid, {})
        e['stats'] = {k: r[k] for k in ('albedo_mean_srgb', 'rough_mean', 'metal_mean') if k in r}
        if 'rough_remap' in r:
            e['processing'] = f"roughness remapped to {r['rough_remap']}"
        if s.get('adjust'):
            e['processing'] = (e.get('processing', '') + f" albedo adjust {s['adjust']}").strip()
        sets.append(e)
    veg = []
    for sid, s in VEGETATION.items():
        d = os.path.join(TEX, sid)
        if os.path.isdir(d):
            veg.append(dict(id=sid, description=s['desc'], path=f'assets/textures/{sid}/', files=files_of(d),
                            source=source_info(s['src']), license=CC0,
                            usage='alpha-tested cards: map=albedo.jpg, alphaMap=opacity.jpg (alphaTest≈0.5), side=DoubleSide'))
    dec = []
    for sid, s in DECALS.items():
        d = os.path.join(TEX, sid)
        if os.path.isdir(d):
            e = dict(id=sid, description=s['desc'], path=f'assets/textures/{sid}/', files=files_of(d),
                     source=source_info(s['src']), license=CC0,
                     usage='albedo.png RGBA (alpha = coverage); DecalGeometry or projected quad, depthWrite=false, polygonOffset')
            if 'tile_m' in s:
                e['size_m'] = s['tile_m']
            if sid in ('decal_bullet_holes', 'decal_cracks'):
                e['atlas'] = dict(cols=4, rows=4) if sid == 'decal_bullet_holes' else dict(cols=2, rows=2)
            dec.append(e)
    misc = []
    for f in ['blue_noise_64.png', 'blue_noise_64_rgba.png']:
        p = os.path.join(TEX, 'noise', f)
        if os.path.exists(p):
            misc.append(dict(id=f.split('.')[0], file=f'assets/textures/noise/{f}', px=list(Image.open(p).size),
                             description='Void-and-cluster blue noise (tileable). Use NearestFilter, RepeatWrapping, NoColorSpace.' +
                             (' 4 independent channels.' if 'rgba' in f else ''),
                             source=dict(provider='generated', url='tools/assets/textures/generate.py'), license=CC0))
    m = dict(category='textures', version=1,
             conventions=dict(albedo='sRGB', normal='OpenGL tangent space (+Y = +V, green up)',
                              arm='R=AO G=roughness B=metalness (linear)', height='linear 0..1 normalized (terrain sets)',
                              tile_m='real-world meters covered by one UV repeat [u, v]'),
             sets=sets, vegetation=veg, decals=dec, noise=misc)
    json.dump(m, open(os.path.join(TEX, 'manifest.json'), 'w'), indent=1)
    print('textures manifest:', len(sets), 'sets', len(veg), 'veg', len(dec), 'decals', len(misc), 'noise')

    hd = []
    for name, h in HDRIS.items():
        for r in h['res']:
            f = f'{name}_{r}.hdr'
            p = os.path.join(HDR, f)
            if os.path.exists(p):
                tags = PH.get(h['src'], {})
                import hdr_info
                hi = hdr_info.info(p)
                sun = None if hi['peak_luminance'] < 200 else dict(
                    direction=hi['sun_dir_threejs'], elevation_deg=hi['sun_elevation_deg'],
                    note='unit vector toward the sun in three.js world space with an unrotated EquirectangularReflectionMapping; '
                         'put the DirectionalLight at target + dir * distance so shadows match the IBL')
                hd.append(dict(id=f'{name}_{r}', file=f'assets/hdri/{f}', name=name, resolution=r, description=h['desc'],
                               bytes=os.path.getsize(p), px=hi['size'], sun=sun,
                               mean_sky_luminance=hi['mean_sky_luminance'], mean_ground_luminance=hi['mean_ground_luminance'],
                               source=dict(provider='Poly Haven', id=h['src'], url=f"https://polyhaven.com/a/{h['src']}",
                                           license=CC0), license=CC0))
    bgs = []
    for name, h in SKY_BACKGROUNDS.items():
        f = f'{name}_4k.jpg'
        p = os.path.join(HDR, f)
        if os.path.exists(p):
            bgs.append(dict(id=name, file=f'assets/hdri/{f}', px=list(Image.open(p).size), description=h['desc'],
                            colorSpace='sRGB (Poly Haven tonemapped JPG)', mapping='equirectangular',
                            source=dict(provider='Poly Haven', id=h['src'], url=f"https://polyhaven.com/a/{h['src']}",
                                        license=CC0), license=CC0))
    json.dump(dict(category='hdri', version=1, hdris=hd, backgrounds=bgs,
                   usage='HDRLoader -> EquirectangularReflectionMapping -> PMREMGenerator.fromEquirectangular for scene.environment'),
              open(os.path.join(HDR, 'manifest.json'), 'w'), indent=1)
    print('hdri manifest:', len(hd), 'hdris', len(bgs), 'backgrounds')


if __name__ == '__main__':
    main()
