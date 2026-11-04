import bpy, time, sys
s = bpy.context.scene; s.render.resolution_percentage = 25
c = s.cycles; c.samples = 4; c.use_adaptive_sampling = False; c.max_bounces = 4; c.diffuse_bounces = 1; c.glossy_bounces = 1; c.transmission_bounces = 2; c.transparent_max_bounces = 6
c.ao_bounces_render = 1; c.texture_limit_render = '1024'; c.use_denoising = False
s.frame_set(11); s.render.filepath = '/tmp/claude-0/-home-user-code/6a74fc6b-71cb-51d3-af35-c6757898e0f3/scratchpad/b3.png'
v = sys.argv[-1]
if 'leaf' in v:
    for m in bpy.data.materials:
        if m.name.startswith('MAT_Leaf'):
            nt = m.node_tree; am = [n for n in nt.nodes if n.type == 'MIX_SHADER' and n.inputs[0].is_linked][0]
            b = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]; nt.links.new(b.outputs[0], am.inputs[2])
if 'terr' in v:
    for m in bpy.data.materials:
        if m.name.startswith('MAT_Terrain'):
            nt = m.node_tree; out = nt.nodes['Material Output']; d = nt.nodes.new('ShaderNodeBsdfDiffuse'); nt.links.new(d.outputs[0], out.inputs[0])
if 'notrans' in v: c.transparent_max_bounces = 1
if 'nodiff' in v: c.diffuse_bounces = 0
if 'nohdri' in v: s.world.node_tree.nodes['Background'].inputs[1].default_value = 0
if 'nomb' in v: s.render.use_motion_blur = False
bpy.ops.render.render(write_still=True)  # warm (sync)
t = time.time(); bpy.ops.render.render(write_still=True); print('T', v, round(time.time() - t, 2))
