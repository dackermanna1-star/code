import bpy, sys, time
sys.path.insert(0,'/opt/work/scripts')
import rset
from mathutils import Vector
s=bpy.context.scene
rset.eevee(s, samples=4, pct=50)
for o in bpy.data.objects:
    if o.name.startswith('CeilArea'): o.data.use_shadow=False
cam=bpy.data.cameras.new('c'); co=bpy.data.objects.new('PrevCam',cam); s.collection.objects.link(co); s.camera=co
views=[((0.3,-3.5,1.3),(0,3,1.2),26),((-2.5,-1,1.4),(1.5,8,2.4),20),((7,-6.5,2.2),(-3,6,1.4),18),((0,4,1.6),(0,-8,1.5),20)]
for i,(loc,tgt,lens) in enumerate(views):
    co.location=loc; cam.lens=lens; co.rotation_euler=(Vector(tgt)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    s.render.filepath=f'/opt/work/ptest/set_{i}.png'; t=time.time(); bpy.ops.render.render(write_still=True); print('TIME',i,time.time()-t)
