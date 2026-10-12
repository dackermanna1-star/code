#!/usr/bin/env python3
"""Checks that every vanilla sound referenced by sounds.json (PLACEHOLDER sounds) exists in the asset index."""
import glob, json, os, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sounds = json.load(open(os.path.join(root, 'src/main/resources/assets/chaosunleashed/sounds.json')))
indexes = sorted(glob.glob(os.path.expanduser('~/.gradle/caches/fabric-loom/assets/indexes/*.json')))
if not indexes:
    sys.exit('No asset index found; run ./gradlew downloadAssets first')
objects = json.load(open(indexes[-1]))['objects']
bad = 0
for event, entry in sounds.items():
    for s in entry['sounds']:
        name = s['name'] if isinstance(s, dict) else s
        ns, path = name.split(':') if ':' in name else ('chaosunleashed', name)
        if ns == 'minecraft' and ('minecraft/sounds/%s.ogg' % path) not in objects:
            print('MISSING', event, name)
            bad += 1
        elif ns == 'chaosunleashed' and not os.path.exists(os.path.join(root, 'src/main/resources/assets/chaosunleashed/sounds', path + '.ogg')):
            print('MISSING', event, name)
            bad += 1
print('ok' if bad == 0 else '%d missing' % bad)
