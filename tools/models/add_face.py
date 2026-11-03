"""Add the face rig's data (per-vertex face channels and the jaw joint) to converted avatars
without touching anything else: each avatar's FBX is converted again (tools/models/rocketbox.mjs)
into a scratch file, and its `face` attribute and `jaw` joint are copied into the existing
src/character/models/<id>/mesh.json when the vertex counts match.

Usage: python3 -I tools/models/add_face.py <Microsoft-Rocketbox clone> <scratch dir> [id ...]
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
MODELS = os.path.join(ROOT, 'src', 'character', 'models')
HERE = os.path.join(ROOT, 'tools', 'models')
# Scarlet's own model and the enemies' avatars (avatars.json)
SOURCES = {'scarlet': 'Adults/Female_Adult_07'}
SOURCES.update({k: v['src'] for k, v in json.load(open(os.path.join(HERE, 'avatars.json')))['avatars'].items()})


def main(clone, scratch, only):
    os.makedirs(scratch, exist_ok=True)
    for aid, src in SOURCES.items():
        if only and aid not in only:
            continue
        target = os.path.join(MODELS, aid, 'mesh.json')
        if not os.path.exists(target):
            continue
        name = os.path.basename(src)
        fbx = os.path.join(clone, 'Assets', 'Avatars', src, 'Export', name + '.fbx')
        if not os.path.exists(fbx):
            subprocess.run(['git', '-c', 'advice.detachedHead=false', 'checkout', 'HEAD', '--', os.path.relpath(fbx, clone)], cwd=clone, check=True, capture_output=True)
        out = os.path.join(scratch, aid + '.json')
        r = subprocess.run(['node', os.path.join(HERE, 'rocketbox.mjs'), fbx, out], cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            print(aid, 'FAILED', r.stderr[-400:])
            continue
        new = json.load(open(out))
        cur = json.load(open(target))
        if new['count'] != cur['count'] or new['pos'] != cur['pos']:
            print(aid, 'SKIPPED: the mesh converts differently now', new['count'], cur['count'])
            continue
        cur['face'] = new['face']
        cur['joints']['jaw'] = new['joints']['jaw']
        json.dump(cur, open(target, 'w'), separators=(',', ':'))
        print(aid, 'face added', cur['count'], 'vertices')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], set(sys.argv[3:]))
