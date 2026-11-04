import bpy, sys
sys.path.insert(0,'/opt/work/scripts')
import scene_lib as L, rset
from mathutils import Vector
s=bpy.context.scene
names=['mehran','Worker','Barista','Police1','Police2','UKOfficer','Official','Reporter1','Reporter2','Reporter3','Pax1','Pax2','Pax3','Pax4','Pax5','Pax6','Pax7','Pax8','Medic','Thief']
for i,n in enumerate(names):
    rig,body,objs=L.load_char(n, n+'_L')
    rig.location=(-9.5+i*1.0, -3.0, 0)
rset.eevee(s, samples=4, res=(2400,700), pct=50)
for o in bpy.data.objects:
    if o.name.startswith('CeilArea'): o.data.use_shadow=False
cam=bpy.data.cameras.new('c'); co=bpy.data.objects.new('C',cam); s.collection.objects.link(co); s.camera=co
co.location=(0,-12.5,1.2); cam.lens=30; co.rotation_euler=(Vector((0,-3,1.0))-Vector(co.location)).to_track_quat('-Z','Y').to_euler()
s.render.filepath='/opt/work/ptest/lineup.png'; bpy.ops.render.render(write_still=True)
