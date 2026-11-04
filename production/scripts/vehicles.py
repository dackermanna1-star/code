"""Period vehicles modelled from reference dimensions (no free licensed models were reachable).

- B-29 Superfortress (length 30.2 m, span 43.1 m)
- JNR D51-style 2-8-2 steam locomotive + tender, and Oha-35-style wooden passenger coaches
- Hiroshima Electric Railway 650-type style streetcar
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
import ylib as Y


def lathe(name, profile, axis='X', segs=32, mat=None, c=None):
    """profile: list of (x_along_axis, radius). Returns closed revolved mesh along X."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for x, r in profile:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
        rings.append(ring)
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if ring[0].co.yz.length > 1e-4:
            f = bm.faces.new(ring[::-1] if flip else ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    (c or bpy.context.scene.collection).objects.link(o)
    Y.smooth(o, 50)
    if mat:
        Y.assign(o, mat)
    return o


def wing(name, root_x, root_chord, tip_chord, span, thick, sweep=0.0, dihedral=0.0, mat=None, c=None, side=1, z=0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    def sec(x0, ch, y, zz, t):
        pts = []
        for fx, fz in ((0, 0), (0.08, 0.6), (0.3, 1.0), (0.7, 0.55), (1.0, 0.05), (0.7, -0.35), (0.3, -0.5), (0.08, -0.35)):
            pts.append(bm.verts.new((x0 - fx * ch, y, zz + fz * t)))
        return pts
    a = sec(root_x, root_chord, 0, z, thick)
    b = sec(root_x - sweep, tip_chord, side * span, z + dihedral, thick * tip_chord / root_chord)
    n = len(a)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]) if side > 0 else (b[i], b[(i + 1) % n], a[(i + 1) % n], a[i]))
    bm.faces.new(a if side < 0 else a[::-1])
    bm.faces.new(b[::-1] if side < 0 else b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    (c or bpy.context.scene.collection).objects.link(o)
    Y.smooth(o, 35)
    if mat:
        Y.assign(o, mat)
    return o


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.transform(o.matrix_world)   # bake so the pivot is the world origin of the build
    o.matrix_world = Matrix.Identity(4)
    return o


# ------------------------------------------------------------------ B-29
def build_b29(c):
    alu = Y.mat_basic("M_B29_Alu", (0.62, 0.64, 0.66, 1), rough=0.32, metal=0.9)
    glass = Y.mat_basic("M_B29_Glass", (0.05, 0.07, 0.09, 1), rough=0.05, metal=0.2)
    dark = Y.mat_basic("M_B29_Dark", (0.05, 0.05, 0.05, 1), rough=0.5)
    parts = []
    # fuselage along +X (nose at +X)
    prof = [(15.2, 0.0), (15.0, 0.55), (14.5, 1.05), (13.6, 1.38), (12.4, 1.45), (-8.0, 1.45), (-11.0, 1.2), (-13.5, 0.75), (-14.9, 0.3), (-15.0, 0.0)]
    fus = lathe("B29_Fuselage", prof, segs=28, mat=alu, c=c)
    parts.append(fus)
    nose = lathe("B29_NoseGlass", [(15.21, 0.0), (15.02, 0.56), (14.52, 1.06), (13.9, 1.3), (13.89, 0.0)], segs=28, mat=glass, c=c)
    parts.append(nose)
    for s in (1, -1):
        w = wing(f"B29_Wing{s}", 3.6, 5.2, 1.9, 21.5, 0.75, sweep=1.4, dihedral=0.9, mat=alu, c=c, side=s, z=-0.2)
        parts.append(w)
        hs = wing(f"B29_HStab{s}", -11.6, 3.1, 1.3, 7.0, 0.32, sweep=0.7, dihedral=0.0, mat=alu, c=c, side=s, z=0.4)
        parts.append(hs)
        for k, yy in enumerate((4.9, 9.7)):
            na = lathe(f"B29_Nacelle{s}{k}", [(6.6, 0.0), (6.5, 0.55), (5.9, 0.78), (2.0, 0.7), (-0.6, 0.35), (-1.2, 0.0)], segs=18, mat=alu, c=c)
            na.location = (0, s * yy, 0.05)
            parts.append(na)
            hubp = Y.cyl(f"B29_Spinner{s}{k}", 0.25, 0.4, (6.75, s * yy, 0.05), (0, math.pi / 2, 0), mat=dark, c=c, verts=12)
            parts.append(hubp)
            for bl in range(4):
                blade = Y.box(f"B29_Blade{s}{k}{bl}", (0.05, 0.22, 2.0), (6.8, s * yy, 0.05), (math.radians(45 * bl + 20), 0, 0), mat=dark, c=c)
                blade.data.transform(Matrix.Translation((0, 0, 1.0)))
                parts.append(blade)
    # vertical tail (tall fin)
    vt = wing("B29_Fin", -10.0, 5.6, 1.9, 7.3, 0.35, sweep=3.0, mat=alu, c=c, side=1, z=0)
    vt.rotation_euler = (math.pi / 2, 0, 0)
    vt.location = (0, 0, 0.9)
    parts.append(vt)
    b = join(parts, "B29")
    b.scale = (1, 1, 1)
    return b


def parachute(name, c, mat=None):
    mat = mat or Y.mat_basic("M_Chute", (0.85, 0.83, 0.78, 1), rough=0.8, sss=0.1)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0)
    o = bpy.context.active_object
    o.name = name
    bm = bmesh.new(); bm.from_mesh(o.data)
    for v in [v for v in bm.verts if v.co.z < 0.05]:
        bm.verts.remove(v)
    bm.to_mesh(o.data); bm.free()
    o.scale = (1, 1, 0.55)
    Y.assign(o, mat)
    Y.smooth(o)
    sol = o.modifiers.new("solid", 'SOLIDIFY'); sol.thickness = 0.02
    pk = Y.box(name + "_pkg", (0.25, 0.25, 0.5), (0, 0, -2.0), mat=Y.mat_basic("M_ChutePkg", (0.3, 0.32, 0.3, 1), rough=0.5, metal=0.5))
    pk.parent = o
    Y.link_to(o, c); Y.link_to(pk, c)
    return o


# ------------------------------------------------------------------ steam locomotive
def build_locomotive(c, name="D51"):
    black = Y.mat_basic("M_LocoBlack", (0.018, 0.018, 0.02, 1), rough=0.38, metal=0.6)
    red = Y.mat_basic("M_LocoRed", (0.32, 0.03, 0.02, 1), rough=0.5, metal=0.3)
    steel = Y.mat_basic("M_LocoSteel", (0.45, 0.45, 0.45, 1), rough=0.3, metal=1.0)
    brass = Y.mat_basic("M_LocoBrass", (0.75, 0.55, 0.2, 1), rough=0.3, metal=1.0)
    glass = Y.mat_basic("M_LocoLamp", (1, 0.9, 0.7, 1), rough=0.1, emission=(1, 0.85, 0.6, 1), estr=4)
    P = []
    # Japanese narrow gauge 1067 mm; loco length ~19.7 m incl tender; boiler centre ~2.45 m
    boiler = Y.cyl(name + "_Boiler", 0.85, 8.2, (1.3, 0, 2.45), (0, math.pi / 2, 0), mat=black, verts=32); P.append(boiler)
    smoke = Y.cyl(name + "_Smokebox", 0.9, 1.6, (6.1, 0, 2.45), (0, math.pi / 2, 0), mat=black, verts=32); P.append(smoke)
    door = Y.cyl(name + "_SmokeDoor", 0.82, 0.12, (6.95, 0, 2.45), (0, math.pi / 2, 0), mat=black, verts=32); P.append(door)
    hub = Y.cyl(name + "_DoorHub", 0.12, 0.1, (7.03, 0, 2.45), (0, math.pi / 2, 0), mat=steel, verts=12); P.append(hub)
    lamp = Y.cyl(name + "_Headlamp", 0.2, 0.35, (6.7, 0, 3.55), (0, math.pi / 2, 0), mat=black, verts=16); P.append(lamp)
    lampg = Y.cyl(name + "_HeadlampGlass", 0.16, 0.03, (6.88, 0, 3.55), (0, math.pi / 2, 0), mat=glass, verts=16)
    chim = Y.cyl(name + "_Chimney", 0.28, 0.6, (5.9, 0, 3.55), mat=black, verts=20); P.append(chim)
    # D51 "namekuji" long dome
    dome = Y.box(name + "_Dome", (3.2, 0.7, 0.55), (3.2, 0, 3.35), mat=black, bevel=0.25); P.append(dome)
    # smoke deflectors
    for s in (1, -1):
        P.append(Y.box(name + f"_Deflector{s}", (2.0, 0.04, 1.3), (5.9, s * 1.25, 2.75), mat=black))
        P.append(Y.box(name + f"_Runboard{s}", (9.5, 0.45, 0.05), (1.7, s * 1.15, 1.62), mat=black))
        P.append(Y.cyl(name + f"_Cylinder{s}", 0.36, 1.3, (5.4, s * 1.05, 1.2), (0, math.pi / 2, 0), mat=black, verts=20))
    # frame
    P.append(Y.box(name + "_Frame", (11.0, 1.1, 0.6), (1.2, 0, 1.15), mat=red))
    P.append(Y.box(name + "_Buffer", (0.25, 2.6, 0.45), (7.1, 0, 0.95), mat=red))
    # cab
    cab = Y.box(name + "_Cab", (2.4, 2.75, 2.2), (-3.6, 0, 2.75), mat=black); P.append(cab)
    P.append(Y.box(name + "_CabRoof", (2.9, 2.95, 0.12), (-3.6, 0, 3.92), mat=black, bevel=0.05))
    for s in (1, -1):
        P.append(Y.box(name + f"_CabWin{s}", (0.8, 0.02, 0.6), (-3.3, s * 1.385, 3.2), mat=Y.mat_basic("M_CabWin", (0.02, 0.02, 0.02, 1), rough=0.1)))
    # pipes / handrails
    for s in (1, -1):
        P.append(Y.cyl(name + f"_Rail{s}", 0.025, 8.0, (1.6, s * 0.92, 2.9), (0, math.pi / 2, 0), mat=steel, verts=8))
    loco = join(P, name + "_Body")
    Y.smooth(loco, 35)
    # wheels (separate so they can rotate): 1 pony + 4 drivers (1.4 m) + 1 trailing
    wheels = []
    def wheel(nm, x, r):
        for s in (1, -1):
            w = Y.cyl(nm + f"_{s}", r, 0.14, (x, s * 0.62, r), (math.pi / 2, 0, 0), mat=red, verts=28)
            rim = Y.cyl(nm + f"_tyre{s}", r, 0.15, (x, s * 0.62, r), (math.pi / 2, 0, 0), mat=steel, verts=28)
            rim.scale = (1, 1, 1)
            inner = Y.cyl(nm + f"_hub{s}", r * 0.82, 0.17, (x, s * 0.62, r), (math.pi / 2, 0, 0), mat=red, verts=28)
            ww = join([w, rim, inner], nm + f"_W{s}")
            wheels.append(ww)
    wheel(name + "_Pony", 5.6, 0.43)
    for i, x in enumerate((4.2, 2.6, 1.0, -0.6)):
        wheel(name + f"_Drv{i}", x, 0.7)
    wheel(name + "_Trail", -2.6, 0.43)
    # side rods
    rods = []
    for s in (1, -1):
        rods.append(Y.box(name + f"_Rod{s}", (4.9, 0.05, 0.12), (1.8, s * 0.75, 0.7), mat=steel))
    # tender
    T = []
    T.append(Y.box(name + "_Tender", (7.0, 2.7, 2.1), (-8.4, 0, 2.15), mat=black, bevel=0.06))
    T.append(Y.box(name + "_Coal", (5.0, 2.3, 0.5), (-7.6, 0, 3.3), mat=Y.mat_basic("M_Coal", (0.01, 0.01, 0.01, 1), rough=0.9)))
    T.append(Y.box(name + "_TenderFrame", (7.2, 1.1, 0.5), (-8.4, 0, 0.95), mat=red))
    tender = join(T, name + "_TenderBody")
    for i, x in enumerate((-5.9, -7.1, -9.7, -10.9)):
        wheel(name + f"_TW{i}", x, 0.43)
    root = bpy.data.objects.new(name, None)
    c.objects.link(root)
    for o in [loco, tender, lampg] + wheels + rods:
        Y.link_to(o, c)
        o.parent = root
    root["wheels"] = [w.name for w in wheels]
    return root


def build_coach(c, name="Coach"):
    body = Y.mat_basic("M_CoachGrape", (0.07, 0.035, 0.03, 1), rough=0.45, metal=0.1)
    roof = Y.mat_basic("M_CoachRoof", (0.06, 0.06, 0.06, 1), rough=0.8)
    win = Y.mat_basic("M_CoachWin", (0.6, 0.45, 0.25, 1), rough=0.2, emission=(1, 0.75, 0.4, 1), estr=0.0)
    red = bpy.data.materials["M_LocoRed"] if "M_LocoRed" in bpy.data.materials else body
    P = [Y.box(name + "_Body", (19.5, 2.85, 2.5), (0, 0, 2.23), mat=body, bevel=0.05)]
    # arched clerestory-less roof: extrude an arc profile along X
    me = bpy.data.meshes.new(name + "_Roof")
    bm = bmesh.new()
    arc = [(math.cos(math.radians(a)) * 1.47, math.sin(math.radians(a)) * 0.38) for a in range(0, 181, 15)]
    rows = []
    for x in (-9.8, 9.8):
        rows.append([bm.verts.new((x, yy, 3.48 + zz)) for yy, zz in arc])
    for i in range(len(arc) - 1):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.faces.new(rows[0][::-1]); bm.faces.new(rows[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    r = bpy.data.objects.new(name + "_Roof", me); bpy.context.scene.collection.objects.link(r)
    Y.smooth(r, 30); Y.assign(r, roof)
    P.append(r)
    for s in (1, -1):
        for i in range(12):
            P.append(Y.box(name + f"_W{s}{i}", (0.8, 0.02, 0.75), (-8.0 + i * 1.45, s * 1.43, 2.65), mat=win))
    P.append(Y.box(name + "_Under", (17.0, 1.2, 0.5), (0, 0, 0.75), mat=Y.mat_basic("M_CoachUnder", (0.02, 0.02, 0.02, 1), rough=0.8)))
    for x in (-7.5, -6.0, 6.0, 7.5):
        for s in (1, -1):
            P.append(Y.cyl(name + f"_Wh{x}{s}", 0.43, 0.12, (x, s * 0.62, 0.43), (math.pi / 2, 0, 0), mat=red, verts=20))
    o = join(P, name)
    Y.link_to(o, c)
    return o


# ------------------------------------------------------------------ streetcar
def build_streetcar(c, name="Streetcar"):
    green = Y.mat_basic("M_TramGreen", (0.05, 0.16, 0.08, 1), rough=0.45)
    cream = Y.mat_basic("M_TramCream", (0.72, 0.66, 0.5, 1), rough=0.5)
    dark = Y.mat_basic("M_TramDark", (0.03, 0.03, 0.03, 1), rough=0.6)
    win = Y.mat_basic("M_TramWin", (0.08, 0.1, 0.1, 1), rough=0.05, metal=0.3)
    P = []
    L, W = 13.0, 2.4
    P.append(Y.box(name + "_Lower", (L, W, 1.15), (0, 0, 1.05), mat=green, bevel=0.06))
    P.append(Y.box(name + "_Upper", (L, W - 0.04, 1.25), (0, 0, 2.25), mat=cream, bevel=0.04))
    P.append(Y.box(name + "_Roof", (L + 0.1, W + 0.1, 0.18), (0, 0, 2.95), mat=dark, bevel=0.08))
    P.append(Y.box(name + "_Clere", (L - 3, 1.2, 0.2), (0, 0, 3.12), mat=dark, bevel=0.04))
    for s in (1, -1):
        for i in range(8):
            P.append(Y.box(name + f"_Win{s}{i}", (1.05, 0.02, 0.85), (-5.0 + i * 1.42, s * (W / 2 + 0.005), 2.3), mat=win))
    for e in (1, -1):
        for k in (-0.6, 0.0, 0.6):
            P.append(Y.box(name + f"_EndWin{e}{k}", (0.02, 0.5, 0.8), (e * (L / 2 + 0.005), k, 2.3), mat=win))
    P.append(Y.box(name + "_Truck1", (2.2, 1.6, 0.5), (4.0, 0, 0.35), mat=dark))
    P.append(Y.box(name + "_Truck2", (2.2, 1.6, 0.5), (-4.0, 0, 0.35), mat=dark))
    pole = Y.cyl(name + "_Pole", 0.03, 5.0, (-2.0, 0, 4.4), (0, math.radians(62), 0), mat=dark, verts=8); P.append(pole)
    o = join(P, name)
    Y.link_to(o, c)
    return o


# ------------------------------------------------------------------ giant cantilever crane (Nagasaki 1909)
def build_hammerhead_crane(c, name="CantileverCrane"):
    steel = Y.mat_basic("M_CraneSteel", (0.12, 0.11, 0.1, 1), rough=0.7, metal=0.6)
    P = []
    # lattice tower ~ 40 m with boom ~ 75 m (approximate silhouette)
    H = 40
    for sx in (1, -1):
        for sy in (1, -1):
            P.append(Y.box(name + f"_Leg{sx}{sy}", (0.6, 0.6, H), (sx * 4, sy * 4, H / 2), mat=steel))
    for z in range(4, H, 4):
        for s in (1, -1):
            b = Y.box(name + f"_BrX{z}{s}", (8.0, 0.3, 0.3), (0, s * 4, z), mat=steel)
            b2 = Y.box(name + f"_BrY{z}{s}", (0.3, 8.0, 0.3), (s * 4, 0, z), mat=steel)
            d = Y.box(name + f"_Dg{z}{s}", (11.3, 0.2, 0.2), (0, s * 4, z - 2), (0, math.radians(26), 0), mat=steel)
            d2 = Y.box(name + f"_Dh{z}{s}", (0.2, 11.3, 0.2), (s * 4, 0, z - 2), (math.radians(26), 0, 0), mat=steel)
            P += [b, b2, d, d2]
    P.append(Y.box(name + "_Boom", (75, 5, 5), (12, 0, H + 3), mat=steel))
    P.append(Y.box(name + "_Cab", (6, 6, 4), (0, 0, H + 7.5), mat=steel))
    o = join(P, name)
    Y.link_to(o, c)
    return o
