import json, sys
# usage: sheet.py meta.json glbFile outcfg [filter-prefixes...] [--times 0,0.33,0.66] [--view 34]
import os
S=os.environ.get('ASSET_WORK', os.path.expanduser('~/asset_work'))
args=sys.argv[1:]
meta=json.load(open(args[0])); glb=args[1]; out=args[2]
times=[0,0.33,0.66]; view='34'; char='/scratch/work/characters/m08_lod0.glb'; cols=None; dist=4.4; weapon=None; socket=None; sname='socket_weapon_r'
rest=[]
i=3
while i<len(args):
    a=args[i]
    if a=='--times': times=[float(x) for x in args[i+1].split(',')]; i+=2; continue
    if a=='--view': view=args[i+1]; i+=2; continue
    if a=='--char': char=args[i+1]; i+=2; continue
    if a=='--cols': cols=int(args[i+1]); i+=2; continue
    if a=='--dist': dist=float(args[i+1]); i+=2; continue
    if a=='--weapon': weapon=args[i+1]; i+=2; continue
    if a=='--socket': socket=json.load(open(args[i+1]))['sockets']; i+=2; continue
    if a=='--socketName': sname=args[i+1]; i+=2; continue
    rest.append(a); i+=1
import os
fname=os.path.basename(glb)
names=[k for k,v in meta.items() if v.get('file')==fname and (not rest or any(k.startswith(r) for r in rest))]
tiles=[]
url='/scratch/'+os.path.relpath(glb,S)
for n in names:
    for t in times:
        tiles.append({'char':char,'anim':url,'clip':n,'t':t,'view':view,'label':f'{n} {t}','dist':dist,'target':[0,0.8,0],**({'weapon':weapon} if weapon else {})})
json.dump({'cols':cols or len(times)*2,'tile':[230,300],'tiles':tiles,**({'socket':[x for x in socket if x['name']==sname][0]} if socket else {})},open(out,'w'))
print(len(tiles),'tiles')
