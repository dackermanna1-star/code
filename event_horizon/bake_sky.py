"""
Bakes the procedural deep-space sky into equirectangular EXR maps so the
animation does not have to evaluate dozens of noise/voronoi octaves per ray.

    blender -b -P bake_sky.py -- OUTDIR [STAR_WIDTH]

Produces OUTDIR/sky_stars.exr (point stars, 8k) and OUTDIR/sky_nebula.exr
(nebula + milky way glow, 4k).
"""
import bpy
import math
import os
import sys
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = a[0] if a else "/tmp/sky"
STAR_W = int(a[1]) if len(a) > 1 else 8192
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.use_denoising = False
sc.cycles.use_adaptive_sampling = False
sc.view_settings.view_transform = "Standard"
sc.render.image_settings.file_format = "OPEN_EXR"
sc.render.image_settings.color_depth = "16"
sc.render.image_settings.exr_codec = "ZIP"
sc.render.image_settings.color_mode = "RGB"
sc.render.use_compositing = False
sc.render.use_sequencer = False

cd = bpy.data.cameras.new("pano")
cd.type = "PANO"
cd.panorama_type = "EQUIRECTANGULAR"
cam = bpy.data.objects.new("pano", cd)
sc.collection.objects.link(cam)
cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
sc.camera = cam

world = bpy.data.worlds.new("sky")
sc.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()


def nnew(kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        setattr(n, k, v)
    return n


def put(sock, v):
    if isinstance(v, bpy.types.NodeSocket):
        nt.links.new(v, sock)
    else:
        sock.default_value = v


def M(op, x, y=None):
    n = nnew("ShaderNodeMath", operation=op)
    put(n.inputs[0], x)
    if y is not None:
        put(n.inputs[1], y)
    return n.outputs[0]


def VM(op, x, y=None, scale=None):
    n = nnew("ShaderNodeVectorMath", operation=op)
    put(n.inputs[0], x)
    if y is not None:
        put(n.inputs[1], y)
    if scale is not None:
        put(n.inputs["Scale"], scale)
    return n.outputs["Value" if op in ("DOT_PRODUCT", "LENGTH") else "Vector"]


def MR(v, a0, a1, b0, b1, smooth=False):
    n = nnew("ShaderNodeMapRange", clamp=True)
    if smooth:
        n.interpolation_type = "SMOOTHSTEP"
    for i, x in enumerate((v, a0, a1, b0, b1)):
        put(n.inputs[i], x)
    return n.outputs[0]


def RAMP(fac, stops):
    n = nnew("ShaderNodeValToRGB")
    els = n.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[1][0], (*stops[1][1], 1)
    for p, c in stops[2:]:
        e = els.new(p)
        e.color = (*c, 1)
    put(n.inputs[0], fac)
    return n.outputs[0]


def NOISE(vec, scale, detail, rough, dist=0.0):
    n = nnew("ShaderNodeTexNoise")
    put(n.inputs["Vector"], vec)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    n.inputs["Distortion"].default_value = dist
    return n


d = VM("NORMALIZE", nnew("ShaderNodeTexCoord").outputs["Generated"])


def star_layer(scale, size, pw, gain):
    vor = nnew("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature="F1")
    put(vor.inputs["Vector"], d)
    vor.inputs["Scale"].default_value = scale
    core = M("POWER", MR(vor.outputs["Distance"], 0.0, size, 1.0, 0.0, True), 2.0)
    sep = nnew("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs[0])
    bright = M("MULTIPLY", M("POWER", sep.outputs[0], pw), gain)
    col = RAMP(sep.outputs[1], [(0.0, (0.62, 0.74, 1.0)), (0.45, (1.0, 1.0, 1.0)),
                                (0.8, (1.0, 0.88, 0.7)), (1.0, (1.0, 0.68, 0.48))])
    return VM("SCALE", col, scale=M("MULTIPLY", core, bright))


band_axis = Vector((0.3, 0.5, 0.81)).normalized()
band = MR(M("ABSOLUTE", VM("DOT_PRODUCT", d, band_axis)), 0.0, 0.42, 1.0, 0.0, True)

bg = nnew("ShaderNodeBackground")
out = nnew("ShaderNodeOutputWorld")
nt.links.new(bg.outputs[0], out.inputs["Surface"])


def render(path, w, spp):
    sc.render.resolution_x = w
    sc.render.resolution_y = w // 2
    sc.render.resolution_percentage = 100
    sc.cycles.samples = spp
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("baked", path, flush=True)


# --- stars ---------------------------------------------------------------
s1 = star_layer(95.0, 0.16, 14.0, 70.0)
s2 = star_layer(260.0, 0.17, 6.0, 5.0)
s3 = star_layer(700.0, 0.24, 3.0, 0.5)
milky = VM("SCALE", s3, scale=M("ADD", M("MULTIPLY", band, 3.0), 0.4))
stars = VM("ADD", VM("ADD", s1, s2), milky)
nt.links.new(stars, bg.inputs["Color"])
render(os.path.join(OUT, "sky_stars.exr"), STAR_W, 8)

# --- nebula --------------------------------------------------------------
neb = NOISE(d, 1.6, 12.0, 0.64, 0.25)
dust = NOISE(d, 4.0, 10.0, 0.6)
neb_col = RAMP(neb.outputs["Fac"], [(0.42, (0.0, 0.0, 0.0)), (0.55, (0.030, 0.010, 0.055)),
                                    (0.66, (0.012, 0.045, 0.075)), (0.78, (0.10, 0.06, 0.09))])
dark = MR(dust.outputs["Fac"], 0.42, 0.62, 0.15, 1.0)
amt = M("MULTIPLY", M("ADD", band, 0.18), dark)
glow = VM("SCALE", (0.020, 0.018, 0.026), scale=M("MULTIPLY", band, dark))
nebula = VM("ADD", VM("SCALE", neb_col, scale=M("MULTIPLY", amt, 0.9)), glow)
nt.links.new(nebula, bg.inputs["Color"])
render(os.path.join(OUT, "sky_nebula.exr"), max(2048, STAR_W // 2), 4)
