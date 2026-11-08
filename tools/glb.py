"""Minimal glTF 2.0 binary (GLB) writer with skinning support.

Only the subset needed by build_character.py is implemented: triangle meshes,
custom vertex attributes, PBR materials with embedded images, and skins.
"""
import json
import struct

import numpy as np

FLOAT = 5126
UINT = 5125
USHORT = 5123
UBYTE = 5121

_TYPES = {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4", 16: "MAT4"}
_NP = {FLOAT: np.float32, UINT: np.uint32, USHORT: np.uint16, UBYTE: np.uint8}


class GLBWriter:
    def __init__(self, generator="walking-sim tools"):
        self.bin = bytearray()
        self.gltf = {
            "asset": {"version": "2.0", "generator": generator},
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [],
            "meshes": [],
            "buffers": [],
            "bufferViews": [],
            "accessors": [],
            "materials": [],
            "textures": [],
            "images": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
            "skins": [],
        }

    # ------------------------------------------------------------------ buffers
    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.gltf["bufferViews"].append(view)
        return len(self.gltf["bufferViews"]) - 1

    def accessor(self, arr, ctype=FLOAT, normalized=False, target=34962, minmax=False):
        arr = np.ascontiguousarray(arr, dtype=_NP[ctype])
        ncomp = 1 if arr.ndim == 1 else arr.shape[1]
        count = arr.shape[0]
        view = self._view(arr.tobytes(), target)
        acc = {
            "bufferView": view,
            "componentType": ctype,
            "count": int(count),
            "type": _TYPES[ncomp],
        }
        if normalized:
            acc["normalized"] = True
        if minmax:
            a2 = arr.reshape(count, ncomp)
            acc["min"] = [float(x) for x in a2.min(axis=0)]
            acc["max"] = [float(x) for x in a2.max(axis=0)]
        self.gltf["accessors"].append(acc)
        return len(self.gltf["accessors"]) - 1

    # ------------------------------------------------------------------ assets
    def image(self, data, mime):
        view = self._view(data)
        self.gltf["images"].append({"bufferView": view, "mimeType": mime})
        img = len(self.gltf["images"]) - 1
        self.gltf["textures"].append({"sampler": 0, "source": img})
        return len(self.gltf["textures"]) - 1

    def material(self, name, base_color=(1, 1, 1, 1), texture=None, roughness=0.6,
                 metallic=0.0, alpha_mode=None, double_sided=False, extras=None):
        pbr = {"baseColorFactor": list(base_color), "roughnessFactor": roughness,
               "metallicFactor": metallic}
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        m = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": double_sided}
        if alpha_mode:
            m["alphaMode"] = alpha_mode
            if alpha_mode == "MASK":
                m["alphaCutoff"] = 0.5
        if extras:
            m["extras"] = extras
        self.gltf["materials"].append(m)
        return len(self.gltf["materials"]) - 1

    def mesh(self, name, positions, indices, normals=None, uvs=None, joints=None,
             weights=None, material=None, extra_attribs=None, extras=None, morphs=None):
        attrs = {"POSITION": self.accessor(positions, FLOAT, minmax=True)}
        if normals is not None:
            attrs["NORMAL"] = self.accessor(normals, FLOAT)
        if uvs is not None:
            attrs["TEXCOORD_0"] = self.accessor(uvs, FLOAT)
        if joints is not None:
            attrs["JOINTS_0"] = self.accessor(joints, UBYTE)
        if weights is not None:
            attrs["WEIGHTS_0"] = self.accessor(weights, FLOAT)
        for k, (arr, ctype, norm) in (extra_attribs or {}).items():
            attrs[k] = self.accessor(arr, ctype, normalized=norm)
        prim = {"attributes": attrs,
                "indices": self.accessor(np.asarray(indices).reshape(-1), UINT, target=34963),
                "mode": 4}
        if material is not None:
            prim["material"] = material
        m = {"name": name, "primitives": [prim]}
        if morphs:
            prim["targets"] = [{"POSITION": self.accessor(d, FLOAT, minmax=True)} for _, d in morphs]
            m["weights"] = [0.0] * len(morphs)
            extras = dict(extras or {})
            extras["targetNames"] = [n for n, _ in morphs]
        if extras:
            m["extras"] = extras
        self.gltf["meshes"].append(m)
        return len(self.gltf["meshes"]) - 1

    def node(self, **kw):
        self.gltf["nodes"].append({k: v for k, v in kw.items() if v is not None})
        return len(self.gltf["nodes"]) - 1

    def skin(self, joints, inverse_bind, skeleton_root=None, name="Skin"):
        s = {"name": name, "joints": joints,
             "inverseBindMatrices": self.accessor(inverse_bind.reshape(-1, 16), FLOAT, target=None)}
        if skeleton_root is not None:
            s["skeleton"] = skeleton_root
        self.gltf["skins"].append(s)
        return len(self.gltf["skins"]) - 1

    # ------------------------------------------------------------------ output
    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        g = dict(self.gltf)
        g["buffers"] = [{"byteLength": len(self.bin)}]
        for key in ("materials", "textures", "images", "skins", "meshes"):
            if not g[key]:
                del g[key]
        if not g.get("textures"):
            g.pop("samplers", None)
        js = json.dumps(g, separators=(",", ":")).encode("utf8")
        while len(js) % 4:
            js += b" "
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A))
            f.write(js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942))
            f.write(self.bin)
