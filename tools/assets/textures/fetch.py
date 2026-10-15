#!/usr/bin/env python3
"""Download source maps for every set in sets.py into RAW (scratch dir, never the repo).

usage: python3 -I tools/assets/textures/fetch.py <raw_dir> [id ...]
Poly Haven: api.polyhaven.com/files/<id> -> dl.polyhaven.org jpg maps (diff, nor_gl, arm, disp).
ambientCG:  ambientcg.com/get?file=<id>_<RES>-JPG.zip (Color, NormalGL, Roughness, AO, Displacement, Metalness, Opacity).
"""
import json, os, subprocess, sys, time, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sets import SETS, VEGETATION, DECALS, HDRIS, SKY_BACKGROUNDS  # noqa: E402

RAW = os.path.abspath(sys.argv[1])
# TextureCan (CC0, https://texturecan.com/terms/) has no API; the 2k zip links are listed on each details page.
TC_URLS = {'wood_0027': 'https://texturecan.com/downloads/wood_0027/wood_0027_2k_fW4TSp.zip'}
ONLY = set(sys.argv[2:])


def curl(url, out, tries=6):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + '.part'
    for a in range(tries):
        r = subprocess.run(['curl', '-sSL', '--fail', '--max-time', '1800', '-C', '-', '-o', tmp, url])
        if r.returncode == 0 and os.path.getsize(tmp) > 0:
            os.replace(tmp, out)
            return out
        print(f'  retry {a + 1} {url} rc={r.returncode}', flush=True)
        time.sleep(3 + 3 * a)
    raise SystemExit(f'download failed: {url}')


def ph_json(kind_id):
    p = os.path.join(RAW, 'api', f'ph_files_{kind_id}.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    curl(f'https://api.polyhaven.com/files/{kind_id}', p)
    return json.load(open(p))


def fetch_ph_texture(pid, res):
    d = ph_json(pid)
    out = os.path.join(RAW, 'ph', pid, res)
    os.makedirs(out, exist_ok=True)
    got = {}
    for key, name in [('Diffuse', 'diff'), ('nor_gl', 'nor_gl'), ('arm', 'arm'), ('Displacement', 'disp')]:
        if key not in d:
            print(f'  {pid}: no {key}')
            continue
        r = res if res in d[key] else sorted(d[key].keys())[-1]
        url = d[key][r]['jpg']['url'] if 'jpg' in d[key][r] else d[key][r]['png']['url']
        ext = url.rsplit('.', 1)[1]
        got[name] = curl(url, os.path.join(out, f'{name}.{ext}'))
    return got


def fetch_acg(aid, res):
    out = os.path.join(RAW, 'acg', aid, res)
    os.makedirs(out, exist_ok=True)
    z = os.path.join(out, f'{aid}_{res}-JPG.zip')
    if not any(f.endswith('.jpg') or f.endswith('.png') for f in os.listdir(out)):
        curl(f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip', z)
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.endswith(('.jpg', '.png')) and '/' not in n and 'NormalDX' not in n and 'Preview' not in n:
                    zf.extract(n, out)
        os.remove(z)
    return sorted(os.listdir(out))


def main():
    for sid, s in list(SETS.items()) + list(VEGETATION.items()) + list(DECALS.items()):
        if ONLY and sid not in ONLY:
            continue
        srcs = [s['src']] + ([s['base']] if 'base' in s else [])
        for src in srcs:
            kind, i = src.split(':', 1)
            big = s.get('size', 1024) > 1024
            print(sid, src, flush=True)
            if kind == 'ph':
                fetch_ph_texture(i, '4k' if big else '2k')
            elif kind == 'acg':
                print('  ', fetch_acg(i, '4K' if big else '2K'))
            elif kind == 'tc':
                out = os.path.join(RAW, 'tc', i)
                if not os.path.isdir(out):
                    z = curl(TC_URLS[i], os.path.join(RAW, 'tc', f'{i}_2k.zip'))
                    with zipfile.ZipFile(z) as zf:
                        for n in zf.namelist():
                            if not n.startswith('__MACOSX') and n.endswith(('.jpg', '.png')) and 'directx' not in n:
                                zf.extract(n, out)
    for name, h in HDRIS.items():
        if ONLY and name not in ONLY:
            continue
        d = ph_json(h['src'])
        for r in h['res']:
            curl(d['hdri'][r]['hdr']['url'], os.path.join(RAW, 'hdri', f"{h['src']}_{r}.hdr"))
            print(name, r, flush=True)
    for name, h in SKY_BACKGROUNDS.items():
        if ONLY and name not in ONLY:
            continue
        d = ph_json(h['src'])
        curl(d['tonemapped']['url'], os.path.join(RAW, 'hdri', f"{h['src']}_tonemapped.jpg"))
        print(name, flush=True)


if __name__ == '__main__':
    main()
