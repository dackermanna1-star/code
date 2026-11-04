"""1940s Japanese urban architecture: machiya rows, tile roofs, lattice fronts, wartime details.

Reference notes: two-storey timber townhouses (machiya / nagaya) with dark cedar board walls, plaster
upper storeys, grey kawara tile roofs with deep eaves and a lower 'hisashi' eave; koshi lattice fronts;
anti-shatter paper tape crosses on glass; fire-defence water tanks (boka-sui) and bucket racks outside;
wooden utility poles. No signage text is invented.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
import ylib as Y


def M():
    return {
        "cedar": Y.mat_pbr("M_Cedar", "japanese_cedar_planks", scale=0.6, tint=(0.42, 0.33, 0.27, 1), hue_var=0.25, dirt=0.4),
        "cedar_dark": Y.mat_pbr("M_CedarDark", "japanese_cedar_planks", scale=0.6, tint=(0.16, 0.12, 0.1, 1), hue_var=0.3, dirt=0.3),
        "plaster": Y.mat_pbr("M_Plaster", "plastered_wall", scale=0.5, tint=(0.86, 0.82, 0.74, 1), hue_var=0.12, dirt=0.5),
        "roof": Y.mat_pbr("M_RoofTile", "grey_roof_tiles", scale=0.55, tint=(0.2, 0.21, 0.24, 1), hue_var=0.15, bump=1.0, dirt=0.3),
        "ridge": Y.mat_basic("M_Ridge", (0.07, 0.075, 0.085, 1), rough=0.45),
        "lattice": Y.mat_pbr("M_Lattice", "hinoki_planks", scale=2.0, tint=(0.32, 0.22, 0.15, 1)),
        "glass": Y.mat_basic("M_WinGlass", (0.06, 0.07, 0.07, 1), rough=0.08, metal=0.1),
        "shoji": Y.mat_basic("M_Shoji", (0.92, 0.88, 0.78, 1), rough=0.9, sss=0.15),
        "tape": Y.mat_basic("M_Tape", (0.85, 0.82, 0.72, 1), rough=0.9),
        "stone": Y.mat_pbr("M_StoneBase", "japanese_stone_wall", scale=0.7, tint=(0.7, 0.7, 0.68, 1)),
        "noren": Y.mat_basic("M_Noren", (0.035, 0.06, 0.13, 1), rough=0.95),
        "concrete": Y.mat_pbr("M_TankConcrete", "concrete_wall_003", scale=0.8),
        "bucket": Y.mat_basic("M_BucketWood", (0.35, 0.25, 0.15, 1), rough=0.8),
    }


def _join(objs, name):
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


def gable_roof(name, w, d, z, pitch=0.45, over=0.55, mat=None, ridge_mat=None, hip=False, lean=False):
    """Roof along X (width w), slopes to front/back (depth d). Returns list of objects."""
    hw, hd = w / 2 + over, d / 2 + over
    h = hd * pitch
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    t = 0.12
    if lean:
        hw2 = w / 2 + over
        vs = [(-hw2, -d / 2, z), (hw2, -d / 2, z), (hw2, d / 2, z + d * pitch), (-hw2, d / 2, z + d * pitch)]
        V = [bm.verts.new(v) for v in vs]
        bm.faces.new(V)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        sm = o.modifiers.new("solid", 'SOLIDIFY'); sm.thickness = t
        Y.assign(o, mat)
        return [o]
    if not hip:
        vs = [(-hw, -hd, z), (hw, -hd, z), (hw, 0, z + h), (-hw, 0, z + h), (-hw, hd, z), (hw, hd, z)]
        V = [bm.verts.new(v) for v in vs]
        Vt = [bm.verts.new((v[0], v[1], v[2] + t)) for v in vs]
        for q in ((0, 1, 2, 3), (3, 2, 5, 4)):
            bm.faces.new([Vt[i] for i in q])
            bm.faces.new([V[i] for i in q][::-1])
        for a, b in ((0, 1), (1, 2), (2, 5), (5, 4), (4, 3), (3, 0)):
            pass
        for a, b in ((0, 1), (4, 5)):
            bm.faces.new((V[a], V[b], Vt[b], Vt[a]))
        for a, b in ((1, 2), (2, 5), (4, 3), (3, 0)):
            bm.faces.new((V[a], V[b], Vt[b], Vt[a]))
    else:
        rl = max(hw - hd, 0.2)
        vs = [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-rl, 0, z + h), (rl, 0, z + h)]
        V = [bm.verts.new(v) for v in vs]
        bm.faces.new((V[0], V[1], V[5], V[4]))
        bm.faces.new((V[2], V[3], V[4], V[5]))
        bm.faces.new((V[1], V[2], V[5]))
        bm.faces.new((V[3], V[0], V[4]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if hip:
        s = o.modifiers.new("solid", 'SOLIDIFY'); s.thickness = t
    Y.assign(o, mat)
    out = [o]
    rl = hw if not hip else max(hw - hd, 0.2)
    r = Y.box(name + "_Ridge", (rl * 2 + 0.1, 0.32, 0.28), (0, 0, z + h + 0.16), mat=ridge_mat, bevel=0.05)
    out.append(r)
    for s in (-1, 1):  # onigawara end caps
        if not hip:
            out.append(Y.box(name + f"_Oni{s}", (0.12, 0.45, 0.5), (s * (hw + 0.02), 0, z + h + 0.12), mat=ridge_mat))
    return out


def machiya(name, w=5.4, d=8.0, floors=2, rng=None, mats=None, shop=False, damaged=0.0, tape=True):
    """Build a townhouse facing -Y (street side). Origin at front-centre ground."""
    rng = rng or random.Random(1)
    m = mats or M()
    P = []
    h1 = 3.0 + rng.uniform(-0.1, 0.2)
    h2 = 2.6 + rng.uniform(-0.1, 0.25) if floors == 2 else 0
    # stone footing
    P.append(Y.box(name + "_Foot", (w, d, 0.35), (0, d / 2, 0.175), mat=m["stone"]))
    # ground floor walls (boards)
    gf = Y.box(name + "_GF", (w - 0.1, d - 0.2, h1), (0, d / 2, 0.35 + h1 / 2), mat=m["cedar_dark" if rng.random() < 0.6 else "cedar"])
    P.append(gf)
    # posts
    for x in (-w / 2 + 0.08, w / 2 - 0.08):
        P.append(Y.box(name + f"_Post{x:.1f}", (0.16, 0.16, h1 + h2 + 0.2), (x, -0.02, 0.35 + (h1 + h2) / 2), mat=m["lattice"]))
    # front: lattice (koshi) or shop with noren
    if shop:
        P.append(Y.box(name + "_ShopOpen", (w - 0.6, 0.05, h1 - 0.5), (0, -0.04, 0.35 + (h1 - 0.5) / 2), mat=Y.mat_basic("M_ShopDark", (0.02, 0.018, 0.015, 1), rough=0.9)))
        nn = rng.randint(3, 4)
        for i in range(nn):
            nw = (w - 0.8) / nn
            P.append(Y.box(name + f"_Noren{i}", (nw - 0.05, 0.02, 0.9), (-w / 2 + 0.4 + nw * (i + 0.5), -0.12, 0.35 + h1 - 0.9), mat=m["noren"]))
    else:
        n = int((w - 0.6) / 0.07)
        for i in range(0, n, 2):
            x = -w / 2 + 0.3 + i * 0.07
            P.append(Y.box(name + f"_Koshi{i}", (0.035, 0.05, h1 - 0.4), (x, -0.06, 0.35 + (h1 - 0.4) / 2 + 0.05), mat=m["lattice"]))
        P.append(Y.box(name + "_KoshiRail", (w - 0.5, 0.06, 0.06), (0, -0.07, 0.35 + h1 - 0.3), mat=m["lattice"]))
        P.append(Y.box(name + "_KoshiBack", (w - 0.55, 0.02, h1 - 0.4), (0, 0.0, 0.35 + (h1 - 0.4) / 2 + 0.05), mat=m["shoji"]))
    # lower eave (hisashi) between floors
    if floors == 2:
        hs = gable_roof(name + "_Hisashi", w, 1.6, 0.35 + h1 - 0.05, pitch=0.4, over=0.1, mat=m["roof"], ridge_mat=m["ridge"], lean=True)
        for o in hs:
            o.location.y -= 0.35
        P += hs
        # second floor
        sf = Y.box(name + "_SF", (w - 0.1, d - 1.2, h2), (0, d / 2 + 0.5, 0.35 + h1 + h2 / 2), mat=m["plaster"])
        P.append(sf)
        # upper windows: wooden lattice / glass with tape crosses
        nwin = 2 if w < 6 else 3
        for i in range(nwin):
            x = -w / 2 + w * (i + 0.5) / nwin
            ww, wh = min(1.3, w / nwin - 0.4), 1.0
            zc = 0.35 + h1 + h2 * 0.55
            y0 = 0.5 - 0.06
            P.append(Y.box(name + f"_UWin{i}", (ww, 0.05, wh), (x, y0, zc), mat=m["glass"]))
            P.append(Y.box(name + f"_UWinFr{i}", (ww + 0.12, 0.08, 0.07), (x, y0 - 0.02, zc + wh / 2), mat=m["lattice"]))
            P.append(Y.box(name + f"_UWinFb{i}", (ww + 0.12, 0.08, 0.07), (x, y0 - 0.02, zc - wh / 2), mat=m["lattice"]))
            for k in range(1, 4):
                P.append(Y.box(name + f"_UWinM{i}{k}", (0.03, 0.06, wh), (x - ww / 2 + ww * k / 4, y0 - 0.02, zc), mat=m["lattice"]))
            if tape and rng.random() < 0.8:
                diag = math.hypot(ww, wh)
                ang = math.atan2(wh, ww)
                for sgn in (1, -1):
                    P.append(Y.box(name + f"_Tape{i}{sgn}", (diag * 0.95, 0.012, 0.035), (x, y0 - 0.045, zc), (0, sgn * ang, 0), mat=m["tape"]))
        top = 0.35 + h1 + h2
        rd = d - 1.2
        rf = gable_roof(name + "_Roof", w, rd, top, pitch=0.5, over=0.6, mat=m["roof"], ridge_mat=m["ridge"], hip=rng.random() < 0.15)
        for o in rf:
            o.location.y += d / 2 + 0.5
        P += rf
    else:
        top = 0.35 + h1
        rf = gable_roof(name + "_Roof", w, d, top, pitch=0.5, over=0.6, mat=m["roof"], ridge_mat=m["ridge"])
        for o in rf:
            o.location.y += d / 2
        P += rf
    # rain gutter
    P.append(Y.cyl(name + "_Gutter", 0.06, w + 1.0, (0, -0.65 if floors == 2 else -0.55, 0.35 + h1 - 0.15 if floors == 2 else top - 0.05), (0, math.pi / 2, 0), mat=Y.mat_basic("M_Gutter", (0.15, 0.14, 0.12, 1), rough=0.6, metal=0.5), verts=8))
    o = _join(P, name)
    if damaged > 0:
        damage(o, damaged, rng)
    return o


def damage(o, amount, rng):
    """Displace / tilt geometry for a blast-damaged look (used sparingly; no gore)."""
    o.rotation_euler.x += rng.uniform(-0.05, 0.05) * amount
    o.rotation_euler.y += rng.uniform(-0.12, 0.12) * amount
    md = o.modifiers.new("dmg", 'DISPLACE')
    tex = bpy.data.textures.new(o.name + "_dmgtex", 'CLOUDS')
    tex.noise_scale = 1.2
    md.texture = tex
    md.strength = 0.5 * amount
    md.texture_coords = 'GLOBAL'


def water_tank(name, mats=None):
    """Concrete fire-defence water tank (boka-sui) with buckets."""
    m = mats or M()
    P = [Y.box(name + "_Tank", (1.2, 0.6, 0.7), (0, 0, 0.35), mat=m["concrete"], bevel=0.03)]
    P.append(Y.box(name + "_Water", (1.08, 0.48, 0.02), (0, 0, 0.62), mat=Y.mat_basic("M_TankWater", (0.02, 0.03, 0.03, 1), rough=0.05)))
    for i in range(3):
        b = Y.cyl(name + f"_Bucket{i}", 0.14, 0.26, (-0.35 + i * 0.35, -0.45, 0.13), mat=m["bucket"], verts=12)
        P.append(b)
    return _join(P, name)


def utility_pole(name, h=8.5, mats=None):
    wood = Y.mat_pbr("M_PoleWood", "dark_planks", scale=1.5, tint=(0.35, 0.3, 0.25, 1))
    P = [Y.cyl(name + "_Pole", 0.13, h, (0, 0, h / 2), mat=wood, verts=10)]
    for k, z in enumerate((h - 0.4, h - 1.1)):
        P.append(Y.box(name + f"_Arm{k}", (1.6, 0.1, 0.1), (0, 0, z), mat=wood))
        for x in (-0.65, -0.25, 0.25, 0.65):
            P.append(Y.cyl(name + f"_Ins{k}{x}", 0.04, 0.12, (x, 0, z + 0.1), mat=Y.mat_basic("M_Insulator", (0.85, 0.85, 0.82, 1), rough=0.2), verts=8))
    return _join(P, name)


def wire(name, a, b, sag=0.6, mat=None, segs=12):
    """Catenary-ish wire between two points as a curve."""
    cd = bpy.data.curves.new(name, 'CURVE')
    cd.dimensions = '3D'
    cd.bevel_depth = 0.012
    sp = cd.splines.new('POLY')
    sp.points.add(segs)
    A, B = Vector(a), Vector(b)
    for i in range(segs + 1):
        t = i / segs
        p = A.lerp(B, t)
        p.z -= sag * 4 * t * (1 - t)
        sp.points[i].co = (p.x, p.y, p.z, 1)
    o = bpy.data.objects.new(name, cd)
    bpy.context.scene.collection.objects.link(o)
    cd.materials.append(mat or Y.mat_basic("M_Wire", (0.02, 0.02, 0.02, 1), rough=0.5))
    return o


def mountains(name, dist=900, height=140, width=3000, seed=3, mat=None):
    """Distant hills ring (Hiroshima/Nagasaki are surrounded by hills)."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=160, y_subdivisions=6, size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (width, 200, 1)
    bpy.ops.object.transform_apply(scale=True)
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6) for _ in range(4)]
    for v in o.data.vertices:
        x = v.co.x
        prof = (0.55 + 0.25 * math.sin(x / 210 + ph[0]) + 0.15 * math.sin(x / 77 + ph[1]) + 0.07 * math.sin(x / 31 + ph[2]))
        t = (v.co.y + 100) / 200
        v.co.z = height * prof * math.sin(math.pi * min(max(t, 0), 1)) ** 0.7
    o.location.y = dist
    Y.smooth(o)
    Y.assign(o, mat or Y.mat_basic("M_Hills", (0.12, 0.16, 0.12, 1), rough=0.9))
    return o
