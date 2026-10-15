"""
Download Wikimedia Commons side-view reference photos and trace them into ref/<id>.json silhouettes.
  python3 tools/assets/weapons/refs.py <scratch_dir> [id ...]
Images are NOT kept in the repo (they stay in <scratch_dir>); only the traced mm outlines are.
Each entry: id -> (commons file name, thumb width, trace.py args)
"""
import sys, os, subprocess, hashlib, urllib.parse, io

HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'WeaponRefTracer/0.1 (offline game prototype)'
REFS = {
    'smg_ump45':   ('HKUMP45.JPG', 1280, '--len 690 --flip --thr 215'),
    'ar_scarl':    ('ScarSandiaPix.png', 1280, '--len 889 --crop 0,0,1280,420'),
    'ar_groza':    ('GrozaOC14_noBG.png', 1280, '--len 610 --flip'),
    'ar_beryl':    ('Beryl_M762.png', 2526, '--len 943'),
    'sr_m24':      ('M24-Sniper-Weapon-System.png', 1280, '--len 1092 --crop 0,0,1280,375 --flip'),
    'sr_awm':      ('G22_Bundeswehr_Technik_02_(RaBoe)_noBG.png', 850, '--len 1200'),
    'dmr_mk14':    ('PEO_M14_EBR-rbg.png', 1280, '--len 940'),
    'ar_akm':      ('AKM_automatkarbin_Ryssland_-_7,62x39mm_-_Armémuseum_bothsides_noBG.png', 1280, '--len 880 --crop 0,0,1280,400'),
    'sr_kar98k':   ('Kar_98K_AM021488_noBG.png', 2200, '--len 1110 --crop 0,0,2200,480'),
    'smg_vector':  ('Kriss_Vector_SMG_Realistic.png', 1707, '--len 958 --flip --both --thr 150'),
    'dmr_sks':     ('Simonow_SKS_45_noBG.jpg', 2050, '--len 1020 --crop 0,0,2050,440 --thr 235'),
    'dmr_mini14':  ('Mini14GB_noBG.jpg', 2840, '--len 946 --thr 235'),
    'dmr_slr':     ('SLRL1A1.jpg', 2968, '--len 1143 --flip --thr 200'),
    'ar_m16a4':    ('M16A2_noBG.jpg', 1950, '--len 1003 --crop 0,0,1950,560 --thr 150'),
    'pistol_p18c': ('Glock_17_(6825676904)_без_фона.jpg', 2560, '--len 202 --flip --thr 230'),
    'sg_s12k':     ('Сайга_12К_исп.030.jpg', 1280, '--len 1000 --thr 235'),
    'pistol_r1895': ('Nagant_Revolver.jpg', 2090, '--len 235 --flip --thr 235'),
    'ar_aug':      ('Steyr-AUG-A3-SF.webp', 650, '--len 790 --flip --thr 235'),
    'smg_uzi':     ('Uzimicro.jpg', 1280, '--len 270 --thr 235'),
    'smg_tommy':   ('ThompsonM1A1VWM.jpg', 1146, '--len 813 --thr 170'),
    'smg_mp5k':    ('Hkmp5k.jpg', 480, '--len 325 --flip --thr 235'),
    'lmg_m249':    ('M249_Automatic_Rifle.jpg', 1280, '--len 1041 --thr 235'),
    'sr_win94':    ('Winchester-94-32spl_noBG.png', 1280, '--len 965'),
    'sg_s1897':    ('WncsterCatMod97trench.jpg', 1280, '--len 1000 --thr 200 --crop 0,0,1280,260'),
    'ar_m416':     ('HK416N.png', 2143, '--len 900'),
    'lmg_dp28':    ('Chinese_Type_53.jpg', 1280, '--len 1270 --thr 60'),
}


def fetch(fn, width, out):
    from PIL import Image
    if os.path.exists(out):
        return out
    md = hashlib.md5(fn.encode()).hexdigest(); q = urllib.parse.quote(fn)
    urls = [f'https://upload.wikimedia.org/wikipedia/commons/thumb/{md[0]}/{md[:2]}/{q}/{w}px-{q}' + ('.png' if fn.endswith('.webp') else '')
            for w in (width, 1280)] + [f'https://upload.wikimedia.org/wikipedia/commons/{md[0]}/{md[:2]}/{q}']
    for u in urls:
        d = subprocess.run(['curl', '-sS', '-L', '-A', UA, u], capture_output=True).stdout
        try:
            im = Image.open(io.BytesIO(d)); im.load(); im.save(out); return out
        except Exception:
            continue
    raise RuntimeError('download failed ' + fn)


if __name__ == '__main__':
    scratch = sys.argv[1]; ids = sys.argv[2:] or list(REFS)
    os.makedirs(scratch, exist_ok=True)
    for gid in ids:
        fn, w, args = REFS[gid]
        ext = '.png' if fn.lower().endswith(('.png', '.webp')) else '.jpg'
        img = fetch(fn, w, os.path.join(scratch, gid + ext))
        cmd = [sys.executable, os.path.join(HERE, 'trace.py'), img, os.path.join(HERE, 'ref', gid + '.json')] + args.split() + \
              ['--grid', os.path.join(scratch, 'grid_' + gid + '.png')]
        r = subprocess.run(cmd, capture_output=True, text=True)
        print(gid, r.stdout.strip(), r.stderr.strip()[-300:])
