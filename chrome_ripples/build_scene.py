"""
Build the "Chrome Ripples" scene in Blender 4.5.

    blender -b --factory-startup --python build_scene.py -- [--out scene.blend]
            [--res 1280x720] [--samples 6] [--grid 520]

Everything is generated procedurally: the liquid-metal surface is a
Geometry Nodes grid whose height field is a sum of ripple events (stored as
points with attributes on a hidden "RippleEvents" object), the spheres are
keyframed from the deterministic simulation in sim.py, and the camera
follows a smooth spline through hand-designed key poses.
"""

import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sim  # noqa: E402

# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
    return default


OUT = arg("--out", os.path.join(HERE, "chrome_ripples.blend"))
RES = arg("--res", "1280x720")
SAMPLES = int(arg("--samples", 6))
GRID_RES = int(arg("--grid", 520))

# --------------------------------------------------------------------------
# Scene reset
# --------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "ChromeRipples"
scene.frame_start = 1
scene.frame_end = sim.N_FRAMES
scene.render.fps = sim.FPS

# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------
print("[build] simulating ...")
frame_ts = sim.build_time_map()
S = sim.simulate(verbose=True)
EV = S["events"]
positions = sim.sample_frames(S, frame_ts)            # (F, B, 3)
ev_start, ev_count = sim.frame_event_windows(EV, frame_ts)
frames = np.arange(1, sim.N_FRAMES + 1, dtype=float)


def set_fcurve(id_data, data_path, values, index=0, interp="LINEAR", action_name=None):
    """Write one keyframe per frame quickly via foreach_set."""
    if id_data.animation_data is None:
        id_data.animation_data_create()
    ad = id_data.animation_data
    if ad.action is None:
        ad.action = bpy.data.actions.new(action_name or f"{id_data.name}Action")
    act = ad.action
    fc = None
    for c in act.fcurves:
        if c.data_path == data_path and c.array_index == index:
            fc = c
    if fc is None:
        fc = act.fcurves.new(data_path, index=index)
    n = len(values)
    fc.keyframe_points.add(n)
    co = np.empty(2 * n, dtype=np.float32)
    co[0::2] = frames[:n]
    co[1::2] = values
    fc.keyframe_points.foreach_set("co", co)
    ip = {"LINEAR": 1, "CONSTANT": 0, "BEZIER": 2}[interp]
    fc.keyframe_points.foreach_set("interpolation", np.full(n, ip, dtype=np.int32))
    fc.update()
    # Blender 4.4+ slotted actions: make sure the ID is bound to the slot
    if getattr(ad, "action_slot", 1) is None and len(act.slots):
        ad.action_slot = act.slots[0]
    return fc


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
def principled(name, color, rough, metallic=1.0, aniso=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if aniso:
        b.inputs["Anisotropic"].default_value = aniso
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.02
    return m


MATS = {
    "hero": principled("Chrome_Hero", (0.93, 0.93, 0.94), 0.012),
    "chrome": principled("Chrome", (0.90, 0.90, 0.91), 0.02),
    "gold": principled("Chrome_Gold", (0.96, 0.74, 0.42), 0.03),
    "titanium": principled("Chrome_Titanium", (0.62, 0.70, 0.86), 0.035),
}

liquid_mat = bpy.data.materials.new("LiquidMetal")
liquid_mat.use_nodes = True
lb = liquid_mat.node_tree.nodes["Principled BSDF"]
lb.inputs["Base Color"].default_value = (0.72, 0.74, 0.78, 1.0)
lb.inputs["Metallic"].default_value = 1.0
lb.inputs["Roughness"].default_value = 0.035

# --------------------------------------------------------------------------
# Ripple events object (points with attributes)
# --------------------------------------------------------------------------
ev_mesh = bpy.data.meshes.new("RippleEvents")
nev = len(EV["t0"])
ev_mesh.vertices.add(nev)
co = np.zeros((nev, 3), dtype=np.float32)
co[:, 0] = EV["x"]; co[:, 1] = EV["y"]
ev_mesh.vertices.foreach_set("co", co.ravel())
for key in ("t0", "A", "D", "W", "Tc", "lam"):
    at = ev_mesh.attributes.new(key, "FLOAT", "POINT")
    at.data.foreach_set("value", EV[key].astype(np.float32))
ev_mesh.update()
ev_obj = bpy.data.objects.new("RippleEvents", ev_mesh)
scene.collection.objects.link(ev_obj)
ev_obj.hide_render = True
ev_obj.hide_viewport = True

# --------------------------------------------------------------------------
# Geometry Nodes: liquid surface
# --------------------------------------------------------------------------
def build_ripple_tree():
    nt = bpy.data.node_groups.new("LiquidRipples", "GeometryNodeTree")
    itf = nt.interface
    itf.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    itf.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    s_time = itf.new_socket("Time", in_out="INPUT", socket_type="NodeSocketFloat")
    s_start = itf.new_socket("Start", in_out="INPUT", socket_type="NodeSocketInt")
    s_count = itf.new_socket("Count", in_out="INPUT", socket_type="NodeSocketInt")
    s_ev = itf.new_socket("Events", in_out="INPUT", socket_type="NodeSocketObject")
    s_res = itf.new_socket("Resolution", in_out="INPUT", socket_type="NodeSocketInt")
    s_res.default_value = GRID_RES
    s_res.min_value = 8
    N, L = nt.nodes, nt.links
    gi = N.new("NodeGroupInput"); gi.location = (-2400, 0)
    go = N.new("NodeGroupOutput"); go.location = (1800, 0)

    def lk(a, b):
        L.new(a, b)

    def val(x):
        return x

    def math(op, a, b=None, c=None, loc=(0, 0)):
        n = N.new("ShaderNodeMath"); n.operation = op; n.location = loc
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = float(v)
            else:
                lk(v, n.inputs[i])
        return n.outputs[0]

    def smooth(e0, e1, x, loc=(0, 0)):
        n = N.new("ShaderNodeMapRange"); n.interpolation_type = "SMOOTHSTEP"
        n.clamp = True; n.location = loc
        for sock, v in ((n.inputs["Value"], x), (n.inputs["From Min"], e0),
                        (n.inputs["From Max"], e1)):
            if isinstance(v, (int, float)):
                sock.default_value = float(v)
            else:
                lk(v, sock)
        n.inputs["To Min"].default_value = 0.0
        n.inputs["To Max"].default_value = 1.0
        return n.outputs["Result"]

    # grid ---------------------------------------------------------------
    grid = N.new("GeometryNodeMeshGrid"); grid.location = (-2200, 300)
    grid.inputs["Size X"].default_value = 2 * sim.HALF_SIZE
    grid.inputs["Size Y"].default_value = 2 * sim.HALF_SIZE
    lk(gi.outputs["Resolution"], grid.inputs["Vertices X"])
    lk(gi.outputs["Resolution"], grid.inputs["Vertices Y"])

    objinfo = N.new("GeometryNodeObjectInfo"); objinfo.location = (-2200, -300)
    objinfo.transform_space = "ORIGINAL"
    lk(gi.outputs["Events"], objinfo.inputs["Object"])
    evgeo = objinfo.outputs["Geometry"]

    # repeat zone ----------------------------------------------------------
    rin = N.new("GeometryNodeRepeatInput"); rin.location = (-1900, 300)
    rout = N.new("GeometryNodeRepeatOutput"); rout.location = (1100, 300)
    rin.pair_with_output(rout)
    rout.repeat_items.new("INT", "Idx")
    lk(gi.outputs["Count"], rin.inputs["Iterations"])
    lk(grid.outputs["Mesh"], rin.inputs["Geometry"])
    lk(gi.outputs["Start"], rin.inputs["Idx"])
    idx = rin.outputs["Idx"]

    def sample(attr, y):
        si = N.new("GeometryNodeSampleIndex"); si.location = (-1600, y)
        si.data_type = "FLOAT"; si.domain = "POINT"
        na = N.new("GeometryNodeInputNamedAttribute"); na.location = (-1800, y)
        na.data_type = "FLOAT"; na.inputs["Name"].default_value = attr
        lk(evgeo, si.inputs["Geometry"])
        lk(na.outputs["Attribute"], si.inputs["Value"])
        lk(idx, si.inputs["Index"])
        return si.outputs["Value"]

    si_p = N.new("GeometryNodeSampleIndex"); si_p.location = (-1600, 600)
    si_p.data_type = "FLOAT_VECTOR"; si_p.domain = "POINT"
    pos_ev = N.new("GeometryNodeInputPosition"); pos_ev.location = (-1800, 600)
    lk(evgeo, si_p.inputs["Geometry"]); lk(pos_ev.outputs[0], si_p.inputs["Value"])
    lk(idx, si_p.inputs["Index"])

    t0 = sample("t0", 400); A = sample("A", 250); D = sample("D", 100)
    W = sample("W", -50); Tc = sample("Tc", -200); lam = sample("lam", -350)

    posg = N.new("GeometryNodeInputPosition"); posg.location = (-1600, 800)
    dist = N.new("ShaderNodeVectorMath"); dist.operation = "DISTANCE"
    dist.location = (-1400, 700)
    lk(posg.outputs[0], dist.inputs[0]); lk(si_p.outputs["Value"], dist.inputs[1])
    r = dist.outputs["Value"]

    x0 = -1200
    traw = math("SUBTRACT", gi.outputs["Time"], t0, loc=(x0, 400))
    active = math("GREATER_THAN", traw, 0.0, loc=(x0 + 150, 450))
    tau = math("MAXIMUM", traw, 0.0, loc=(x0 + 150, 350))
    xb = math("MULTIPLY_ADD", tau, sim.WAVE_C, math("MULTIPLY", r, -1.0, loc=(x0, 250)),
              loc=(x0 + 300, 350))
    Ltr = math("MULTIPLY", lam, sim.TRAIN_CYCLES, loc=(x0, 100))
    k = math("DIVIDE", 2.0 * np.pi, lam, loc=(x0, -50))
    env_a = smooth(0.0, math("MULTIPLY", lam, 0.35, loc=(x0, -200)), xb, loc=(x0 + 450, 250))
    env_b = smooth(math("MULTIPLY", Ltr, 0.35, loc=(x0 + 150, 100)), Ltr, xb, loc=(x0 + 450, 50))
    env = math("MULTIPLY", env_a, math("SUBTRACT", 1.0, env_b, loc=(x0 + 600, 50)),
               loc=(x0 + 750, 150))
    sinw = math("SINE", math("MULTIPLY", k, xb, loc=(x0 + 450, -100)), loc=(x0 + 600, -100))
    spread = math("POWER", math("MULTIPLY_ADD", r, 1.0 / sim.SPREAD_R0, 1.0,
                                loc=(x0, -350)), -0.5, loc=(x0 + 150, -350))
    decay = math("EXPONENT", math("MULTIPLY", tau, -1.0 / sim.WAVE_DECAY,
                                  loc=(x0 + 300, -300)), loc=(x0 + 450, -300))
    wave = math("MULTIPLY", A, env, loc=(x0 + 900, 150))
    wave = math("MULTIPLY", wave, sinw, loc=(x0 + 1050, 100))
    wave = math("MULTIPLY", wave, spread, loc=(x0 + 1200, 50))
    wave = math("MULTIPLY", wave, decay, loc=(x0 + 1350, 0))

    # dimple + rebound
    rw = math("DIVIDE", r, W, loc=(x0, -500))
    gauss = math("EXPONENT", math("MULTIPLY", math("MULTIPLY", rw, rw, loc=(x0 + 150, -500)),
                                  -1.0, loc=(x0 + 300, -500)), loc=(x0 + 450, -500))
    s1 = math("DIVIDE", tau, Tc, loc=(x0, -650)); s1.node.use_clamp = True
    press = math("MULTIPLY", math("SINE", math("MULTIPLY", s1, np.pi, loc=(x0 + 150, -650)),
                                  loc=(x0 + 300, -650)),
                 math("MULTIPLY", D, -1.0, loc=(x0 + 300, -750)), loc=(x0 + 450, -650))
    s2 = math("DIVIDE", math("SUBTRACT", tau, Tc, loc=(x0, -850)), sim.REBOUND_T,
              loc=(x0 + 150, -850))
    s2.node.use_clamp = True
    reb = math("MULTIPLY", math("SINE", math("MULTIPLY", s2, np.pi, loc=(x0 + 300, -850)),
                                loc=(x0 + 450, -850)),
               math("MULTIPLY", D, sim.REBOUND_K, loc=(x0 + 450, -950)), loc=(x0 + 600, -850))
    dimple = math("MULTIPLY", math("ADD", press, reb, loc=(x0 + 750, -700)), gauss,
                  loc=(x0 + 900, -600))

    fade = math("SUBTRACT", 1.0, smooth(0.6 * sim.EVENT_LIFETIME, sim.EVENT_LIFETIME, tau,
                                        loc=(x0 + 1200, -400)), loc=(x0 + 1400, -400))
    h = math("ADD", wave, dimple, loc=(x0 + 1550, -100))
    h = math("MULTIPLY", h, active, loc=(x0 + 1700, -100))
    h = math("MULTIPLY", h, fade, loc=(x0 + 1850, -100))

    prev = N.new("GeometryNodeInputNamedAttribute"); prev.location = (x0 + 1700, 150)
    prev.data_type = "FLOAT"; prev.inputs["Name"].default_value = "h"
    hsum = math("ADD", prev.outputs["Attribute"], h, loc=(x0 + 2000, 0))
    store = N.new("GeometryNodeStoreNamedAttribute"); store.location = (x0 + 2150, 300)
    store.data_type = "FLOAT"; store.domain = "POINT"
    store.inputs["Name"].default_value = "h"
    lk(rin.outputs["Geometry"], store.inputs["Geometry"])
    lk(hsum, store.inputs["Value"])
    lk(store.outputs["Geometry"], rout.inputs["Geometry"])
    lk(math("ADD", idx, 1.0, loc=(x0 + 2000, 450)), rout.inputs["Idx"])

    # after loop: taper + displace + smooth shading ---------------------
    posa = N.new("GeometryNodeInputPosition"); posa.location = (1150, -200)
    sep = N.new("ShaderNodeSeparateXYZ"); sep.location = (1300, -200)
    lk(posa.outputs[0], sep.inputs[0])
    ax = math("ABSOLUTE", sep.outputs["X"], loc=(1450, -150))
    ay = math("ABSOLUTE", sep.outputs["Y"], loc=(1450, -300))
    m = math("MAXIMUM", ax, ay, loc=(1600, -200))
    taper = math("SUBTRACT", 1.0, smooth(sim.HALF_SIZE - sim.EDGE_TAPER,
                                         sim.HALF_SIZE - 0.5, m, loc=(1750, -200)),
                 loc=(1900, -200))
    hfin = N.new("GeometryNodeInputNamedAttribute"); hfin.location = (1600, -400)
    hfin.data_type = "FLOAT"; hfin.inputs["Name"].default_value = "h"
    hz = math("MULTIPLY", hfin.outputs["Attribute"], taper, loc=(2050, -300))
    comb = N.new("ShaderNodeCombineXYZ"); comb.location = (2200, -300)
    lk(hz, comb.inputs["Z"])
    setp = N.new("GeometryNodeSetPosition"); setp.location = (2350, 100)
    lk(rout.outputs["Geometry"], setp.inputs["Geometry"])
    lk(comb.outputs[0], setp.inputs["Offset"])
    smoothn = N.new("GeometryNodeSetShadeSmooth"); smoothn.location = (2550, 100)
    lk(setp.outputs["Geometry"], smoothn.inputs["Geometry"])
    setm = N.new("GeometryNodeSetMaterial"); setm.location = (2750, 100)
    setm.inputs["Material"].default_value = liquid_mat
    lk(smoothn.outputs["Geometry"], setm.inputs["Geometry"])
    lk(setm.outputs["Geometry"], go.inputs["Geometry"])
    go.location = (2950, 100)
    return nt


ripple_tree = build_ripple_tree()
liq_mesh = bpy.data.meshes.new("LiquidBase")
liquid = bpy.data.objects.new("LiquidMetal", liq_mesh)
scene.collection.objects.link(liquid)
liquid.data.materials.append(liquid_mat)
mod = liquid.modifiers.new("Ripples", "NODES")
mod.node_group = ripple_tree
ids = {it.name: it.identifier for it in ripple_tree.interface.items_tree
       if it.item_type == "SOCKET" and it.in_out == "INPUT"}
mod[ids["Events"]] = ev_obj
mod[ids["Resolution"]] = GRID_RES
set_fcurve(liquid, f'modifiers["Ripples"]["{ids["Time"]}"]', frame_ts.astype(np.float32))
set_fcurve(liquid, f'modifiers["Ripples"]["{ids["Start"]}"]', ev_start.astype(np.float32),
           interp="CONSTANT")
set_fcurve(liquid, f'modifiers["Ripples"]["{ids["Count"]}"]', ev_count.astype(np.float32),
           interp="CONSTANT")

# Static outer liquid: a big square ring around the detailed grid
H, OUTER = sim.HALF_SIZE, 400.0
ov = [(-OUTER, -OUTER, 0), (OUTER, -OUTER, 0), (OUTER, OUTER, 0), (-OUTER, OUTER, 0),
      (-H, -H, 0), (H, -H, 0), (H, H, 0), (-H, H, 0)]
of = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
om = bpy.data.meshes.new("LiquidOuter")
om.from_pydata(ov, [], of)
om.materials.append(liquid_mat)
outer = bpy.data.objects.new("LiquidOuter", om)
scene.collection.objects.link(outer)

# --------------------------------------------------------------------------
# Spheres
# --------------------------------------------------------------------------
sph_mesh = bpy.data.meshes.new("SphereMesh")  # shared -> instanced in Cycles
import bmesh  # noqa: E402
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=1.0)
bm.to_mesh(sph_mesh); bm.free()
sph_mesh.shade_smooth()
sph_mesh.materials.append(MATS["chrome"])

col_s = bpy.data.collections.new("Spheres")
scene.collection.children.link(col_s)
sphere_objs = []
for bi, sd in enumerate(S["spheres"]):
    o = bpy.data.objects.new(sd["name"], sph_mesh)
    col_s.objects.link(o)
    o.scale = (sd["r"],) * 3
    o.material_slots[0].link = "OBJECT"
    o.material_slots[0].material = MATS[sd["mat"]]
    for ax in range(3):
        set_fcurve(o, "location", positions[:, bi, ax].astype(np.float32), index=ax)
    sphere_objs.append(o)

# --------------------------------------------------------------------------
# Studio lighting: soft emissive panels, invisible to the camera but seen in
# every reflection (that is what makes chrome read as chrome)
# --------------------------------------------------------------------------
def softbox_material(name, color, strength, soft_u=0.18, soft_v=0.18):
    """Emission with feathered edges, using the panel's UVs."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    for n in list(N):
        N.remove(n)
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    uv = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    Lk.new(uv.outputs["UV"], sep.inputs[0])

    def edge(sock, soft):
        # smooth 0..1..0 profile across [0,1]
        a = N.new("ShaderNodeMapRange"); a.interpolation_type = "SMOOTHSTEP"
        a.inputs["From Min"].default_value = 0.0; a.inputs["From Max"].default_value = soft
        b = N.new("ShaderNodeMapRange"); b.interpolation_type = "SMOOTHSTEP"
        b.inputs["From Min"].default_value = 1.0; b.inputs["From Max"].default_value = 1.0 - soft
        Lk.new(sock, a.inputs["Value"]); Lk.new(sock, b.inputs["Value"])
        mm = N.new("ShaderNodeMath"); mm.operation = "MULTIPLY"
        Lk.new(a.outputs[0], mm.inputs[0]); Lk.new(b.outputs[0], mm.inputs[1])
        return mm.outputs[0]

    f = N.new("ShaderNodeMath"); f.operation = "MULTIPLY"
    Lk.new(edge(sep.outputs["X"], soft_u), f.inputs[0])
    Lk.new(edge(sep.outputs["Y"], soft_v), f.inputs[1])
    st = N.new("ShaderNodeMath"); st.operation = "MULTIPLY"
    st.inputs[1].default_value = strength
    Lk.new(f.outputs[0], st.inputs[0])
    Lk.new(st.outputs[0], em.inputs["Strength"])
    Lk.new(em.outputs[0], out.inputs["Surface"])
    m.cycles.emission_sampling = "NONE"
    return m


col_l = bpy.data.collections.new("Studio")
scene.collection.children.link(col_l)


def panel(name, mesh, mat, loc, rot=(0, 0, 0)):
    mesh.materials.append(mat)
    o = bpy.data.objects.new(name, mesh)
    col_l.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.visible_camera = False
    o.visible_shadow = False
    return o


def quad_mesh(name, w, h):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)],
                   [], [(0, 1, 2, 3)])
    uvl = me.uv_layers.new(name="UVMap")
    for i, uvv in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uvl.data[i].uv = uvv
    return me


def ring_mesh(name, radius, width, seg=192):
    me = bpy.data.meshes.new(name)
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for rr in (radius - width / 2, radius + width / 2):
            verts.append((rr * math.cos(a), rr * math.sin(a), 0))
    for i in range(seg):
        j = (i + 1) % seg
        faces.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    for fi, f in enumerate(me.polygons):
        for li, vi in zip(f.loop_indices, f.vertices):
            uvl.data[li].uv = (0.5, float(vi % 2))      # v across the band
    return me


# big overhead ring light -> concentric highlight that the ripples distort
ring_mat = softbox_material("Softbox_Ring", (1.0, 0.98, 0.96), 6.0, soft_u=0.0001, soft_v=0.4)
panel("RingLight", ring_mesh("RingLight", 12.0, 2.4), ring_mat, (0, 0, 12.0))

# tall strip softboxes around the set (cool / warm alternating)
STRIPS = [(25, 1.0, (0.80, 0.90, 1.00), 2.4), (95, 0.8, (1.00, 0.85, 0.66), 2.0),
          (160, 1.0, (0.92, 0.95, 1.00), 2.4), (220, 0.8, (1.00, 0.88, 0.72), 1.8),
          (290, 1.0, (0.82, 0.90, 1.00), 2.4)]
for i, (azd, w, c, s) in enumerate(STRIPS):
    a = math.radians(azd)
    mat = softbox_material(f"Softbox_Strip{i}", c, s, 0.3, 0.22)
    o = panel(f"Strip{i}", quad_mesh(f"Strip{i}", 2.2 * w, 14.0), mat,
              (24 * math.cos(a), 24 * math.sin(a), 6.0))
    # stand upright, facing the centre
    o.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)

world = bpy.data.worlds.new("StudioWorld")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bg = wn["Background"]
tc = wn.new("ShaderNodeTexCoord")
sep = wn.new("ShaderNodeSeparateXYZ")
wl.new(tc.outputs["Generated"], sep.inputs[0])


def ramp_node(stops):
    rn = wn.new("ShaderNodeValToRGB")
    rn.color_ramp.interpolation = "EASE"
    els = rn.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos_, col_ in stops[1:-1]:
        els.new(pos_).color = (*col_, 1)
    wl.new(sep.outputs["Z"], rn.inputs["Fac"])
    return rn


# what reflections see: a soft grey studio dome (keeps the liquid silver)
# (world "Generated" Z is the view direction, i.e. sin(elevation)).  A bright
# cyclorama glow just above the horizon makes the liquid read as silver at
# grazing angles.
refl = ramp_node([(0.00, (0.10, 0.105, 0.115)), (0.05, (0.30, 0.31, 0.33)),
                  (0.20, (0.075, 0.078, 0.086)), (0.55, (0.025, 0.026, 0.03)),
                  (1.00, (0.14, 0.14, 0.145))])
# what the camera sees directly: a deep, dark backdrop
camv = ramp_node([(0.00, (0.040, 0.042, 0.048)), (0.10, (0.010, 0.011, 0.013)),
                  (1.00, (0.003, 0.003, 0.004))])
lp = wn.new("ShaderNodeLightPath")
mixw = wn.new("ShaderNodeMix"); mixw.data_type = "RGBA"
wl.new(lp.outputs["Is Camera Ray"], mixw.inputs["Factor"])
wl.new(refl.outputs["Color"], mixw.inputs["A"])
wl.new(camv.outputs["Color"], mixw.inputs["B"])
wl.new(mixw.outputs["Result"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 1.0

# --------------------------------------------------------------------------
# Camera choreography
# --------------------------------------------------------------------------
cam_data = bpy.data.cameras.new("Camera")
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.sensor_width = 36
cam_data.dof.use_dof = True
cam_data.clip_start = 0.05
cam_data.clip_end = 1000

# key poses: (time s, azimuth deg, distance, height, target x,y,z, focal mm, fstop)
T_IMP = float(np.interp(sim.T_HERO_IMPACT, frame_ts, (frames - 1) / sim.FPS))
print(f"[build] hero impact at {T_IMP:.2f}s")
KEYS = [
    (0.0, -40, 16.0, 1.00, 0, 0, 0.6, 30, 8.0),
    (T_IMP - 2.8, -31, 11.0, 1.10, 0, 0, 0.7, 35, 6.0),
    (T_IMP, -21.4, 7.2, 1.30, 0, 0, 0.5, 42, 4.0),     # hero impact
    (T_IMP + 3.6, -8, 10.5, 1.80, 0, 0, 0.6, 32, 5.0),
    (15.0, 15, 10.0, 2.60, 0, 0, 0.4, 35, 5.5),
    (22.0, 45, 13.5, 4.50, 0, 0, 0.0, 32, 7.0),
    (30.0, 80, 15.5, 6.50, 0, 0, 0.0, 32, 8.0),
    (37.0, 112, 12.5, 3.00, 1.0, 0.6, 0.3, 36, 7.0),
    (42.5, 140, 12.0, 5.00, 0, 0, 0.3, 36, 7.0),
    (48.0, 172, 13.5, 11.0, 0, 0, 0.0, 34, 9.0),
    (54.0, 198, 13.5, 16.0, 0, 0, 0.0, 32, 10.0),
    (60.0, 220, 12.5, 19.0, 0, 0, 0.0, 30, 11.0),
]


def spline(ts, keys_t, vals):
    """Catmull-Rom (centripetal-free, uniform) with smootherstep timing per segment."""
    keys_t = np.asarray(keys_t, float); vals = np.asarray(vals, float)
    out = np.empty(len(ts))
    for i, t in enumerate(ts):
        j = np.clip(np.searchsorted(keys_t, t) - 1, 0, len(keys_t) - 2)
        t0, t1 = keys_t[j], keys_t[j + 1]
        u = np.clip((t - t0) / (t1 - t0), 0, 1)
        p0 = vals[max(j - 1, 0)]; p1 = vals[j]; p2 = vals[j + 1]; p3 = vals[min(j + 2, len(vals) - 1)]
        # tangents scaled to segment durations to keep speed continuous
        dt0 = keys_t[j + 1] - keys_t[max(j - 1, 0)]
        dt1 = keys_t[min(j + 2, len(keys_t) - 1)] - keys_t[j]
        m1 = (p2 - p0) / max(dt0, 1e-6) * (t1 - t0)
        m2 = (p3 - p1) / max(dt1, 1e-6) * (t1 - t0)
        if j == 0:
            m1 = 0.0
        if j == len(keys_t) - 2:
            m2 = (p2 - p1) * 0.6
        u2, u3 = u * u, u * u * u
        out[i] = ((2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1
                  + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2)
    return out


real_t = (frames - 1) / sim.FPS
K = np.array(KEYS, float)
az = np.radians(spline(real_t, K[:, 0], K[:, 1]))
dist = spline(real_t, K[:, 0], K[:, 2])
hgt = spline(real_t, K[:, 0], K[:, 3])
tx = spline(real_t, K[:, 0], K[:, 4]); ty = spline(real_t, K[:, 0], K[:, 5])
tz = spline(real_t, K[:, 0], K[:, 6])
foc = spline(real_t, K[:, 0], K[:, 7]); fst = spline(real_t, K[:, 0], K[:, 8])

# keep the hero in frame while it falls and bounces, then let go
hero_z = positions[:, 0, 2]
follow = 0.38 * (1.0 - sim.smoothstep(17.0, 24.0, real_t))
tz = tz + follow * np.clip(hero_z - 0.6, 0.0, 3.2)

cx = tx + dist * np.cos(az); cy = ty + dist * np.sin(az); cz = hgt
target = bpy.data.objects.new("CamTarget", None)
scene.collection.objects.link(target)
for ax, arr in enumerate((tx, ty, tz)):
    set_fcurve(target, "location", arr.astype(np.float32), index=ax)
for ax, arr in enumerate((cx, cy, cz)):
    set_fcurve(cam, "location", arr.astype(np.float32), index=ax)
con = cam.constraints.new("TRACK_TO")
con.target = target; con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"
cam_data.dof.focus_object = target
set_fcurve(cam_data, "lens", foc.astype(np.float32))
set_fcurve(cam_data, "dof.aperture_fstop", fst.astype(np.float32))

# --------------------------------------------------------------------------
# Render settings
# --------------------------------------------------------------------------
rx, ry = (int(v) for v in RES.split("x"))
r = scene.render
r.engine = "CYCLES"
r.resolution_x, r.resolution_y = rx, ry
r.resolution_percentage = 100
r.use_motion_blur = False
cy_ = scene.cycles
cy_.device = "CPU"
cy_.samples = SAMPLES
cy_.use_adaptive_sampling = True
cy_.adaptive_threshold = 0.03
cy_.use_denoising = True
cy_.denoiser = "OPENIMAGEDENOISE"
cy_.denoising_quality = "BALANCED"
cy_.denoising_prefilter = "FAST"
r.use_persistent_data = True
cy_.max_bounces = 10
cy_.glossy_bounces = 10
cy_.diffuse_bounces = 2
cy_.transmission_bounces = 2
cy_.transparent_max_bounces = 2
cy_.caustics_reflective = False
cy_.caustics_refractive = False
cy_.blur_glossy = 0.5
cy_.sample_clamp_indirect = 8.0
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

# fade in / out via exposure
expo = np.zeros(len(frames))
expo += -8.0 * (1 - sim.smoothstep(0.0, 1.6, real_t))
expo += -8.0 * sim.smoothstep(58.4, 60.0, real_t)
set_fcurve(scene, "view_settings.exposure", expo.astype(np.float32))

# compositor: soft bloom + vignette
scene.use_nodes = True
ct = scene.node_tree
for n in list(ct.nodes):
    ct.nodes.remove(n)
rl = ct.nodes.new("CompositorNodeRLayers")
glare = ct.nodes.new("CompositorNodeGlare")
glare.glare_type = "FOG_GLOW"
glare.quality = "MEDIUM"
try:
    glare.inputs["Threshold"].default_value = 1.2
    glare.inputs["Strength"].default_value = 0.35
    glare.inputs["Size"].default_value = 0.5
except (KeyError, TypeError):
    glare.threshold = 1.2
    glare.mix = -0.7
    glare.size = 8
ell = ct.nodes.new("CompositorNodeEllipseMask")
ell.width = 1.15; ell.height = 1.05
blur = ct.nodes.new("CompositorNodeBlur")
blur.size_x = 300; blur.size_y = 300
blur.use_relative = False
mixv = ct.nodes.new("CompositorNodeMixRGB")
mixv.blend_type = "MULTIPLY"
vig_map = ct.nodes.new("CompositorNodeMapRange")
vig_map.inputs["To Min"].default_value = 0.55
comp = ct.nodes.new("CompositorNodeComposite")
cl = ct.links
cl.new(rl.outputs["Image"], glare.inputs["Image"])
cl.new(ell.outputs["Mask"], blur.inputs["Image"])
cl.new(blur.outputs["Image"], vig_map.inputs["Value"])
cl.new(glare.outputs["Image"], mixv.inputs[1])
cl.new(vig_map.outputs["Value"], mixv.inputs[2])
cl.new(mixv.outputs["Image"], comp.inputs["Image"])

r.image_settings.file_format = "PNG"
r.image_settings.color_depth = "8"
r.filepath = "//render/frame_"
r.use_overwrite = False      # resumable: existing frames are skipped
r.use_placeholder = True     # lets several processes share one frame range

scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print(f"[build] saved {OUT}: {len(sphere_objs)} spheres, {nev} ripple events, "
      f"max active {ev_count.max()}")
