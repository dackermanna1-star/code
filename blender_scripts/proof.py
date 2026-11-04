import bpy, sys, os, json
sys.path.insert(0,'/opt/work/scripts')
import board; board.register()
s=bpy.context.scene
g=s['group']; cams=json.load(open(f'/opt/work/groups/{g}.json'))['cams']
s.render.resolution_percentage=25; s.eevee.taa_render_samples=2
os.makedirs('/opt/work/proof',exist_ok=True)
for n,a,b in cams:
    for f in (a+4,(a+b)//2,b-3):
        s.frame_set(f); s.render.filepath=f'/opt/work/proof/{f:05d}_{n}.png'; bpy.ops.render.render(write_still=True)
