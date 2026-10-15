"""List every ambientCG Material/Atlas/Decal/HDRI (with dimensions + download data). usage: acg_list.py <out.json>"""
import json, subprocess, sys, time, os
out = sys.argv[1]
allassets = []
for typ in ['Material', 'Atlas', 'Decal', 'HDRI']:
    off = 0
    while True:
        url = f"https://ambientcg.com/api/v2/full_json?type={typ}&limit=250&offset={off}&sort=Alphabet&include=downloadData,previewData,dimensionsData,tagData"
        for attempt in range(6):
            r = subprocess.run(['curl', '-sS', '--max-time', '120', url], capture_output=True)
            if r.returncode == 0:
                try:
                    d = json.loads(r.stdout); break
                except Exception as e:
                    print('json err', e)
            time.sleep(2 + attempt * 2)
        else:
            raise SystemExit('fail ' + url)
        fa = d['foundAssets']
        for a in fa:
            a['_type'] = typ
        allassets += fa
        print(typ, off, len(fa), d['numberOfResults'], flush=True)
        off += 250
        if off >= d['numberOfResults'] or not fa:
            break
json.dump(allassets, open(out, 'w'))
print('total', len(allassets))
