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


# ---------------------------------------------------------------------------
# composite helpers (use these so all eight sequences stage things the same way)
# ---------------------------------------------------------------------------
import math as _m

import env as _env
import fx as _fx
from engine import clamp as _clamp


def shake(t, t0, amp=10.0, dur=0.25, freq=38.0):
    """Camera shake offset (px) for an impact at t0. Use only for heavy /
    massive contacts (never for Infinity stops - nothing was hit)."""
    if t < t0 or t > t0 + dur:
        return (0.0, 0.0)
    k = 1 - (t - t0) / dur
    return (amp * k * _m.sin((t - t0) * freq), amp * 0.6 * k * _m.cos((t - t0) * freq * 1.3))


def state(seq, *extra, minus=()):
    """Damage flags at the start of `seq`, plus any flags added during the shot."""
    return (set(_env.STATE[seq]) | set(extra)) - set(minus)


def stage(fr, seq, kind="street", extra=(), lit=1.0, **kw):
    """Draw the environment for the shot.
    kind: 'street' (intersection), 'sky' (high above the city), 'tower'
    (inside the unfinished tower; pass floor_y=, broken=), 'roof' (pass
    roof_y=, x0=, x1=), 'void' (Unlimited Void interior)."""
    st = state(seq, *extra)
    if kind == "street":
        _env.city_street(fr, tg(fr), st, lit=lit, gantry_on=kw.get("gantry_on", True))
    elif kind == "sky":
        _env.open_sky(fr, tg(fr), st, lit=lit, haze=kw.get("haze", 0.0))
    elif kind == "tower":
        _env.tower_interior(fr, kw.get("floor_y", 120.0), lit=lit, broken=kw.get("broken", 0.0))
    elif kind == "roof":
        _env.open_sky(fr, tg(fr), st, lit=lit)
        _env.rooftops(fr, kw.get("roof_y", 80.0), kw.get("x0", 20.0), kw.get("x1", 70.0), lit=lit)
    elif kind == "void":
        _fx.domain_void(fr, fr.t + kw.get("t_offset", 0.0), intensity=kw.get("intensity", 1.0),
                        info=kw.get("info", 1.0))
    return st


def infinity_stop(fr, J, gojo_xy, t_since, side="n", r=0.85, gap=0.05):
    """All Infinity cues at once for a blow that is being stopped: refraction
    around Gojo, shards hanging in the gap, blocked-impact ripples at the fist.
    J = attacker joints (from draw_fighter), gojo_xy = point being attacked
    (e.g. Gojo's head), t_since = seconds since the fist entered the zone."""
    from rig import hand_pos
    hx, hy = hand_pos(J, side)
    k = _clamp(t_since / 0.1)
    _fx.infinity(fr, gojo_xy[0], gojo_xy[1], r=r, strength=0.4 + 0.6 * k, t=fr.t)
    x0, x1 = sorted((hx, gojo_xy[0]))
    _fx.suspended_dust(fr, x0 + gap, hy - 0.12, x1 - gap, hy + 0.12, n=46, t=fr.t, salt=f"inf{side}")
    _fx.impact(fr, hx, hy, t_since, kind="blocked", dirx=1 if gojo_xy[0] > hx else -1)


def approach(x_from, x_to, t, t0, t_reach, stop_gap=0.55, rate=5.0, ease="snap"):
    """x position of an attacker's BODY crossing toward Gojo: fast travel until
    t_reach, then Zeno deceleration. x_to = where his body would stand if the
    blow landed; he converges on x_to -/+ stop_gap and never gets there."""
    from engine import EASE
    if t <= t0:
        return x_from
    sign = 1 if x_to > x_from else -1
    x_stop = x_to - sign * stop_gap
    if t < t_reach:
        u = (t - t0) / max(1e-6, t_reach - t0)
        return x_from + (x_stop - sign * stop_gap - x_from) * EASE[ease](u)
    rem = stop_gap * _m.exp(-rate * (t - t_reach))
    return x_stop - sign * rem
