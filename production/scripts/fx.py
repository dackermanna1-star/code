"""Atmospheric FX: volumetric mushroom cloud, smoke columns, fires, steam."""
import bpy, bmesh, math, random
from mathutils import Vector
import ylib as Y


def cloud_material(name, color=(0.95, 0.9, 0.85), density=1.6, glow=(1.0, 0.45, 0.15), glow_str=0.0, noise_scale=0.8):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    pv = nt.nodes.new("ShaderNodeVolumePrincipled")
    pv.inputs["Color"].default_value = (*color, 1)
    pv.inputs["Anisotropy"].default_value = 0.25
    tc = nt.nodes.new("ShaderNodeTexCoord")
    # animated turbulence: object coords offset by a value driven from the frame
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.name = "Turb"
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.noise_dimensions = '4D'
    nz.inputs["Scale"].default_value = noise_scale
    nz.inputs["Detail"].default_value = 9
    nz.inputs["Roughness"].default_value = 0.6
    nz.name = "Noise"
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    # radial falloff inside the (unit-ish) domain
    gr = nt.nodes.new("ShaderNodeTexGradient"); gr.gradient_type = 'SPHERICAL'
    nt.links.new(tc.outputs["Object"], gr.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'
    nt.links.new(nz.outputs["Fac"], mul.inputs[0]); nt.links.new(gr.outputs["Fac"], mul.inputs[1])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.12; mr.inputs["From Max"].default_value = 0.3
    mr.inputs["To Min"].default_value = 0.0; mr.inputs["To Max"].default_value = density
    nt.links.new(mul.outputs[0], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], pv.inputs["Density"])
    if glow_str:
        pv.inputs["Emission Color"].default_value = (*glow, 1)
        em = nt.nodes.new("ShaderNodeMath"); em.operation = 'MULTIPLY'; em.inputs[1].default_value = glow_str
        em.name = "GlowStr"
        # glow concentrated at the bottom of the domain (object z < 0)
        sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
        lo = nt.nodes.new("ShaderNodeMapRange"); lo.inputs["From Min"].default_value = 0.2; lo.inputs["From Max"].default_value = -0.8
        nt.links.new(sep.outputs["Z"], lo.inputs["Value"])
        g2 = nt.nodes.new("ShaderNodeMath"); g2.operation = 'MULTIPLY'
        nt.links.new(lo.outputs["Result"], g2.inputs[0]); nt.links.new(mr.outputs["Result"], g2.inputs[1])
        nt.links.new(g2.outputs[0], em.inputs[0])
        nt.links.new(em.outputs[0], pv.inputs["Emission Strength"])
    nt.links.new(pv.outputs[0], out.inputs["Volume"])
    return m


def animate_noise(mat, f0, f1, speed=0.004):
    nz = mat.node_tree.nodes["Noise"]
    nz.inputs["W"].default_value = 0.0
    nz.inputs["W"].keyframe_insert("default_value", frame=f0)
    nz.inputs["W"].default_value = (f1 - f0) * speed
    nz.inputs["W"].keyframe_insert("default_value", frame=f1)
    act = mat.node_tree.animation_data.action
    for fc in Y._fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'


def mushroom_cloud(name, c, base, height=9000, cap_r=3000, stem_r=900, f0=1, f1=100, grow=(0.6, 1.0), glow=0.0, color=(0.92, 0.86, 0.8)):
    """Volumetric mushroom cloud: rolling cap (torus-like cluster) + stem + skirt. Units in metres."""
    mat = cloud_material("M_Cloud_" + name, color=color, density=0.45, glow_str=glow, noise_scale=2.6)
    mat_stem = cloud_material("M_CloudStem_" + name, color=(color[0] * 0.92, color[1] * 0.86, color[2] * 0.8), density=0.55, glow_str=glow * 0.6, noise_scale=3.2)
    root = bpy.data.objects.new(name, None)
    c.objects.link(root)
    root.location = base
    parts = []
    def blob(nm, loc, scale, m):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, 0, 0))
        o = bpy.context.active_object
        o.name = nm
        o.location = loc
        o.scale = scale
        Y.assign(o, m)
        Y.link_to(o, c)
        o.parent = root
        parts.append(o)
        return o
    cap = blob(name + "_Cap", (0, 0, height), (cap_r, cap_r, cap_r * 0.5), mat)
    ring = blob(name + "_CapRing", (0, 0, height - cap_r * 0.3), (cap_r * 1.3, cap_r * 1.3, cap_r * 0.3), mat)
    blob(name + "_StemTop", (0, 0, height * 0.8), (stem_r * 2.4, stem_r * 2.4, cap_r * 0.4), mat_stem)
    stem = blob(name + "_Stem", (0, 0, height * 0.45), (stem_r, stem_r, height * 0.5), mat_stem)
    skirt = blob(name + "_Skirt", (0, 0, 2.0), (cap_r * 0.9, cap_r * 0.9, 4.5), mat_stem)
    # growth
    root.scale = (grow[0],) * 3
    root.keyframe_insert("scale", frame=f0)
    root.scale = (grow[1],) * 3
    root.keyframe_insert("scale", frame=f1)
    cap.keyframe_insert("location", frame=f0)
    cap.location.z = height * 1.08
    cap.keyframe_insert("location", frame=f1)
    ring.keyframe_insert("location", frame=f0)
    ring.location.z = (height - cap_r * 0.35) * 1.08
    ring.keyframe_insert("location", frame=f1)
    animate_noise(mat, f0, f1, 0.006)
    animate_noise(mat_stem, f0, f1, 0.01)
    return root


def smoke_column(name, c, base, h=600, r=120, color=(0.25, 0.22, 0.2), f0=1, f1=100):
    mat = cloud_material("M_Smoke_" + name, color=color, density=0.02, noise_scale=1.5)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
    o = bpy.context.active_object
    o.name = name
    o.location = (base[0], base[1], base[2] + h / 2)
    o.scale = (r, r, h / 2)
    o.rotation_euler = (0.15, 0.1, 0)
    Y.assign(o, mat)
    Y.link_to(o, c)
    animate_noise(mat, f0, f1, 0.01)
    return o


def fire_glow(name, c, loc, energy=200, radius=2.0, color=(1.0, 0.45, 0.12), flicker=(1, 100), seed=1):
    L = Y.light(name, 'POINT', loc, energy, color=color, size=radius, c=c)
    L.data.use_shadow = False
    rnd = random.Random(seed)
    f = flicker[0]
    while f <= flicker[1]:
        L.data.energy = energy * rnd.uniform(0.6, 1.2)
        L.data.keyframe_insert("energy", frame=f)
        f += rnd.randint(3, 7)
    return L
