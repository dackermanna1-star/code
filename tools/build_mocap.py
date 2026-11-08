#!/usr/bin/env python3
"""Retarget Bandai Namco Research Motion Dataset 2 walks onto our character and
build a motion-matching database.

Data: https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset
      (CC BY-NC 4.0, (c) Bandai Namco Research Inc.)

usage: python3 tools/build_mocap.py --data <...>/dataset/Bandai-Namco-Research-Motiondataset-2/data
output: public/assets/mocap.bin + public/assets/mocap.json
"""
import argparse
import glob
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from bvh import BVH  # noqa: E402

OURS = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head",
        "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
        "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
        "thigh_l", "calf_l", "foot_l", "ball_l",
        "thigh_r", "calf_r", "foot_r", "ball_r"]
SRC = {"pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine", "spine_03": "Chest", "neck_01": "Neck",
       "head": "Head", "clavicle_l": "Shoulder_L", "upperarm_l": "UpperArm_L", "lowerarm_l": "LowerArm_L",
       "hand_l": "Hand_L", "clavicle_r": "Shoulder_R", "upperarm_r": "UpperArm_R", "lowerarm_r": "LowerArm_R",
       "hand_r": "Hand_R", "thigh_l": "UpperLeg_L", "calf_l": "LowerLeg_L", "foot_l": "Foot_L", "ball_l": "Toes_L",
       "thigh_r": "UpperLeg_R", "calf_r": "LowerLeg_R", "foot_r": "Foot_R", "ball_r": "Toes_R"}
FPS = 30


def norm(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    n[n == 0] = 1
    return v / n


def basis(d, r):
    """Rotation matrices whose columns are (x=d, y=r ⟂ d, z=d×r)."""
    d = norm(d)
    r = norm(r - d * np.sum(r * d, axis=-1, keepdims=True))
    z = np.cross(d, r)
    return np.stack([d, r, z], axis=-1)


def project_rot(M):
    U, _, Vt = np.linalg.svd(M)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1
        R = U @ Vt
    return R


def mat_to_quat(R):
    """(N,3,3) -> (N,4) xyzw"""
    q = np.zeros((len(R), 4))
    tr = R[:, 0, 0] + R[:, 1, 1] + R[:, 2, 2]
    for i in range(len(R)):
        m = R[i]
        if tr[i] > 0:
            s = np.sqrt(tr[i] + 1.0) * 2
            q[i] = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
        elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
            s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
            q[i] = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
        elif m[1, 1] > m[2, 2]:
            s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
            q[i] = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
        else:
            s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
            q[i] = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    # consistent hemisphere over time
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q


def yaw_mat(a):
    c, s = np.cos(a), np.sin(a)
    R = np.zeros((len(a), 3, 3))
    R[:, 0, 0] = c; R[:, 0, 2] = s; R[:, 1, 1] = 1; R[:, 2, 0] = -s; R[:, 2, 2] = c
    return R


def gauss_smooth(x, sigma_frames, axis=0):
    r = int(3 * sigma_frames)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_frames) ** 2)
    k /= k.sum()
    pad = [(0, 0)] * x.ndim
    pad[axis] = (r, r)
    xp = np.pad(x, pad, mode="edge")
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), axis, xp)


class Retargeter:
    def __init__(self, meta, calib_bvh):
        self.rest = {b["name"]: np.array(b["head"]) for b in meta["bones"]}
        self.tail = {b["name"]: np.array(b["tail"]) for b in meta["bones"]}
        r = self.rest
        legs = {}
        for s in "lr":
            legs[s] = np.linalg.norm(r["calf_" + s] - r["thigh_" + s]) + np.linalg.norm(r["foot_" + s] - r["calf_" + s])
        self.our_leg = legs["l"]
        b = calib_bvh
        self.src_leg = (np.linalg.norm(b.offsets[b.index("LowerLeg_L")]) + np.linalg.norm(b.offsets[b.index("Foot_L")])) * 0.01
        self.scale = self.our_leg / self.src_leg
        R, P = b.fk()
        self.delta = self._calibrate(b, R, P)

    def _our_rest_frames(self):
        r = self.rest
        X = np.array([1.0, 0, 0]); Y = np.array([0, 1.0, 0]); Z = np.array([0, 0, 1.0])
        f = {}
        f["pelvis"] = (r["spine_01"] - r["pelvis"], X)
        f["spine_01"] = (r["spine_02"] - r["spine_01"], X)
        f["spine_02"] = (r["spine_03"] - r["spine_02"], X)
        f["spine_03"] = (r["neck_01"] - r["spine_03"], X)
        f["neck_01"] = (r["head"] - r["neck_01"], X)
        for s in "lr":
            up = r["lowerarm_" + s] - r["upperarm_" + s]
            fo = r["hand_" + s] - r["lowerarm_" + s]
            bend = fo - norm(up) * np.dot(fo, norm(up))
            f["clavicle_" + s] = (r["upperarm_" + s] - r["clavicle_" + s], Y)
            f["upperarm_" + s] = (up, bend)
            f["lowerarm_" + s] = (fo, -up)
            f["thigh_" + s] = (r["calf_" + s] - r["thigh_" + s], Z)
            f["calf_" + s] = (r["foot_" + s] - r["calf_" + s], Z)
            f["foot_" + s] = (r["ball_" + s] - r["foot_" + s], r["calf_" + s] - r["foot_" + s])
        return f

    def _cues(self, b, P):
        J = lambda n: P[:, b.index(n)]
        lr_p = J("UpperLeg_L") - J("UpperLeg_R")
        lr_s = J("UpperArm_L") - J("UpperArm_R")
        up = np.tile([0, 1.0, 0], (len(P), 1))
        c = {}
        c["pelvis"] = (J("Spine") - J("Hips"), lr_p)
        c["spine_01"] = (J("Chest") - J("Spine"), lr_p + lr_s)
        c["spine_02"] = (J("Chest") - J("Spine"), lr_p + lr_s)
        c["spine_03"] = (J("Neck") - J("Chest"), lr_s)
        c["neck_01"] = (J("Head") - J("Neck"), lr_s)
        for s, S in (("l", "L"), ("r", "R")):
            ua = J("LowerArm_" + S) - J("UpperArm_" + S)
            fa = J("Hand_" + S) - J("LowerArm_" + S)
            c["clavicle_" + s] = (J("UpperArm_" + S) - J("Shoulder_" + S), up)
            c["upperarm_" + s] = (ua, fa)
            c["lowerarm_" + s] = (fa, -ua)
            fwd = J("Toes_" + S) - J("Foot_" + S)
            fwd = fwd * np.array([1, 0, 1])
            c["thigh_" + s] = (J("LowerLeg_" + S) - J("UpperLeg_" + S), fwd)
            c["calf_" + s] = (J("Foot_" + S) - J("LowerLeg_" + S), fwd)
            c["foot_" + s] = (J("Toes_" + S) - J("Foot_" + S), J("LowerLeg_" + S) - J("Foot_" + S))
        return c

    def _calibrate(self, b, R, P):
        ours = self._our_rest_frames()
        cues = self._cues(b, P)
        delta = {}
        # torso & head: joint placements differ between skeletons, so calibrate
        # them so that their average orientation while walking is upright and
        # facing the walking direction (neutral posture)
        lr = P[:, b.index("UpperLeg_L")] - P[:, b.index("UpperLeg_R")]
        yaw = gauss_smooth(np.unwrap(np.arctan2(-lr[:, 2], lr[:, 0])), 6)
        facing = yaw_mat(yaw)
        torso = {"pelvis", "spine_01", "spine_02", "spine_03", "neck_01"}
        for name, (d0, r0) in ours.items():
            if name in torso:
                M = facing
            else:
                B0 = basis(d0[None], r0[None])[0]
                d1, r1 = cues[name]
                B1 = basis(d1, r1)
                M = B1 @ B0.T                               # world rotation for our bone (per frame)
            Rs = R[:, b.index(SRC[name])]
            D = np.einsum("fji,fjk->fik", Rs, M)            # Rs^T M
            delta[name] = project_rot(D.mean(axis=0))
        # bones without own cues follow their parent's calibration
        for child, parent in (("head", "neck_01"), ("hand_l", "lowerarm_l"), ("hand_r", "lowerarm_r"),
                              ("ball_l", "foot_l"), ("ball_r", "foot_r")):
            Rp = R[:, b.index(SRC[parent])] @ delta[parent]
            Rc = R[:, b.index(SRC[child])]
            delta[child] = project_rot(np.einsum("fji,fjk->fik", Rc, Rp).mean(axis=0))
        return delta

    def retarget(self, b):
        R, P = b.fk()
        F = len(P)
        hips = P[:, b.index("Hips")]
        lr = P[:, b.index("UpperLeg_L")] - P[:, b.index("UpperLeg_R")]
        # facing: left axis (cos ψ, -sin ψ) -> ψ ; smoothed (unwrapped)
        yaw = np.unwrap(np.arctan2(-lr[:, 2], lr[:, 0]))
        yaw_s = gauss_smooth(yaw, 6)
        root = gauss_smooth(hips * np.array([1, 0, 1]), 5)
        inv = yaw_mat(-yaw_s)
        quats = np.zeros((F, len(OURS), 4))
        for k, name in enumerate(OURS):
            Rw = R[:, b.index(SRC[name])] @ self.delta[name]
            quats[:, k] = mat_to_quat(np.einsum("fij,fjk->fik", inv, Rw))
        # our pelvis joint sits a little above the hip joints; place it from the
        # source hip-joint midpoint (scaled) plus our own pelvis offset
        mid = (P[:, b.index("UpperLeg_L")] + P[:, b.index("UpperLeg_R")]) * 0.5
        r = self.rest
        off = r["pelvis"] - (r["thigh_l"] + r["thigh_r"]) * 0.5
        Rp = np.einsum("fij,fjk->fik", inv, R[:, b.index("Hips")] @ self.delta["pelvis"])
        rel = np.einsum("fij,fj->fi", inv, (mid - root)) * self.scale
        rel[:, 1] = mid[:, 1] * self.scale
        pel = rel + np.einsum("fij,j->fi", Rp, off)
        # root motion (local frame of previous root), scaled
        vel_w = np.gradient(root, axis=0) * FPS * self.scale
        vel_l = np.einsum("fij,fj->fi", inv, vel_w)
        angvel = np.gradient(yaw_s) * FPS
        # world-ish (scaled) trajectories for feature extraction
        rootS = root * self.scale
        feet = {}
        for s, S in (("l", "L"), ("r", "R")):
            ank = P[:, b.index("Foot_" + S)] * self.scale
            toe = P[:, b.index("Toes_" + S)] * self.scale
            feet[s] = (ank, toe)
        return dict(quats=quats, pelvis=pel, vel=vel_l, angvel=angvel, yaw=yaw_s, root=rootS, feet=feet, hipsY=hips[:, 1])


def contacts(ank, toe, fps=FPS):
    """Foot contact from height and speed (ankle or toes on the floor and still)."""
    h_a, h_t = ank[:, 1], toe[:, 1]
    v_a = np.linalg.norm(np.gradient(ank, axis=0), axis=1) * fps
    v_t = np.linalg.norm(np.gradient(toe, axis=0), axis=1) * fps
    floor = np.percentile(np.minimum(h_a - 0.05, h_t), 5)
    heel = (h_a - floor < 0.115) & (v_a < 0.45)
    ball = (h_t - floor < 0.04) & (v_t < 0.45)
    c = (heel | ball).astype(float)
    # clean flicker
    k = np.ones(3) / 3
    return (np.convolve(c, k, mode="same") > 0.5).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "public", "assets"))
    ap.add_argument("--style", default="feminine")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    meta = json.load(open(os.path.join(out, "character.json")))
    files = sorted(glob.glob(os.path.join(args.data, f"dataset-2_walk_{args.style}_*.bvh")))
    files += sorted(glob.glob(os.path.join(args.data, f"dataset-2_walk-turn-left_{args.style}_*.bvh")))
    files += sorted(glob.glob(os.path.join(args.data, f"dataset-2_walk-turn-right_{args.style}_*.bvh")))
    print(len(files), "takes")
    rt = Retargeter(meta, BVH(files[0]))
    print("scale", round(rt.scale, 4))

    poses, pelv, vels, angs, conts, feats, takes = [], [], [], [], [], [], []
    start = 0
    T = [10, 20, 30]  # future samples (frames): 0.33, 0.67, 1.0 s
    for f in files:
        b = BVH(f)
        d = rt.retarget(b)
        F = len(d["quats"])
        inv = yaw_mat(-d["yaw"])
        # contacts and features
        cl = contacts(*d["feet"]["l"])
        cr = contacts(*d["feet"]["r"])
        feat = np.zeros((F, 27))
        for i in range(F):
            k = 0
            for t in T:
                j = min(F - 1, i + t)
                dp = inv[i] @ (d["root"][j] - d["root"][i])
                feat[i, k:k + 2] = dp[[0, 2]]; k += 2
            for t in T:
                j = min(F - 1, i + t)
                a = d["yaw"][j] - d["yaw"][i]
                feat[i, k:k + 2] = [np.sin(a), np.cos(a)]; k += 2
            for s in "lr":
                ank = d["feet"][s][0]
                p = inv[i] @ (ank[i] - d["root"][i])
                v = inv[i] @ ((ank[min(F - 1, i + 1)] - ank[max(0, i - 1)]) * FPS / 2)
                feat[i, k:k + 3] = p; k += 3
                feat[i, k:k + 3] = v; k += 3
            feat[i, k:k + 3] = d["vel"][i]
        valid = np.ones(F, bool)
        valid[F - 31:] = False        # need a second of future
        valid[:3] = False
        poses.append(d["quats"]); pelv.append(d["pelvis"]); vels.append(d["vel"]); angs.append(d["angvel"])
        conts.append(np.stack([cl, cr], 1)); feats.append(np.where(valid[:, None], feat, np.nan))
        takes.append({"name": os.path.basename(f)[10:-4], "start": start, "frames": F})
        start += F
    Q = np.concatenate(poses).astype(np.float32)
    PE = np.concatenate(pelv).astype(np.float32)
    V = np.concatenate(vels).astype(np.float32)
    A = np.concatenate(angs).astype(np.float32)
    C = np.concatenate(conts).astype(np.uint8)
    FT = np.concatenate(feats)
    valid = ~np.isnan(FT[:, 0])
    mean = np.nanmean(FT, axis=0)
    std = np.nanstd(FT, axis=0)
    # group-wise std (positions/directions share a scale)
    groups = [(0, 6), (6, 12), (12, 15), (15, 18), (18, 21), (21, 24), (24, 27)]
    for a, bnd in groups:
        std[a:bnd] = np.sqrt(np.mean(std[a:bnd] ** 2)) + 1e-6
    FN = ((FT - mean) / std)
    FN[~valid] = 1e3
    FN = FN.astype(np.float32)
    N = len(Q)
    print("frames", N, "valid", int(valid.sum()))
    # quantise quaternions to int16
    Qi = np.round(Q.reshape(N, -1) * 32767).astype(np.int16)
    blob = b"".join([Qi.tobytes(), PE.tobytes(), V.tobytes(), A.tobytes(), C.tobytes(), FN.tobytes()])
    with open(os.path.join(out, "mocap.bin"), "wb") as fh:
        fh.write(blob)
    info = {
        "source": "Bandai Namco Research Motion Dataset 2 (CC BY-NC 4.0), style: " + args.style,
        "fps": FPS, "frames": N, "bones": OURS, "takes": takes, "scale": rt.scale,
        "layout": [["quats", "int16", len(OURS) * 4], ["pelvis", "float32", 3], ["vel", "float32", 3],
                   ["angvel", "float32", 1], ["contacts", "uint8", 2], ["features", "float32", 27]],
        "featureMean": mean.tolist(), "featureStd": std.tolist(), "futureFrames": T,
    }
    json.dump(info, open(os.path.join(out, "mocap.json"), "w"))
    print("wrote", os.path.getsize(os.path.join(out, "mocap.bin")) // 1024, "KB")


if __name__ == "__main__":
    main()
