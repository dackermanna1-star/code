#!/usr/bin/env python3
"""Build the walking-simulator character from MakeHuman CC0 data.

Inputs (not committed, downloaded separately - see tools/README.md):
  --mpfb   path to an MPFB2 checkout's  src/mpfb/data  directory
           (base mesh hm08, modelling targets, game-engine rig + weights)
  --assets path holding extracted MakeHuman asset packs
           (makehuman_system_assets_cc0, skins01_cc0, hair01_cc0, ...)

Outputs (committed):
  public/assets/character.glb   skinned body (+ eyes, brows, lashes)
  public/assets/hair/<id>.glb   skinned hair meshes using the same skeleton
  public/assets/character.json  skeleton + anatomical landmarks for the runtime

The skeleton is exported with *identity rest orientations*: every bone's rest
frame is aligned with the character frame (X = character's left, Y = up,
Z = forward).  That makes procedural animation much simpler - joint rotations
are expressed directly in anatomical axes.
"""
import argparse
import gzip
import io
import json
import os
import sys

import numpy as np
import scipy.sparse as sp
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from glb import GLBWriter, FLOAT, UBYTE  # noqa: E402

SCALE = 0.1  # MakeHuman units are decimetres

# ----------------------------------------------------------------------------
# Body shape: an adult woman (~25 years), slim-average build, ideal proportions.
# Weights follow MakeHuman's macro-modifier interpolation scheme.
# ----------------------------------------------------------------------------
BODY_TARGETS = {
    "macrodetails/caucasian-female-young": 1.0,
    # weight 0.42 / muscle 0.56 (slightly slim and toned)
    "macrodetails/universal-female-young-averagemuscle-minweight": 0.16 * 0.88,
    "macrodetails/universal-female-young-maxmuscle-averageweight": 0.12 * 0.84,
    "macrodetails/universal-female-young-maxmuscle-minweight": 0.12 * 0.16,
    "macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions": 1.0,
    "macrodetails/height/female-young-averagemuscle-averageweight-maxheight": 0.12,
    "breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness": 0.18,
    "breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness": 0.45,
}
# Additional fine shaping modifiers ("name": weight); missing ones are skipped.
DETAIL_TARGETS = {
    "torso/torso-scale-horiz-decr": 0.10,
    "hip/hip-waist-down": 0.0,
    "stomach/stomach-pregnant-decr": 0.35,
    "buttocks/buttocks-volume-incr": 0.25,
    "neck/neck-scale-horiz-decr": 0.2,
    "legs/upperlegs-height-incr": 0.15,
    "legs/lowerlegs-height-incr": 0.15,
}


# ============================================================================
# File parsing
# ============================================================================
def parse_obj(path):
    V, VT, F, FT, FG = [], [], [], [], []
    group = None
    with open(path) as fh:
        for line in fh:
            if line.startswith("v "):
                V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                VT.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("f "):
                vi, ti = [], []
                for p in line.split()[1:]:
                    s = p.split("/")
                    vi.append(int(s[0]) - 1)
                    ti.append(int(s[1]) - 1 if len(s) > 1 and s[1] else -1)
                F.append(vi)
                FT.append(ti)
                FG.append(group)
            elif line.startswith("g "):
                group = line.split(None, 1)[1].strip()
    return np.array(V, float), (np.array(VT, float) if VT else None), F, FT, FG


def load_target(tdir, name):
    path = os.path.join(tdir, name + ".target.gz")
    if not os.path.exists(path):
        print("  ! missing target", name)
        return None, None
    idx, d = [], []
    with gzip.open(path, "rt") as fh:
        for line in fh:
            s = line.split()
            if not s or s[0].startswith("#"):
                continue
            idx.append(int(s[0]))
            d.append([float(s[1]), float(s[2]), float(s[3])])
    return np.array(idx, int), np.array(d, float).reshape(-1, 3)


def load_mhclo(path):
    info = {"refs": [], "scales": {}, "delete": [], "obj": None, "material": None}
    mode = None
    with open(path) as fh:
        for line in fh:
            s = line.split()
            if not s or s[0].startswith("#"):
                continue
            key = s[0]
            if key == "obj_file":
                info["obj"] = s[1]
            elif key in ("x_scale", "y_scale", "z_scale"):
                info["scales"]["xyz".index(key[0])] = (int(s[1]), int(s[2]), float(s[3]))
            elif key == "material":
                info["material"] = s[1]
            elif key == "verts":
                mode = "verts"
            elif key == "delete_verts":
                mode = "delete"
            elif key[0].isdigit():
                if mode == "verts":
                    if len(s) == 1:
                        info["refs"].append(([int(s[0])] * 3, [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
                    else:
                        info["refs"].append(([int(s[0]), int(s[1]), int(s[2])],
                                             [float(s[3]), float(s[4]), float(s[5])],
                                             [float(s[6]), float(s[7]), float(s[8])]))
                elif mode == "delete":
                    for tok in s:
                        if "-" in tok:
                            a, b = tok.split("-")
                            info["delete"].extend(range(int(a), int(b) + 1))
                        else:
                            info["delete"].append(int(tok))
            else:
                mode = None if key not in ("verts", "delete_verts") else mode
    return info


def parse_mhmat(path):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path) as fh:
        for line in fh:
            s = line.split()
            if len(s) >= 2 and not s[0].startswith(("#", "//")):
                out[s[0]] = " ".join(s[1:])
    return out


# ============================================================================
# Geometry helpers
# ============================================================================
def fit_proxy(info, base_v):
    """Return proxy vertex positions (obj units) and the reference data."""
    refs = info["refs"]
    idx = np.array([r[0] for r in refs], int)
    w = np.array([r[1] for r in refs], float)
    off = np.array([r[2] for r in refs], float)
    scale = np.ones(3)
    for axis, (a, b, den) in info["scales"].items():
        scale[axis] = abs(base_v[a, axis] - base_v[b, axis]) / den
    pos = (base_v[idx] * w[:, :, None]).sum(axis=1) + off * scale
    return pos, idx, w


def triangulate(faces, face_uvs):
    tris, tuv = [], []
    for f, t in zip(faces, face_uvs):
        for i in range(1, len(f) - 1):
            tris.append([f[0], f[i], f[i + 1]])
            tuv.append([t[0], t[i], t[i + 1]])
    return np.array(tris, int), np.array(tuv, int)


def split_by_uv(tris, tuv, n_pos):
    """Create render vertices for each unique (position, uv) pair."""
    key = tris.reshape(-1).astype(np.int64) * (1 << 32) + tuv.reshape(-1).astype(np.int64)
    uniq, inv = np.unique(key, return_inverse=True)
    pos_idx = (uniq >> 32).astype(int)
    uv_idx = (uniq & 0xFFFFFFFF).astype(int)
    return pos_idx, uv_idx, inv.reshape(-1, 3)


def vertex_normals(pos, tris):
    n = np.zeros_like(pos)
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def catmull_clark(n_verts, faces, face_uvs, uvs):
    """One level of Catmull-Clark subdivision.

    Returns (S, new_faces, new_face_uvs, new_uvs) where S is a sparse matrix
    mapping old per-vertex data to new per-vertex data (positions, weights...).
    UVs are subdivided linearly (face-varying)."""
    edge_index = {}
    edges = []
    edge_faces = []
    for fi, f in enumerate(faces):
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            key = (a, b) if a < b else (b, a)
            e = edge_index.get(key)
            if e is None:
                e = len(edges)
                edge_index[key] = e
                edges.append(key)
                edge_faces.append([])
            edge_faces[e].append(fi)
    nV, nE, nF = n_verts, len(edges), len(faces)

    # face points
    r, c, v = [], [], []
    for fi, f in enumerate(faces):
        for vi in f:
            r.append(fi), c.append(vi), v.append(1.0 / len(f))
    FP = sp.csr_matrix((v, (r, c)), shape=(nF, nV))

    # edge points
    rv, cv, vv = [], [], []   # direct vertex contributions
    rf, cf, vf = [], [], []   # face-point contributions
    for e, (a, b) in enumerate(edges):
        fs = edge_faces[e]
        if len(fs) == 2:
            rv += [e, e]; cv += [a, b]; vv += [0.25, 0.25]
            rf += [e, e]; cf += fs; vf += [0.25, 0.25]
        else:
            rv += [e, e]; cv += [a, b]; vv += [0.5, 0.5]
    EP = sp.csr_matrix((vv, (rv, cv)), shape=(nE, nV)) + \
        sp.csr_matrix((vf, (rf, cf)), shape=(nE, nF)) @ FP

    # vertex points
    v_edges = [[] for _ in range(nV)]
    v_faces = [[] for _ in range(nV)]
    for e, (a, b) in enumerate(edges):
        v_edges[a].append(e)
        v_edges[b].append(e)
    for fi, f in enumerate(faces):
        for vi in f:
            v_faces[vi].append(fi)
    rv, cv, vv = [], [], []
    rf, cf, vf = [], [], []
    for p in range(nV):
        es = v_edges[p]
        if not es:
            rv.append(p); cv.append(p); vv.append(1.0)
            continue
        bnd = [e for e in es if len(edge_faces[e]) != 2]
        if not bnd:
            n = len(es)
            m = len(v_faces[p])
            rv.append(p); cv.append(p); vv.append((n - 2.0) / n)
            for e in es:
                a, b = edges[e]
                o = b if a == p else a
                rv.append(p); cv.append(o); vv.append(1.0 / (n * n))
            for fi in v_faces[p]:
                rf.append(p); cf.append(fi); vf.append(1.0 / (n * m))
        elif len(bnd) == 2:
            rv.append(p); cv.append(p); vv.append(0.75)
            for e in bnd:
                a, b = edges[e]
                o = b if a == p else a
                rv.append(p); cv.append(o); vv.append(0.125)
        else:
            rv.append(p); cv.append(p); vv.append(1.0)
    VP = sp.csr_matrix((vv, (rv, cv)), shape=(nV, nV)) + \
        sp.csr_matrix((vf, (rf, cf)), shape=(nV, nF)) @ FP
    S = sp.vstack([VP, EP, FP]).tocsr()

    # faces + face-varying uvs
    uv_keys = {}
    new_uvs = []

    def uv_id(key, value):
        i = uv_keys.get(key)
        if i is None:
            i = len(new_uvs)
            uv_keys[key] = i
            new_uvs.append(value)
        return i

    new_faces, new_fuv = [], []
    for fi, (f, t) in enumerate(zip(faces, face_uvs)):
        k = len(f)
        cuv = uvs[t].mean(axis=0)
        cid = uv_id(("f", fi), cuv)
        for i in range(k):
            a, b, pr = f[i], f[(i + 1) % k], f[(i - 1) % k]
            ta, tb, tp = t[i], t[(i + 1) % k], t[(i - 1) % k]
            e_next = edge_index[(a, b) if a < b else (b, a)]
            e_prev = edge_index[(pr, a) if pr < a else (a, pr)]
            uv_a = uv_id(("v", ta), uvs[ta])
            uv_n = uv_id(("e", min(ta, tb), max(ta, tb)), (uvs[ta] + uvs[tb]) * 0.5)
            uv_p = uv_id(("e", min(ta, tp), max(ta, tp)), (uvs[ta] + uvs[tp]) * 0.5)
            new_faces.append([a, nV + e_next, nV + nE + fi, nV + e_prev])
            new_fuv.append([uv_a, uv_n, cid, uv_p])
    return S, new_faces, new_fuv, np.array(new_uvs)


def top4(W):
    """Reduce dense weights (n x B) to 4 influences per vertex."""
    order = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, order, axis=1)
    w[w < 1e-4] = 0
    s = w.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    return order.astype(np.uint8), (w / s).astype(np.float32)


def encode_image(img, fmt="JPEG", quality=88):
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
        return buf.getvalue(), "image/jpeg"
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue(), "image/png"


# ============================================================================
# Main build
# ============================================================================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mpfb", required=True)
    ap.add_argument("--assets", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
    ap.add_argument("--no-subdiv", action="store_true")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(os.path.join(out, "hair"), exist_ok=True)
    sysa = os.path.join(args.assets, "makehuman_system_assets_cc0")

    print("loading base mesh")
    V0, VT, F, FT, FG = parse_obj(os.path.join(args.mpfb, "3dobjs", "base.obj"))
    groups = json.load(open(os.path.join(args.mpfb, "mesh_metadata", "basemesh_vertex_groups.json")))

    def group_verts(name):
        out_ = []
        for a, b in groups[name]:
            out_.extend(range(a, b + 1))
        return np.array(out_, int)

    # ---------------------------------------------------------------- targets
    V = V0.copy()
    tdir = os.path.join(args.mpfb, "targets")
    for name, w in list(BODY_TARGETS.items()) + list(DETAIL_TARGETS.items()):
        if w == 0:
            continue
        idx, d = load_target(tdir, name)
        if idx is not None:
            V[idx] += d * w
            print(f"  target {name} x{w:.3f} ({len(idx)} verts)")

    # Soften the bust surface (always covered by the base layer) so fabrics drape
    # over a rounded, bra-shaped contour rather than anatomical detail.
    V = soften_bust(V, F, group_verts)

    # expression morphs (blink / subtle smile)
    morph_D = {}
    for mname, lst in EXPRESSION_MORPHS.items():
        D = np.zeros_like(V)
        for tname, w in lst:
            idx, d = load_target(tdir, tname)
            if idx is not None:
                D[idx] += d * w
        morph_D[mname] = D

    # ---------------------------------------------------------------- skeleton
    rig = json.load(open(os.path.join(args.mpfb, "rigs", "standard", "rig.game_engine_with_breast.json")))
    wjs = json.load(open(os.path.join(args.mpfb, "rigs", "standard", "weights.game_engine_with_breast.json")))["weights"]

    def joint_pos(spec):
        st = spec["strategy"]
        if st == "CUBE":
            return V[group_verts(spec["cube_name"])].mean(axis=0)
        if st == "VERTEX":
            return V[spec["vertex_index"]].copy()
        if st == "MEAN":
            return V[spec["vertex_indices"]].mean(axis=0)
        raise ValueError(st)

    # order bones parent-first
    names = []
    pending = list(rig.keys())
    while pending:
        for n in list(pending):
            p = rig[n]["parent"]
            if not p or p in names:
                names.append(n)
                pending.remove(n)
    # keep a stable, readable order: Root first then BFS order
    bone_index = {n: i for i, n in enumerate(names)}
    heads = np.array([joint_pos(rig[n]["head"]) for n in names])
    tails = np.array([joint_pos(rig[n]["tail"]) for n in names])
    parents = [bone_index[rig[n]["parent"]] if rig[n]["parent"] else -1 for n in names]

    # ---------------------------------------------------------------- transform
    body_idx = group_verts("body")
    min_y = V[body_idx, 1].min()
    pelvis_z = heads[bone_index["pelvis"], 2]
    offset = np.array([0.0, min_y, pelvis_z])

    def to_world(p):
        return (p - offset) * SCALE

    heads_w = to_world(heads)
    heads_w[:, 0][np.abs(heads_w[:, 0]) < 1e-6] = 0.0
    tails_w = to_world(tails)
    heads_w[bone_index["Root"]] = [0, 0, 0]
    height = (V[body_idx, 1].max() - min_y) * SCALE
    print(f"  body height {height:.3f} m")

    # dense weights for all base vertices
    nB = len(names)
    W = np.zeros((len(V), nB))
    for bname, lst in wjs.items():
        if bname not in bone_index:
            continue
        bi = bone_index[bname]
        for vi, w in lst:
            W[vi, bi] += w
    s = W.sum(axis=1)
    missing = s < 1e-6
    W[missing, bone_index["head"]] = 1.0  # any unweighted helper -> head
    W /= W.sum(axis=1, keepdims=True)

    # ---------------------------------------------------------------- body mesh
    body_set = np.zeros(len(V), bool)
    body_set[body_idx] = True
    bfaces, bfuv = [], []
    for f, t, g in zip(F, FT, FG):
        if all(body_set[v] for v in f):
            bfaces.append(f)
            bfuv.append(t)
    print(f"  body faces {len(bfaces)}")

    # compact the body vertex set
    used = sorted({v for f in bfaces for v in f})
    remap = -np.ones(len(V), int)
    remap[used] = np.arange(len(used))
    bfaces_c = [[remap[v] for v in f] for f in bfaces]
    Vb = V[used]
    Wb = W[used]

    if not args.no_subdiv:
        print("  subdividing body")
        S, sfaces, sfuv, suv = catmull_clark(len(used), bfaces_c, bfuv, VT)
        Vs = S @ Vb
        Ws = S @ Wb
        Ds = {k: S @ D[used] for k, D in morph_D.items()}
        # base index for every subdivided vertex (for region lookups at runtime): use
        # strongest original contributor
        faces_final, fuv_final, uv_final = sfaces, sfuv, suv
    else:
        Vs, Ws = Vb, Wb
        Ds = {k: D[used] for k, D in morph_D.items()}
        faces_final, fuv_final, uv_final = bfaces_c, bfuv, VT

    tris, tuv = triangulate(faces_final, fuv_final)
    pos_idx, uv_idx, rtris = split_by_uv(tris, tuv, len(Vs))
    P = to_world(Vs)
    N_pos = vertex_normals(P, tris)
    body_pos = P[pos_idx]
    body_nrm = N_pos[pos_idx]
    body_uv = uv_final[uv_idx].copy()
    body_uv[:, 1] = 1.0 - body_uv[:, 1]
    bj, bw = top4(Ws[pos_idx])
    # "weld id": render vertices that share a position share an id - lets the runtime
    # build garments without UV seams tearing apart.
    weld = pos_idx.astype(np.uint32)
    print(f"  body render verts {len(body_pos)}  tris {len(rtris)}")

    # ---------------------------------------------------------------- skin texture
    skin_path = os.path.join(args.assets, "skins01_cc0", "skins", "toigo_light_skin_female_ginger_2",
                             "young_lightskinned_female_diffuse_Ginger2.png")
    skin = Image.open(skin_path).convert("RGB")
    skin = neutralize_skin(skin, V, VT, F, FT, body_set, group_verts)

    # ---------------------------------------------------------------- glb
    g = GLBWriter()
    skin_tex = g.image(*encode_image(skin, "JPEG", 90))
    m_body = g.material("Skin", texture=skin_tex, roughness=0.55,
                        extras={"kind": "skin"})

    # skeleton nodes
    joint_nodes = []
    for i, n in enumerate(names):
        p = parents[i]
        t = heads_w[i] - (heads_w[p] if p >= 0 else 0)
        joint_nodes.append(g.node(name=n, translation=[float(x) for x in t]))
    for i, p in enumerate(parents):
        if p >= 0:
            g.gltf["nodes"][joint_nodes[p]].setdefault("children", []).append(joint_nodes[i])
    ibm = np.tile(np.eye(4, dtype=np.float32), (nB, 1, 1))
    for i in range(nB):
        ibm[i, :3, 3] = -heads_w[i]
    ibm = ibm.transpose(0, 2, 1)  # column-major
    skin_idx = g.skin(joint_nodes, ibm, skeleton_root=joint_nodes[0])

    root_children = [joint_nodes[0]]
    mesh_nodes = []

    def add_skinned(name, pos, nrm, uv, j, w, idx, mat, extra=None, extras=None, morphs=None):
        mi = g.mesh(name, pos, idx, normals=nrm, uvs=uv, joints=j, weights=w,
                    material=mat, extra_attribs=extra, extras=extras, morphs=morphs)
        n = g.node(name=name, mesh=mi, skin=skin_idx)
        mesh_nodes.append(n)
        return n

    body_morphs = [(k, (Ds[k] * SCALE)[pos_idx]) for k in morph_D]
    add_skinned("Body", body_pos, body_nrm, body_uv, bj, bw, rtris, m_body,
                extra={"_WELD": (weld.astype(np.float32), FLOAT, False)}, morphs=body_morphs)

    # ---------------------------------------------------------------- proxies
    def build_proxy(mhclo_path, name, material, flip_v=True, inflate=0.0):
        info = load_mhclo(mhclo_path)
        pv, ridx, rw = fit_proxy(info, V)
        objp = os.path.join(os.path.dirname(mhclo_path), info["obj"])
        PV, PVT, PF, PFT, _ = parse_obj(objp)
        assert len(PV) == len(pv), (name, len(PV), len(pv))
        tris_, tuv_ = triangulate(PF, PFT)
        pidx, uidx, rt = split_by_uv(tris_, tuv_, len(pv))
        pw = to_world(pv)
        nrm = vertex_normals(pw, tris_)
        if inflate:
            pw = pw + nrm * inflate
        wts = (W[ridx] * rw[:, :, None]).sum(axis=1)
        j, w = top4(wts[pidx])
        uv = PVT[uidx].copy()
        if flip_v:
            uv[:, 1] = 1.0 - uv[:, 1]
        morphs = []
        for k, D in morph_D.items():
            pv2, _, _ = fit_proxy(info, V + D)
            dd = (pv2 - pv) * SCALE
            if np.abs(dd).max() > 1e-6:
                morphs.append((k, dd[pidx]))
        return dict(pos=pw[pidx], nrm=nrm[pidx], uv=uv, j=j, w=w, idx=rt, info=info, morphs=morphs,
                    mhmat=parse_mhmat(os.path.join(os.path.dirname(mhclo_path),
                                                   info["material"] or "")))

    # eyes
    eyes = build_proxy(os.path.join(sysa, "eyes", "high-poly", "high-poly.mhclo"), "Eyes", None)
    eye_img = Image.open(os.path.join(sysa, "eyes", "materials", "green_eye.png")).convert("RGB")
    m_eye = g.material("Eyes", texture=g.image(*encode_image(eye_img, "JPEG", 92)), roughness=0.05,
                       extras={"kind": "eye"})
    add_skinned("Eyes", eyes["pos"], eyes["nrm"], eyes["uv"], eyes["j"], eyes["w"], eyes["idx"], m_eye)

    # eyebrows - recoloured to a natural ginger/auburn brow
    brow_dir = os.path.join(sysa, "eyebrows", "eyebrow001")
    brows = build_proxy(os.path.join(brow_dir, "eyebrow001.mhclo"), "Eyebrows", None, inflate=0.0004)
    brow_img = Image.open(os.path.join(brow_dir, "eyebrow001.png")).convert("RGBA")
    brow_img = recolor_alpha_texture(brow_img, (150, 82, 48))
    m_brow = g.material("Eyebrows", texture=g.image(*encode_image(brow_img, "PNG")), roughness=0.8,
                        alpha_mode="BLEND", double_sided=True, extras={"kind": "brow"})
    add_skinned("Eyebrows", brows["pos"], brows["nrm"], brows["uv"], brows["j"], brows["w"], brows["idx"], m_brow,
                morphs=brows["morphs"])

    lash_dir = os.path.join(sysa, "eyelashes", "eyelashes02")
    if not os.path.exists(lash_dir):
        lash_dir = os.path.join(sysa, "eyelashes", "eyelashes01")
    lname = os.path.basename(lash_dir)
    lashes = build_proxy(os.path.join(lash_dir, lname + ".mhclo"), "Eyelashes", None)
    lash_img = Image.open(os.path.join(lash_dir, lname + ".png")).convert("RGBA")
    lash_img = recolor_alpha_texture(lash_img, (52, 30, 22))
    m_lash = g.material("Eyelashes", texture=g.image(*encode_image(lash_img, "PNG")), roughness=0.7,
                        alpha_mode="BLEND", double_sided=True, extras={"kind": "lash"})
    add_skinned("Eyelashes", lashes["pos"], lashes["nrm"], lashes["uv"], lashes["j"], lashes["w"],
                lashes["idx"], m_lash, morphs=lashes["morphs"])

    char_node = g.node(name="Character", children=root_children + mesh_nodes)
    g.gltf["scenes"][0]["nodes"] = [char_node]
    g.write(os.path.join(out, "character.glb"))
    print("  wrote character.glb", os.path.getsize(os.path.join(out, "character.glb")) // 1024, "KB")

    # ---------------------------------------------------------------- hair
    hair_list = []
    for hid, (pack, rel, label) in HAIR_STYLES.items():
        path = os.path.join(args.assets, pack, rel)
        if not os.path.exists(path):
            print("  ! hair missing", path)
            continue
        try:
            h = build_proxy(path, hid, None, inflate=0.0)
        except AssertionError as e:
            print("  ! hair failed", e)
            continue
        tex_name = h["mhmat"].get("diffuseTexture")
        tex_path = os.path.join(os.path.dirname(path), tex_name) if tex_name else None
        hg = GLBWriter()
        tex_idx = None
        if tex_path and os.path.exists(tex_path):
            img = Image.open(tex_path).convert("RGBA")
            img = hair_luminance_texture(img)
            tex_idx = hg.image(*encode_image(img, "PNG"))
        mat = hg.material("Hair_" + hid, texture=tex_idx, roughness=0.5, alpha_mode="BLEND",
                          double_sided=True, extras={"kind": "hair"})
        jn = []
        for i, n in enumerate(names):
            p = parents[i]
            t = heads_w[i] - (heads_w[p] if p >= 0 else 0)
            jn.append(hg.node(name=n, translation=[float(x) for x in t]))
        for i, p in enumerate(parents):
            if p >= 0:
                hg.gltf["nodes"][jn[p]].setdefault("children", []).append(jn[i])
        sk = hg.skin(jn, ibm, skeleton_root=jn[0])
        mi = hg.mesh("Hair_" + hid, h["pos"], h["idx"], normals=h["nrm"], uvs=h["uv"], joints=h["j"],
                     weights=h["w"], material=mat)
        mn = hg.node(name="Hair_" + hid, mesh=mi, skin=sk)
        cn = hg.node(name="HairRoot", children=[jn[0], mn])
        hg.gltf["scenes"][0]["nodes"] = [cn]
        fn = os.path.join(out, "hair", hid + ".glb")
        hg.write(fn)
        hair_list.append({"id": hid, "label": label, "file": "hair/" + hid + ".glb"})
        print(f"  hair {hid}: {len(h['pos'])} verts, {os.path.getsize(fn)//1024} KB")

    # ---------------------------------------------------------------- metadata
    meta = {
        "height": height,
        "bones": [{"name": n, "parent": names[parents[i]] if parents[i] >= 0 else None,
                   "head": [round(float(x), 5) for x in heads_w[i]],
                   "tail": [round(float(x), 5) for x in tails_w[i]]} for i, n in enumerate(names)],
        "landmarks": landmarks(to_world(V), W, bone_index, body_idx, heads_w),
        "hair": hair_list,
    }
    with open(os.path.join(out, "character.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print("done")


EXPRESSION_MORPHS = {
    "blink": [("expression/units/caucasian/eye-left-closure", 1.0),
              ("expression/units/caucasian/eye-right-closure", 1.0)],
    "smile": [("expression/units/caucasian/mouth-corner-puller", 0.6),
              ("expression/units/caucasian/eye-left-slit", 0.15),
              ("expression/units/caucasian/eye-right-slit", 0.15)],
}

HAIR_STYLES = {
    # id: (pack dir, mhclo path relative to pack, label)
    "long": ("makehuman_system_assets_cc0", "hair/long01/long01.mhclo", "Long & loose"),
    "ponytail": ("makehuman_system_assets_cc0", "hair/ponytail01/ponytail01.mhclo", "Ponytail"),
    "bob": ("makehuman_system_assets_cc0", "hair/bob02/bob02.mhclo", "Bob"),
    "braid": ("makehuman_system_assets_cc0", "hair/braid01/braid01.mhclo", "Braid"),
}


def soften_bust(V, F, group_verts):
    body = set(group_verts("body").tolist())
    adj = {}
    for f in F:
        if not all(v in body for v in f):
            continue
        k = len(f)
        for i in range(k):
            a, b = f[i], f[(i + 1) % k]
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
    tip_l = V[8451].copy()
    bidx = np.array(sorted(body))
    d = np.linalg.norm(V[bidx] - np.array([-tip_l[0], tip_l[1], tip_l[2]]), axis=1)
    tip_r = V[bidx[int(np.argmin(d))]].copy()
    W = np.zeros(len(V))
    for tip in (tip_l, tip_r):
        dd = np.linalg.norm(V - tip, axis=1)
        W = np.maximum(W, np.clip(1.0 - dd / 0.42, 0, 1) ** 1.2)  # 4.2 cm radius (dm units)
    W[[i for i in range(len(V)) if i not in body]] = 0
    idx = np.where(W > 0)[0]
    V = V.copy()
    for _ in range(70):
        Vn = V.copy()
        for i in idx:
            nb = list(adj.get(i, ()))
            if not nb:
                continue
            avg = V[nb].mean(axis=0)
            Vn[i] = V[i] + (avg - V[i]) * 0.8 * W[i]
        V = Vn
    print(f"  softened bust ({len(idx)} verts)")
    return V


def recolor_alpha_texture(img, rgb):
    a = np.asarray(img).astype(np.float32)
    lum = a[..., :3].mean(axis=2) / 255.0
    outa = np.zeros_like(a)
    shade = 0.75 + 0.5 * (lum - lum.mean())
    for c in range(3):
        outa[..., c] = np.clip(rgb[c] * shade, 0, 255)
    outa[..., 3] = a[..., 3]
    return Image.fromarray(outa.astype(np.uint8), "RGBA")


def hair_luminance_texture(img):
    """Convert a coloured hair texture to normalised luminance (colour applied in shader)."""
    a = np.asarray(img).astype(np.float32)
    lum = 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    mask = a[..., 3] > 32
    if mask.any():
        lo, hi = np.percentile(lum[mask], 2), np.percentile(lum[mask], 98)
        lum = np.clip((lum - lo) / max(hi - lo, 1) * 200 + 40, 0, 255)
    out = np.stack([lum, lum, lum, a[..., 3]], axis=2).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def neutralize_skin(skin, V, VT, F, FT, body_set, group_verts):
    """Soften anatomical detail in regions that are always covered by underwear."""
    w, h = skin.size
    arr = np.asarray(skin).astype(np.float32)
    # uv per vertex (first occurrence)
    vuv = {}
    for f, t in zip(F, FT):
        for vi, ti in zip(f, t):
            if ti >= 0 and vi not in vuv:
                vuv[vi] = VT[ti]
    centers = []
    nip_l = V[8451]
    d = np.linalg.norm(V - np.array([-nip_l[0], nip_l[1], nip_l[2]]), axis=1)
    d[~body_set] = 1e9
    nip_r = int(np.argmin(d))
    gen = group_verts("helper-genital")
    gen_c = V[gen].mean(axis=0)
    mask = Image.new("L", (w, h), 0)
    from PIL import ImageDraw
    dr = ImageDraw.Draw(mask)
    regions = [(V[8451], 0.55), (V[nip_r], 0.55), (gen_c, 1.25)]
    body_ids = np.where(body_set)[0]
    for c, rad in regions:
        dd = np.linalg.norm(V[body_ids] - c, axis=1)
        sel = body_ids[dd < rad]
        for vi in sel:
            if vi in vuv:
                u, v = vuv[vi]
                x, y = u * w, (1 - v) * h
                dr.ellipse([x - 14, y - 14, x + 14, y + 14], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(10))
    blurred = skin.filter(ImageFilter.GaussianBlur(28))
    # remove the reddish/darker tint from the area by matching local surroundings
    bl = np.asarray(blurred).astype(np.float32)
    big = np.asarray(skin.filter(ImageFilter.GaussianBlur(70))).astype(np.float32)
    fill = 0.35 * bl + 0.65 * big
    # keep fine grain (freckles/pores) of a neighbouring texture area by adding
    # high-pass detail of the original at reduced strength
    hp = arr - bl
    fill = fill + hp * 0.35
    m = (np.asarray(mask).astype(np.float32) / 255.0)[..., None]
    outa = arr * (1 - m) + fill * m
    return Image.fromarray(np.clip(outa, 0, 255).astype(np.uint8), "RGB")


def landmarks(Vw, W, bone_index, body_idx, heads_w):
    """Anatomical reference points used by the procedural animation."""
    out = {}
    for side in ("l", "r"):
        foot = bone_index["foot_" + side]
        ball = bone_index["ball_" + side]
        sel = body_idx[(W[body_idx, foot] + W[body_idx, ball]) > 0.5]
        P = Vw[sel]
        ankle = heads_w[foot]
        out["foot_" + side] = {
            "ankle": ankle.round(5).tolist(),
            "ball": heads_w[ball].round(5).tolist(),
            "heel_back_z": float(P[:, 2].min()),
            "toe_tip_z": float(P[:, 2].max()),
            "sole_y": float(P[:, 1].min()),
            "min_x": float(P[:, 0].min()),
            "max_x": float(P[:, 0].max()),
        }
    return out


if __name__ == "__main__":
    main()
