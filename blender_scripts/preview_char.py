import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:]
out = argv[0]
s = bpy.context.scene
s.render.engine='BLENDER_EEVEE_NEXT'; s.eevee.taa_render_samples=16
s.render.resolution_x=1080; s.render.resolution_y=1080; s.render.resolution_percentage=60
s.view_settings.view_transform='AgX'; s.view_settings.look='AgX - Medium High Contrast'
w = bpy.data.worlds.new('w'); s.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.05,0.06,0.07,1)
def light(name, loc, energy, size, col=(1,1,1)):
    l=bpy.data.lights.new(name,'AREA'); l.energy=energy; l.size=size; l.color=col
    o=bpy.data.objects.new(name,l); s.collection.objects.link(o); o.location=loc
    d=Vector((0,0,1.5))-Vector(loc); o.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
light('key',(1.5,-2.0,2.4),250,1.5,(1,0.92,0.82)); light('fill',(-2,-1.5,1.6),80,2,(0.8,0.9,1)); light('rim',(0.5,2.5,2.4),200,1)
cam=bpy.data.cameras.new('c'); co=bpy.data.objects.new('c',cam); s.collection.objects.link(co); s.camera=co
for i,(loc,tgt,lens) in enumerate([((0.0,-3.6,1.0),(0,0,0.85),50),((0.25,-0.75,1.62),(0,0,1.58),60),((0.75,-0.55,1.62),(0,0,1.58),60)]):
    co.location=loc; cam.lens=lens
    co.rotation_euler=(Vector(tgt)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    s.render.filepath=out+f'_{i}.png'; bpy.ops.render.render(write_still=True)
