import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index('--') + 1:]
blend, out = argv[0], argv[1]
expr = argv[2] if len(argv) > 2 else ''
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
rig = bpy.data.objects['Castaway.rig']; body = bpy.data.objects['Castaway.body']
# relax arms from T-pose
pb = rig.pose.bones
for s, sg in (('L', 1), ('R', -1)):
    pb['upperarm01.' + s].rotation_mode = 'XYZ'
    pb['upperarm01.' + s].rotation_euler = (0, 0, 0)
print('BONE ROT MODE', pb['upperarm01.L'].rotation_mode)
for k, v in [e.split('=') for e in expr.split(',') if e]:
    if k in rig.keys(): rig[k] = float(v)
    else: body.data.shape_keys.key_blocks[k].value = float(v)
head = rig.matrix_world @ ((pb['eye.L'].head + pb['eye.R'].head) / 2)
print('HEAD', head)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; sky = w.node_tree.nodes.new('ShaderNodeTexSky'); sky.sun_elevation = math.radians(35); sky.sun_rotation = math.radians(200)
w.node_tree.links.new(sky.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.25
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(50), 0, math.radians(-35)); sc.collection.objects.link(sun)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = -1.3
sc.render.resolution_x = 720; sc.render.resolution_y = 1280
for name, dist, lens, zoff in (('face', 0.75, 85, -0.02), ('body', 3.6, 50, -0.8)):
    tgt = head + mathutils.Vector((0, 0, zoff))
    cam.location = tgt + mathutils.Vector((0.35 * dist, -dist, 0.05 * dist))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    sc.render.filepath = out + '_' + name + '.png'
    bpy.ops.render.render(write_still=True)
