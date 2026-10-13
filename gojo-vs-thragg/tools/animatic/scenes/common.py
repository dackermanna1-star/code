"""Shared helpers for scene modules.

The single most important helper here is `opts()`. It derives a fighter's
rig options (eyes, hair, injuries, cape) from the CONTINUITY LEDGER in
data/shotlist.json, so the animatic can never drift from the continuity
sheet:
  * at the start of a shot a fighter looks like the previous shot's
    continuity_out;
  * by the end of the shot he looks like this shot's continuity_out;
  * `switch` (seconds) says when inside the shot the change happens
    (default: at the end - i.e. nothing changes during the shot).
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

_SL = None
_IDX = None


def shotlist():
    global _SL, _IDX
    if _SL is None:
        with open(os.path.join(ROOT, "data", "shotlist.json")) as f:
            _SL = json.load(f)
        _IDX = {s["id"]: i for i, s in enumerate(_SL["shots"])}
    return _SL


def state_in(shot_id: str, who: str) -> dict:
    sl = shotlist()
    i = _IDX[shot_id]
    if i == 0:
        return (sl.get("initial_state") or {}).get(who, {}) or {}
    return ((sl["shots"][i - 1].get("continuity_out") or {}).get(who)) or {}


def state_out(shot_id: str, who: str) -> dict:
    sl = shotlist()
    return ((sl["shots"][_IDX[shot_id]].get("continuity_out") or {}).get(who)) or {}


_EYES = {
    "blindfold": dict(eyes="blindfold", hair_down=False),
    "lifted": dict(eyes="open", hair_down=False),
    "open": dict(eyes="open", hair_down=True),
    "narrow": dict(eyes="narrow", hair_down=True),
}


def to_opts(who: str, st: dict) -> dict:
    o = {"injuries": list(st.get("injuries") or [])}
    if who == "gojo":
        o.update(_EYES.get(st.get("eyes") or "blindfold", _EYES["blindfold"]))
    else:
        cape = st.get("cape")
        o["cape"] = None if cape in (None, "none") else cape
        o["eyes"] = "cold"
    return o


def opts(fr, who: str, switch: float | None = None, **extra) -> dict:
    """Rig opts for `who` at the current frame. Before `switch` seconds the
    fighter matches the previous shot's end state; from `switch` on, this
    shot's end state. switch=None -> start state for the whole shot, except
    on the very last frame (so the cut matches the next shot)."""
    sid = fr.shot["id"]
    a, b = state_in(sid, who), state_out(sid, who)
    if switch is None:
        use = b if fr.f >= fr.n - 1 else a
    else:
        use = b if fr.t >= switch else a
    o = to_opts(who, use)
    o.update(extra)
    return o


def tg(fr) -> float:
    """Global time in seconds (for clouds/smoke drift continuity across cuts)."""
    return fr.gf / 24.0
