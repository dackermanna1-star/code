"""Weapon sounds: layered gunshots (close / distant / suppressed), equip handling and the
per-weapon reload & cycling foley.

Gunshot layers (close 'fire'):
  a) crack  - N-wave (supersonic shock) + high-passed noise burst, high-shelf emphasis
  b) blast  - muzzle blast noise through resonant bands (the gun's 'voice': tak / bark / boom)
  c) body   - pitch-swept sine thump + low-passed rumble noise
  -> summed, ground reflection, tanh saturation
  d) action - modal-synthesis clacks/rings/springs at realistic cycling times
  e) space  - convolution with a synthetic outdoor IR + smeared slap echoes (+ rolling echoes)
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass

import numpy as np

from sfx_dsp import (SR, add_space, asym_clip, bp, convolve, crackle, env_exp, env_swell, eq, finish, hp,
                     lp, make_ir, modal, normalize, ns, osc, peak, place, reso, rolling_ir, softclip, sweep_exp,
                     tvec, white)
from sfx_foley import (bounces, casing_ping, click, cloth, noise_burst, rattle, scrape, spring, tension, thud,
                       tock, wood_knock)

LEVEL_FIRE = -1.0
LEVEL_FAR = -1.0
LEVEL_SUPPRESSED = -2.0
LEVEL_MECH = -10.0
T0 = 0.008  # onset of the shot inside the file (keeps codec pre-echo and the fade-in clear of the transient)


@dataclass(frozen=True)
class Gun:
    id: str
    fire_len: float
    far_len: float
    sup_len: float
    equip_len: float
    size: str  # small / medium / large
    # crack
    crack: float = 0.8
    crack_hp: float = 2500.0
    crack_tau: float = 0.0008
    nwave_ms: float = 0.0
    bright_db: float = 3.0
    # muzzle blast
    bands: tuple = ((900.0, 1.6, 1.0), (1800.0, 1.8, 0.8))
    broad: float = 0.35
    lowmid: float = 0.5
    blast_tau: float = 0.012
    blast: float = 1.0
    harsh: float = 0.0
    # body / boom
    boom_f0: float = 150.0
    boom_f1: float = 55.0
    boom_sweep: float = 0.015
    boom_tau: float = 0.07
    boom: float = 0.7
    rumble: float = 0.4
    rumble_lp: float = 300.0
    rumble_tau: float = 0.05
    drive: float = 2.0
    # space
    rt60: float = 0.8
    wet: float = 0.2
    slaps: tuple = ((0.13, 0.5),)
    roll: float = 0.0
    # distant
    far_lp: float = 650.0
    far_rt: float = 2.0
    far_roll: float = 0.45
    far_swell: float = 0.3
    # suppressed
    sup_lp: float = 1400.0
    sup_res: float = 520.0
    sup_tau: float = 0.012
    sup_body: float = 0.5
    sup_mech: float = 0.6
    # action
    action: str = "ar15"
    action_lvl: float = 0.2
    mech_scale: float = 1.0


GUNS: dict[str, Gun] = {g.id: g for g in [
    Gun("m9", 0.70, 1.8, 0.35, 0.36, "small",
        crack=0.75, crack_hp=3000, crack_tau=0.0007, nwave_ms=0.0, bright_db=4,
        bands=((1700, 1.4, 1.0), (3300, 2.0, 0.75), (850, 1.5, 0.45)), broad=0.4, lowmid=0.3, blast_tau=0.009,
        boom_f0=165, boom_f1=72, boom_sweep=0.012, boom_tau=0.028, boom=0.35, rumble=0.5, rumble_lp=400,
        rumble_tau=0.02, drive=1.8, rt60=0.5, wet=0.16, slaps=((0.085, 0.45),),
        far_lp=800, far_rt=1.4, far_roll=0.35, far_swell=0.18,
        sup_lp=1400, sup_res=650, sup_tau=0.008, sup_body=0.4, sup_mech=0.5,
        action="pistol", action_lvl=0.16, mech_scale=1.3),
    Gun("revolver", 1.50, 2.6, 0.45, 0.40, "small",
        crack=0.7, crack_hp=2000, crack_tau=0.0012, nwave_ms=0.25, bright_db=2,
        bands=((550, 1.2, 1.0), (1200, 1.4, 0.9), (2600, 1.8, 0.55)), broad=0.45, lowmid=0.6, blast_tau=0.022, harsh=0.25,
        boom_f0=125, boom_f1=36, boom_sweep=0.025, boom_tau=0.09, boom=0.85, rumble=0.6, rumble_lp=220,
        rumble_tau=0.07, drive=2.6, rt60=1.4, wet=0.3, slaps=((0.16, 0.6), (0.42, 0.35)), roll=0.12,
        far_lp=520, far_rt=2.4, far_roll=0.55, far_swell=0.35,
        sup_lp=1000, sup_res=380, sup_tau=0.016, sup_body=0.9, sup_mech=0.55,
        action="revolver", action_lvl=0.1, mech_scale=1.15),
    Gun("vector9", 0.60, 1.6, 0.30, 0.40, "medium",
        crack=0.55, crack_hp=3200, crack_tau=0.0005, nwave_ms=0.0, bright_db=3,
        bands=((1450, 1.8, 1.0), (2900, 2.2, 0.6), (700, 1.4, 0.3)), broad=0.3, lowmid=0.3, blast_tau=0.006,
        boom_f0=185, boom_f1=85, boom_sweep=0.008, boom_tau=0.02, boom=0.3, rumble=0.4, rumble_lp=450,
        rumble_tau=0.015, drive=1.7, rt60=0.4, wet=0.13, slaps=((0.07, 0.4),),
        far_lp=850, far_rt=1.2, far_roll=0.3, far_swell=0.15,
        sup_lp=1500, sup_res=680, sup_tau=0.007, sup_body=0.45, sup_mech=0.45,
        action="vector", action_lvl=0.2, mech_scale=1.15),
    Gun("mp5", 0.80, 1.9, 0.32, 0.40, "medium",
        crack=0.55, crack_hp=2600, crack_tau=0.0007, nwave_ms=0.0, bright_db=2.5,
        bands=((1150, 1.6, 1.0), (2250, 1.9, 0.9), (620, 1.4, 0.45)), broad=0.35, lowmid=0.4, blast_tau=0.010,
        boom_f0=172, boom_f1=70, boom_sweep=0.011, boom_tau=0.028, boom=0.38, rumble=0.5, rumble_lp=380,
        rumble_tau=0.02, drive=2.0, rt60=0.6, wet=0.18, slaps=((0.1, 0.5),),
        far_lp=750, far_rt=1.5, far_roll=0.38, far_swell=0.2,
        sup_lp=1500, sup_res=600, sup_tau=0.008, sup_body=0.4, sup_mech=0.5,
        action="mp5", action_lvl=0.2, mech_scale=1.1),
    Gun("ar15", 0.95, 2.2, 0.40, 0.45, "medium",
        crack=1.05, crack_hp=3800, crack_tau=0.0006, nwave_ms=0.35, bright_db=6,
        bands=((950, 1.5, 0.85), (1850, 1.7, 1.0), (3600, 2.2, 0.55)), broad=0.35, lowmid=0.5, blast_tau=0.012,
        boom_f0=150, boom_f1=54, boom_sweep=0.014, boom_tau=0.042, boom=0.5, rumble=0.55, rumble_lp=320,
        rumble_tau=0.03, drive=2.2, rt60=0.85, wet=0.2, slaps=((0.12, 0.5), (0.31, 0.25)),
        far_lp=700, far_rt=1.9, far_roll=0.45, far_swell=0.28,
        sup_lp=1500, sup_res=560, sup_tau=0.009, sup_body=0.5, sup_mech=0.6,
        action="ar15", action_lvl=0.2, mech_scale=1.0),
    Gun("ak", 1.00, 2.4, 0.42, 0.50, "medium",
        crack=0.8, crack_hp=2600, crack_tau=0.0007, nwave_ms=0.35, bright_db=1,
        bands=((520, 1.3, 1.0), (1050, 1.5, 1.0), (2200, 2.0, 0.55)), broad=0.4, lowmid=0.6, blast_tau=0.016, harsh=0.6,
        boom_f0=138, boom_f1=48, boom_sweep=0.017, boom_tau=0.05, boom=0.6, rumble=0.6, rumble_lp=280,
        rumble_tau=0.035, drive=3.0, rt60=0.95, wet=0.22, slaps=((0.14, 0.55), (0.36, 0.3)),
        far_lp=620, far_rt=2.1, far_roll=0.5, far_swell=0.3,
        sup_lp=1300, sup_res=480, sup_tau=0.011, sup_body=0.6, sup_mech=0.6,
        action="ak", action_lvl=0.24, mech_scale=0.85),
    Gun("bullpup", 0.85, 2.1, 0.38, 0.45, "medium",
        crack=1.0, crack_hp=4200, crack_tau=0.0005, nwave_ms=0.3, bright_db=6.5,
        bands=((1300, 1.6, 1.0), (2650, 1.9, 0.9), (4300, 2.4, 0.5)), broad=0.35, lowmid=0.45, blast_tau=0.010,
        boom_f0=165, boom_f1=62, boom_sweep=0.012, boom_tau=0.036, boom=0.45, rumble=0.5, rumble_lp=360,
        rumble_tau=0.026, drive=2.0, rt60=0.75, wet=0.18, slaps=((0.11, 0.5),),
        far_lp=760, far_rt=1.8, far_roll=0.42, far_swell=0.25,
        sup_lp=1500, sup_res=620, sup_tau=0.008, sup_body=0.45, sup_mech=0.5,
        action="bullpup", action_lvl=0.2, mech_scale=1.05),
    Gun("pump_shotgun", 1.50, 2.7, 0.55, 0.55, "large",
        crack=0.45, crack_hp=1600, crack_tau=0.0016, nwave_ms=0.0, bright_db=0,
        bands=((330, 1.0, 1.0), (780, 1.2, 0.9), (1600, 1.5, 0.6)), broad=0.5, lowmid=0.7, blast_tau=0.032, harsh=0.3,
        boom_f0=105, boom_f1=34, boom_sweep=0.03, boom_tau=0.11, boom=0.9, rumble=0.75, rumble_lp=200,
        rumble_tau=0.09, drive=2.6, rt60=1.45, wet=0.32, slaps=((0.17, 0.6), (0.45, 0.4)), roll=0.14,
        far_lp=480, far_rt=2.5, far_roll=0.6, far_swell=0.38,
        sup_lp=900, sup_res=320, sup_tau=0.02, sup_body=1.0, sup_mech=0.5,
        action="pump", action_lvl=0.07, mech_scale=0.85),
    Gun("auto_shotgun", 1.25, 2.5, 0.50, 0.50, "large",
        crack=0.5, crack_hp=1800, crack_tau=0.0013, nwave_ms=0.0, bright_db=1,
        bands=((400, 1.1, 1.0), (920, 1.3, 0.9), (1900, 1.6, 0.6)), broad=0.45, lowmid=0.65, blast_tau=0.026, harsh=0.25,
        boom_f0=118, boom_f1=40, boom_sweep=0.025, boom_tau=0.085, boom=0.8, rumble=0.7, rumble_lp=220,
        rumble_tau=0.07, drive=2.4, rt60=1.2, wet=0.28, slaps=((0.15, 0.55), (0.4, 0.3)), roll=0.08,
        far_lp=520, far_rt=2.3, far_roll=0.55, far_swell=0.34,
        sup_lp=1000, sup_res=360, sup_tau=0.017, sup_body=0.9, sup_mech=0.5,
        action="autoshotgun", action_lvl=0.22, mech_scale=0.8),
    Gun("sniper", 1.60, 3.0, 0.60, 0.55, "large",
        crack=1.5, crack_hp=3000, crack_tau=0.0014, nwave_ms=0.6, bright_db=6,
        bands=((420, 1.1, 1.0), (980, 1.3, 1.0), (2200, 1.7, 0.8)), broad=0.45, lowmid=0.7, blast_tau=0.026, harsh=0.3,
        boom_f0=118, boom_f1=31, boom_sweep=0.03, boom_tau=0.12, boom=0.9, rumble=0.7, rumble_lp=200,
        rumble_tau=0.1, drive=2.8, rt60=1.6, wet=0.3, slaps=((0.21, 0.6), (0.52, 0.45), (0.9, 0.3)), roll=0.2,
        far_lp=450, far_rt=2.8, far_roll=0.65, far_swell=0.45,
        sup_lp=950, sup_res=330, sup_tau=0.02, sup_body=1.0, sup_mech=0.55,
        action="sniper", action_lvl=0.05, mech_scale=0.9),
    Gun("dmr", 1.20, 2.6, 0.45, 0.50, "medium",
        crack=1.25, crack_hp=3400, crack_tau=0.0009, nwave_ms=0.45, bright_db=5,
        bands=((700, 1.3, 1.0), (1450, 1.5, 1.0), (3000, 2.0, 0.65)), broad=0.4, lowmid=0.6, blast_tau=0.017, harsh=0.15,
        boom_f0=135, boom_f1=44, boom_sweep=0.018, boom_tau=0.06, boom=0.65, rumble=0.6, rumble_lp=260,
        rumble_tau=0.045, drive=2.4, rt60=1.05, wet=0.24, slaps=((0.15, 0.55), (0.38, 0.3)), roll=0.06,
        far_lp=600, far_rt=2.3, far_roll=0.55, far_swell=0.34,
        sup_lp=1200, sup_res=450, sup_tau=0.012, sup_body=0.7, sup_mech=0.55,
        action="dmr", action_lvl=0.2, mech_scale=0.92),
    Gun("lmg", 0.90, 2.3, 0.42, 0.60, "large",
        crack=0.8, crack_hp=2900, crack_tau=0.0006, nwave_ms=0.35, bright_db=3.5,
        bands=((640, 1.3, 1.0), (1300, 1.5, 1.0), (2600, 2.0, 0.6)), broad=0.4, lowmid=0.6, blast_tau=0.013, harsh=0.2,
        boom_f0=145, boom_f1=50, boom_sweep=0.014, boom_tau=0.048, boom=0.6, rumble=0.6, rumble_lp=300,
        rumble_tau=0.035, drive=2.6, rt60=0.85, wet=0.19, slaps=((0.12, 0.5), (0.3, 0.25)),
        far_lp=640, far_rt=2.0, far_roll=0.5, far_swell=0.3,
        sup_lp=1300, sup_res=500, sup_tau=0.01, sup_body=0.6, sup_mech=0.6,
        action="lmg", action_lvl=0.22, mech_scale=0.75),
]}


# ============================================================================================
# gunshot layers
# ============================================================================================
def _gun_noise(rng, g: Gun, n: int, tag: str, share: float = 0.8) -> np.ndarray:
    """White noise = fixed per-gun 'core' + per-variant part, so variants keep the gun's voice."""
    core = np.random.default_rng(zlib.crc32(f"{g.id}:{tag}".encode())).standard_normal(n)
    return share * core + np.sqrt(1.0 - share * share) * white(rng, n)


def _rmsnorm(x: np.ndarray, win: float, target: float = 0.28) -> np.ndarray:
    """Scale by the RMS of the first ``win`` seconds (stable level for short random bursts)."""
    r = float(np.sqrt(np.mean(x[:ns(win)] ** 2)))
    return x * (target / r) if r > 0 else x


def _crack(rng, n: int, g: Gun, p: float) -> np.ndarray:
    nz = hp(_gun_noise(rng, g, n, "crack"), g.crack_hp * p, 2) * env_exp(n, g.crack_tau, 0.00004)
    y = normalize(nz)
    if g.nwave_ms > 0:
        d = ns(g.nwave_ms / 1000.0)
        nw = np.zeros(n)
        nw[:d] = np.linspace(1.0, -1.0, d)
        nw = normalize(lp(nw, 15000.0, 2))
        y = y + 0.9 * nw
        place(y, -0.45 * lp(nw, 8000.0, 2), rng.uniform(0.0009, 0.0016))  # ground bounce of the shock
    y = eq(y, "highshelf", 4000.0, 0.7, g.bright_db)
    return _rmsnorm(y, 0.002)


def _blast(rng, n: int, g: Gun, p: float, tau_mul: float = 1.0) -> np.ndarray:
    x = _gun_noise(rng, g, n, "blast")
    if g.harsh > 0:  # gritty, impulsive texture concentrated in the low mids
        core = crackle(np.random.default_rng(zlib.crc32(f"{g.id}:crackle".encode())), n, 2500.0, smooth=0.00008)
        cr = 0.8 * core + 0.6 * crackle(rng, n, 2500.0, smooth=0.00008)
        x = x + g.harsh * 12.0 * lp(cr, 2500.0, 2)
    y = g.broad * lp(x, 7000.0, 1) + g.lowmid * reso(x, 430.0 * p, 1.1)
    for f, q, gain in g.bands:
        y = y + gain * reso(x, f * p * rng.uniform(0.985, 1.015), q)
    tau = g.blast_tau * tau_mul
    env = 0.7 * env_exp(n, tau, 0.00012) + 0.3 * env_exp(n, tau * 4.0, 0.0008)
    y = y * env
    if g.harsh > 0:
        y = asym_clip(normalize(y), 1.0 + 2.0 * g.harsh, 0.2)
    return _rmsnorm(y, 0.006)


def _boom(rng, n: int, g: Gun, p: float, tau_mul: float = 1.0) -> np.ndarray:
    f = sweep_exp(n, g.boom_f0 * p, g.boom_f1 * p, g.boom_sweep)
    s = osc(f) * env_exp(n, g.boom_tau * tau_mul, 0.0006)
    s = s + 0.22 * osc(2.02 * f, 0.3) * env_exp(n, g.boom_tau * 0.5 * tau_mul, 0.0006)
    r = lp(_gun_noise(rng, g, n, "rumble"), g.rumble_lp, 2) * env_exp(n, g.rumble_tau * tau_mul, 0.0015)
    return normalize(normalize(s) + normalize(r) * g.rumble)


# ============================================================================================
# actions (cycling mechanics heard in the shot)
# ============================================================================================
def _action(rng, kind: str, n: int, t0: float, p: float, suppressed: bool = False) -> np.ndarray:
    y = np.zeros(n)

    def put(sig, t, gain):
        if suppressed and t < 0.012:  # keep the onset of a suppressed shot free of crack-like ticks
            gain *= 0.3
        place(y, sig, t0 + t, gain)

    if kind == "pistol":  # light slide clack
        put(click(rng, 3900 * p, 0.008, n_modes=5, noise=0.5), 0.006, 0.5)
        put(click(rng, 3000 * p, 0.014, body_f=560 * p, body=0.45), 0.019, 1.0)
        put(click(rng, 3400 * p, 0.012, body_f=620 * p, body=0.35, ring=0.15, ring_decay=0.05), 0.041, 0.85)
    elif kind == "revolver":  # hammer + ringing cylinder only
        put(click(rng, 2600 * p, 0.010, body_f=500 * p, body=0.4), 0.0005, 0.6)
        m = modal(ns(0.5), np.array([1750, 2950, 4400, 6100]) * p, [0.16, 0.11, 0.07, 0.05], [1.0, 0.6, 0.4, 0.2])
        put(normalize(m), 0.012, 0.5)
        put(click(rng, 4200 * p, 0.005, n_modes=4), 0.09, 0.25)
    elif kind == "vector":  # very fast mechanical buzz
        times = [0.004, 0.0095, 0.0155, 0.022, 0.030, 0.041]
        gains = [0.7, 0.9, 0.8, 0.7, 0.55, 0.8]
        for tt, gg in zip(times, gains):
            put(click(rng, rng.uniform(3000, 4600) * p, 0.006, n_modes=4, noise=0.5), tt, gg)
        m = ns(0.06)
        tt = np.arange(m) / SR
        buzz = bp(white(rng, m), 1800, 5200) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 190 * p * tt)))
        buzz *= env_swell(m, 0.0, 0.004, 0.018, 0.012)
        put(normalize(buzz), 0.006, 0.35)
    elif kind == "mp5":  # roller-delayed: clack + metallic 'ting'
        put(click(rng, 2300 * p, 0.010), 0.006, 0.6)
        ring = modal(ns(0.6), np.array([2650, 4120, 5980, 7740]) * p, [0.2, 0.14, 0.09, 0.06], [1.0, 0.6, 0.45, 0.3])
        put(normalize(ring), 0.009, 0.55)
        put(click(rng, 1900 * p, 0.012, body_f=450 * p, body=0.5), 0.022, 0.7)
        put(click(rng, 2500 * p, 0.012, body_f=520 * p, body=0.4, ring=0.2, ring_decay=0.06), 0.072, 0.85)
    elif kind == "ar15":  # buffer + spring 'boing'
        put(click(rng, 3300 * p, 0.008, n_modes=5), 0.004, 0.5)
        put(click(rng, 1650 * p, 0.016, body_f=380 * p, body=0.5), 0.021, 0.85)
        put(spring(rng, 0.25, 410 * p, tau=0.07, chirps=4, period=0.017), 0.023, 0.3)
        put(click(rng, 2350 * p, 0.014, body_f=450 * p, body=0.4), 0.076, 0.9)
        put(click(rng, 4100 * p, 0.005, n_modes=4), 0.079, 0.3)
    elif kind == "ak":  # heavy clanky carrier
        put(click(rng, 1150 * p, 0.020, n_modes=7, noise=0.6, body_f=300 * p, body=0.6, body_decay=0.02), 0.018, 1.0)
        put(rattle(rng, 0.1, 3, 0.024, 1800 * p, 3500 * p, decay=0.006), 0.026, 0.35)
        put(click(rng, 1350 * p, 0.022, n_modes=7, noise=0.6, body_f=320 * p, body=0.6, ring=0.25,
                  ring_decay=0.06), 0.094, 1.0)
        put(rattle(rng, 0.1, 2, 0.02, 1500 * p, 2600 * p, decay=0.007), 0.1, 0.4)
    elif kind == "bullpup":  # compact rattle
        for tt, gg in zip([0.004, 0.011, 0.017, 0.025], [0.5, 0.8, 0.6, 0.7]):
            put(click(rng, rng.uniform(2900, 4200) * p, 0.007, n_modes=4), tt, gg)
        put(tock(rng, 650 * p, 0.010), 0.014, 0.6)
        put(click(rng, 3000 * p, 0.010, body_f=680 * p, body=0.5), 0.06, 0.85)
        put(rattle(rng, 0.08, 3, 0.016, 3500 * p, 5000 * p, decay=0.005), 0.064, 0.3)
    elif kind == "pump":  # manual action: just shells shifting in the tube
        put(rattle(rng, 0.1, 3, 0.04, 900 * p, 1500 * p, decay=0.006), 0.03, 0.6)
        put(wood_knock(rng, 420 * p, 0.02, 0.15), 0.035, 0.4)
    elif kind == "autoshotgun":  # fast heavy cycling clack
        put(click(rng, 1350 * p, 0.018, n_modes=7, body_f=260 * p, body=0.6), 0.015, 0.9)
        put(tock(rng, 800 * p, 0.012), 0.03, 0.3)
        put(click(rng, 1500 * p, 0.020, n_modes=7, body_f=280 * p, body=0.6, ring=0.2, ring_decay=0.06), 0.055, 1.0)
        put(rattle(rng, 0.08, 2, 0.015, 1200 * p, 2200 * p, decay=0.007), 0.06, 0.35)
    elif kind == "sniper":  # bolt gun: firing pin snap + a little bolt/bipod rattle
        put(click(rng, 2400 * p, 0.012, n_modes=6, body_f=420 * p, body=0.4), 0.0, 0.7)
        put(rattle(rng, 0.1, 2, 0.025, 1400 * p, 2200 * p, decay=0.008), 0.035, 0.6)
        put(click(rng, 1800 * p, 0.015, body_f=360 * p, body=0.5, ring=0.15, ring_decay=0.05), 0.07, 0.4)
    elif kind == "dmr":  # heavier AR-10 style
        put(click(rng, 3000 * p, 0.008, n_modes=5), 0.005, 0.5)
        put(click(rng, 1400 * p, 0.018, body_f=330 * p, body=0.55), 0.024, 0.9)
        put(spring(rng, 0.22, 340 * p, tau=0.06, chirps=3, period=0.019), 0.026, 0.2)
        put(click(rng, 1950 * p, 0.016, body_f=380 * p, body=0.45), 0.088, 0.95)
    elif kind == "lmg":  # open bolt, feed pawl, belt links
        put(click(rng, 2200 * p, 0.010), 0.017, 0.6)
        put(click(rng, 1400 * p, 0.018, body_f=330 * p, body=0.5), 0.028, 0.85)
        put(rattle(rng, 0.12, 8, 0.053, 3500 * p, 6200 * p, decay=0.012, ring=0.15), 0.022, 0.45)
        put(casing_ping(rng, 4600 * p, 0.05, 0.25), 0.05, 0.3)
        put(click(rng, 1600 * p, 0.018, body_f=350 * p, body=0.5), 0.081, 0.7)
    else:
        raise ValueError(kind)
    return y


# ============================================================================================
# renderers
# ============================================================================================
def _jitter(rng):
    return 1.0 + rng.uniform(-0.03, 0.03), 1.0 + rng.uniform(-0.08, 0.08)


def _variant_eq(rng, x: np.ndarray) -> np.ndarray:
    return eq(x, "peak", rng.uniform(500, 4000), 1.2, rng.uniform(-1.5, 1.5))


def render_fire(g: Gun, rng) -> np.ndarray:
    p, dm = _jitter(rng)
    n = ns(g.fire_len + 0.05)
    # 'bang' layer: crack + muzzle blast, densified by saturation
    bang = np.zeros(n)
    place(bang, _crack(rng, n, g, p), T0, g.crack)
    place(bang, _blast(rng, n, g, p, dm), T0 + 0.0002, g.blast)
    place(bang, lp(bang, 5000.0, 1), rng.uniform(0.0025, 0.0045), 0.3)  # ground reflection
    bang = softclip(normalize(bang), g.drive)
    # body layer: pitch-swept thump + rumble, lightly saturated for audible harmonics
    body = np.zeros(n)
    place(body, _boom(rng, n, g, p, dm), T0 + 0.0004)
    body = softclip(body, 1.6)
    dry = bang + g.boom * body
    mech = _action(rng, g.action, n, T0, p)
    # space: outdoor IR with slap echoes (+ rolling echoes for the big guns); band-limited send
    send = bp(dry, 160.0, 3500.0, 2)
    slaps = [(t * rng.uniform(0.9, 1.1), s * rng.uniform(0.8, 1.1)) for t, s in g.slaps]
    ir = make_ir(rng, g.rt60 * dm, dur=g.fire_len, hf=0.4, lp_hz=5000.0, early=slaps)
    out = add_space(dry, ir, g.wet, src=send)
    if g.roll > 0:
        rir = rolling_ir(rng, g.fire_len, g.rt60 * 1.3, first=0.1, swell=g.fire_len * 0.2, taps=40,
                         lp_start=2500.0, lp_end=500.0)
        wet = convolve(send, rir)
        out = out + wet * (g.roll * peak(dry) / (peak(wet) + 1e-12))
    out = out + mech * g.action_lvl
    out = softclip(normalize(_variant_eq(rng, out)), 1.1)
    return finish(out, LEVEL_FIRE, length=g.fire_len, fout=g.fire_len * 0.3, hp_hz=35.0)


def render_far(g: Gun, rng) -> np.ndarray:
    p, dm = _jitter(rng)
    n = ns(g.far_len + 0.1)
    t0 = 0.01
    dry = np.zeros(n)
    place(dry, lp(_blast(rng, n, g, p, dm * 2.2), g.far_lp * p, 3), t0, 1.0)  # smeared, air-absorbed blast
    place(dry, _boom(rng, n, g, p, dm * 1.3), t0, 0.45 * g.boom)
    dry = dry * (1.0 - np.exp(-np.maximum(tvec(n) - t0, 0.0) / 0.003))  # softened transient
    dry = hp(dry, 55.0, 2)
    dry = softclip(normalize(dry), 1.5)
    slaps = ((rng.uniform(0.3, 0.45), rng.uniform(0.4, 0.65)), (rng.uniform(0.75, 1.1), rng.uniform(0.15, 0.3)))
    ir = rolling_ir(rng, g.far_len, g.far_rt * dm, first=0.06, swell=g.far_swell, taps=70,
                    lp_start=1500.0, lp_end=380.0, diffuse=0.6, slaps=slaps)
    out = add_space(dry, ir, g.far_roll, src=hp(dry, 90.0, 2))
    out = lp(out, g.far_lp * 1.3, 2)
    out = softclip(normalize(out), 1.2)
    return finish(out, LEVEL_FAR, length=g.far_len, fin=0.004, fout=g.far_len * 0.35, hp_hz=45.0)


def render_suppressed(g: Gun, rng) -> np.ndarray:
    p, dm = _jitter(rng)
    n = ns(g.sup_len + 0.05)
    x = white(rng, n)
    tau = g.sup_tau * dm
    core = lp(x, g.sup_lp * p, 2) * (0.75 * env_exp(n, tau, 0.0004) + 0.25 * env_exp(n, tau * 3.0, 0.001))
    wap = reso(x, g.sup_res * p, 1.8) * env_exp(n, tau * 1.4, 0.0006)
    pfft = bp(white(rng, n), 900.0, 3200.0) * env_exp(n, 0.02 * dm, 0.0012)
    f = sweep_exp(n, g.boom_f0 * 1.3 * p, g.boom_f1 * 1.5 * p, g.boom_sweep * 0.8)
    body = osc(f) * env_exp(n, g.boom_tau * 0.4 * dm, 0.0008)
    rep = normalize(core) + 0.8 * normalize(wap) + 0.3 * normalize(pfft) + g.sup_body * normalize(body)
    rep = softclip(normalize(rep), 1.6)
    out = np.zeros(n)
    place(out, rep, T0)
    out = out + g.sup_mech * _action(rng, g.action, n, T0, p, suppressed=True)
    ir = make_ir(rng, 0.28, dur=g.sup_len, hf=0.3, lp_hz=3000.0, early=((0.03, 0.4),))
    out = add_space(out, ir, 0.12, src=lp(out, 2500.0, 2))
    out = softclip(normalize(out), 1.1)
    return finish(out, LEVEL_SUPPRESSED, length=g.sup_len, fout=g.sup_len * 0.3)


def render_equip(g: Gun, rng) -> np.ndarray:
    L = g.equip_len
    n = ns(L + 0.05)
    s = g.mech_scale
    y = np.zeros(n)
    place(y, cloth(rng, L, gestures=2, lo=800.0, hi=5000.0, span=L * 0.7), 0.0, 0.35)
    cnt = {"small": 3, "medium": 5, "large": 7}[g.size]
    place(y, rattle(rng, L, cnt, L * 0.35, 1800 * s, 4200 * s, decay=0.009), 0.03, 0.45)
    grip_t = L * 0.45
    place(y, tock(rng, 600 * s, 0.012), grip_t, 0.6)
    weight = {"small": 0.3, "medium": 0.45, "large": 0.65}[g.size]
    place(y, thud(rng, 0.15, 160 * s, 80 * s, tau=0.03, noise_lp=700), grip_t, weight)
    place(y, click(rng, 3200 * s, 0.010, body_f=500 * s, body=0.3), L * 0.62, 0.7)
    if g.id == "revolver":
        for i in range(4):
            place(y, click(rng, 4300, 0.004, n_modes=4), 0.06 + i * 0.022, 0.35 - i * 0.05)
    elif g.id == "pump_shotgun":
        place(y, rattle(rng, 0.2, 4, 0.06, 900, 1500, decay=0.006), 0.08, 0.4)
        place(y, wood_knock(rng, 480, 0.025, 0.15), grip_t + 0.01, 0.4)
    elif g.id == "lmg":
        place(y, rattle(rng, 0.3, 10, 0.18, 3200, 6000, decay=0.012, ring=0.2), 0.05, 0.4)
    elif g.id == "sniper":
        place(y, click(rng, 2400, 0.012, body_f=420, body=0.4), L * 0.75, 0.45)
    y = softclip(normalize(y), 1.5)
    return finish(y, LEVEL_MECH, length=L, fout=0.05)


# ============================================================================================
# reload / handling foley
# ============================================================================================
MATS = {
    "steel": dict(sf=2500.0, mf=2700.0, metallic=0.55, q=3.0, body=430.0, grit=0.35),
    "alu": dict(sf=2200.0, mf=2400.0, metallic=0.40, q=2.6, body=400.0, grit=0.4),
    "polymer": dict(sf=1500.0, mf=1600.0, metallic=0.12, q=1.8, body=720.0, grit=0.5),
}


def _mag_out(rng, s, mat, L=0.5, rock=False, heavy=False):
    m = MATS[mat]
    y = np.zeros(ns(L))
    place(y, click(rng, 3800 * s, 0.008, n_modes=5, noise=0.5, body_f=m["body"] * s, body=0.25), 0.02, 0.6)
    t_sc = 0.05
    if rock:  # AK-style rock-out: the mag unhooks with a dull clunk first
        place(y, click(rng, 1800 * s, 0.015, body_f=m["body"] * s * 0.8, body=0.5), 0.07, 0.6)
        t_sc = 0.09
    sc = scrape(rng, 0.17, m["sf"] * s, m["sf"] * s * 0.72, q=m["q"], grit=m["grit"], metallic=m["metallic"],
                metal_f=m["mf"] * s, attack=0.15, release=0.5)
    place(y, sc, t_sc, 0.55)
    t_free = t_sc + 0.16
    place(y, tock(rng, m["body"] * s * 1.3, 0.01), t_free, 0.35 if not heavy else 0.5)
    place(y, rattle(rng, 0.2, 3, 0.05, 2600 * s, 4200 * s, decay=0.006), t_free + 0.01, 0.3)
    return y


def _mag_in(rng, s, mat, L=0.55, rock=False, heavy=False):
    m = MATS[mat]
    y = np.zeros(ns(L))
    place(y, click(rng, 2900 * s, 0.008, n_modes=4, noise=0.4), 0.03, 0.35)  # lip touches the magwell
    if rock:
        place(y, click(rng, 1700 * s, 0.014, body_f=m["body"] * s * 0.8, body=0.5), 0.07, 0.5)  # front lug hooks
        sc = scrape(rng, 0.11, m["sf"] * s * 0.65, m["sf"] * s * 0.9, q=m["q"], grit=m["grit"],
                    metallic=m["metallic"], metal_f=m["mf"] * s, attack=0.5, release=0.1)
        place(y, sc, 0.09, 0.5)
    else:
        sc = scrape(rng, 0.15, m["sf"] * s * 0.7, m["sf"] * s * 1.05, q=m["q"], grit=m["grit"],
                    metallic=m["metallic"], metal_f=m["mf"] * s, attack=0.5, release=0.12)
        place(y, sc, 0.05, 0.55)
    seat_t = 0.205
    hv = 1.3 if heavy else 1.0
    seat = click(rng, 2600 * s / hv, 0.014 * hv, n_modes=7, hard=1.4, noise=0.55, body_f=m["body"] * s,
                 body=0.7, body_decay=0.018 * hv, ring=0.15 if mat != "polymer" else 0.0, ring_decay=0.07)
    place(y, seat, seat_t, 1.0)
    place(y, click(rng, 4300 * s, 0.006, n_modes=4, noise=0.5), seat_t + 0.007, 0.45)  # catch engages
    place(y, thud(rng, 0.1, 170 * s, 90 * s, tau=0.02, noise_lp=900), seat_t, 0.35)  # palm push
    return y


def _charge(rng, s, mat="alu", L=0.65, heavy=False, rattle_amt=0.0, spring_amt=0.4, pull=0.2, gap=0.07):
    m = MATS[mat]
    y = np.zeros(ns(L))
    place(y, click(rng, 3400 * s, 0.006, n_modes=4), 0.02, 0.3)  # finger on the handle
    sc = scrape(rng, pull, 1700 * s, 2500 * s, q=2.8, grit=0.45, metallic=max(0.3, m["metallic"]),
                metal_f=2400 * s, attack=0.35, release=0.15)
    place(y, sc, 0.03, 0.5)
    place(y, tension(rng, pull, 500 * s, 1100 * s), 0.03, 0.2)  # recoil spring compressing
    t_back = 0.03 + pull
    place(y, click(rng, 2300 * s, 0.012, body_f=420 * s, body=0.4), t_back, 0.7)
    t_rel = t_back + gap
    sc2 = scrape(rng, 0.025, 2600 * s, 1800 * s, q=2.5, grit=0.3, metallic=0.4, metal_f=2400 * s,
                 attack=0.2, release=0.3)
    place(y, sc2, t_rel, 0.45)
    hv = 0.85 if heavy else 1.0
    slam = click(rng, 2100 * s * hv, 0.018 / hv, n_modes=8, hard=1.5, noise=0.6, body_f=360 * s, body=0.75,
                 body_decay=0.02, ring=0.2, ring_decay=0.06)
    place(y, slam, t_rel + 0.025, 1.0)
    if spring_amt:
        place(y, spring(rng, 0.18, 400 * s, tau=0.055), t_rel + 0.027, spring_amt * 0.35)
    if rattle_amt:
        place(y, rattle(rng, 0.15, 3, 0.03, 1500 * s, 3000 * s), t_rel + 0.035, rattle_amt)
    return y


def _slam_forward(rng, s, y, t, spring_amt=0.3, ring=0.2):
    place(y, scrape(rng, 0.02, 2600 * s, 1900 * s, q=2.5, grit=0.3, metallic=0.4, metal_f=2400 * s,
                    attack=0.2, release=0.3), t, 0.4)
    place(y, click(rng, 2150 * s, 0.018, n_modes=8, hard=1.5, noise=0.6, body_f=380 * s, body=0.7,
                   ring=ring, ring_decay=0.08), t + 0.02, 1.0)
    if spring_amt:
        place(y, spring(rng, 0.18, 400 * s, tau=0.055), t + 0.022, spring_amt)


# --- weapon specific recipes ------------------------------------------------------------------
def m9_slide_back(rng):
    s = 1.3
    y = np.zeros(ns(0.4))
    place(y, click(rng, 3600 * s, 0.005, n_modes=4), 0.02, 0.25)
    place(y, scrape(rng, 0.12, 2300 * s, 1850 * s, q=3.0, grit=0.35, metallic=0.5, metal_f=2500 * s,
                    attack=0.3, release=0.2), 0.03, 0.5)
    place(y, tension(rng, 0.12, 600 * s, 1200 * s), 0.03, 0.2)
    place(y, click(rng, 2200 * s, 0.012, body_f=600, body=0.45, ring=0.12, ring_decay=0.05), 0.155, 0.9)
    place(y, click(rng, 4200 * s, 0.005, n_modes=4), 0.165, 0.35)  # slide stop pops up
    return y


def m9_slide_release(rng):
    s = 1.3
    y = np.zeros(ns(0.4))
    place(y, click(rng, 4800, 0.005, n_modes=4, noise=0.5), 0.02, 0.5)
    _slam_forward(rng, s, y, 0.035, spring_amt=0.08, ring=0.15)
    place(y, rattle(rng, 0.1, 2, 0.02, 3500, 5000, decay=0.005), 0.065, 0.25)
    return y


def rev_cylinder_open(rng):
    y = np.zeros(ns(0.5))
    place(y, click(rng, 3600, 0.008, n_modes=5, noise=0.5), 0.02, 0.6)
    place(y, scrape(rng, 0.08, 1800, 2300, q=3.0, grit=0.3, metallic=0.35, metal_f=2600), 0.04, 0.35)
    for i in range(5):  # cylinder spins freely on the crane: ratchet ticks
        place(y, click(rng, 4200 * rng.uniform(0.95, 1.05), 0.004, n_modes=4, noise=0.5), 0.05 + i * 0.014, 0.45 * 0.8 ** i)
    place(y, click(rng, 2300, 0.012, body_f=500, body=0.45, ring=0.35, ring_decay=0.09), 0.13, 0.9)
    return y


def rev_eject(rng):
    L = 0.95
    y = np.zeros(ns(L))
    place(y, scrape(rng, 0.06, 2200, 2600, q=3.0, grit=0.3, metallic=0.5, metal_f=2800), 0.02, 0.4)
    place(y, click(rng, 3000, 0.008, n_modes=5), 0.075, 0.5)
    place(y, scrape(rng, 0.05, 3500, 3000, q=1.5, grit=0.5, metallic=0.4, metal_f=3600), 0.08, 0.3)
    for _ in range(6):  # six casings drop and tinkle
        f0 = rng.uniform(2700, 4000)
        first = 0.2 + rng.uniform(0.0, 0.18)
        seq = bounces(rng, L - first, lambda r, i, f0=f0: casing_ping(r, f0 * r.uniform(0.99, 1.01), 0.09, 0.3),
                      first=0.0, dt0=rng.uniform(0.06, 0.1), r=0.6, count=int(rng.integers(3, 5)), amp_r=0.5)
        place(y, seq, first, rng.uniform(0.5, 0.9))
    return y


def rev_speedloader(rng):
    y = np.zeros(ns(0.65))
    for i in range(6):  # rounds slide into the chambers
        sc = scrape(rng, 0.05, 3200, 2600, q=4.0, grit=0.3, metallic=0.6, metal_f=3800, attack=0.2, release=0.5)
        place(y, sc, 0.03 + i * 0.006 + rng.uniform(0, 0.004), 0.3)
    for _ in range(3):
        place(y, casing_ping(rng, rng.uniform(3500, 5000), 0.02, 0.1), rng.uniform(0.03, 0.07), 0.25)
    place(y, tock(rng, 900, 0.01), 0.1, 0.45)
    place(y, click(rng, 2800, 0.010, body_f=520, body=0.4), 0.1, 0.6)
    place(y, click(rng, 3400, 0.008, n_modes=5), 0.28, 0.7)  # twist the knob
    place(y, click(rng, 4300, 0.004, n_modes=4), 0.292, 0.3)
    place(y, scrape(rng, 0.08, 2400, 2000, q=2.0, grit=0.4, metallic=0.2, metal_f=2200), 0.34, 0.35)
    return y


def rev_cylinder_close(rng):
    y = np.zeros(ns(0.45))
    place(y, scrape(rng, 0.05, 2000, 1700, q=2.5, grit=0.3, metallic=0.3, metal_f=2400), 0.02, 0.35)
    place(y, click(rng, 2700, 0.014, n_modes=7, hard=1.4, body_f=560, body=0.6, ring=0.25, ring_decay=0.07), 0.075, 1.0)
    place(y, click(rng, 4300, 0.004, n_modes=4), 0.085, 0.4)
    place(y, click(rng, 4300, 0.004, n_modes=4), 0.097, 0.3)
    return y


def rev_hammer(rng):
    y = np.zeros(ns(0.35))
    place(y, tock(rng, 800, 0.008), 0.01, 0.2)
    place(y, click(rng, 4300, 0.005, n_modes=4), 0.04, 0.4)  # pawl indexes the cylinder
    place(y, click(rng, 3600, 0.006, n_modes=5), 0.07, 0.3)
    place(y, click(rng, 2500, 0.012, n_modes=7, hard=1.3, body_f=520, body=0.45, ring=0.2, ring_decay=0.06), 0.115, 1.0)
    place(y, click(rng, 4600, 0.004, n_modes=4), 0.121, 0.3)
    return y


def mp5_charge_back(rng):
    s = 1.1
    y = np.zeros(ns(0.45))
    place(y, click(rng, 3400 * s, 0.005, n_modes=4), 0.02, 0.3)
    place(y, scrape(rng, 0.14, 2200 * s, 2900 * s, q=3.0, grit=0.4, metallic=0.6, metal_f=2600 * s,
                    attack=0.35, release=0.15), 0.03, 0.5)
    place(y, tension(rng, 0.14, 600, 1300), 0.03, 0.2)
    place(y, click(rng, 2500 * s, 0.012, body_f=480, body=0.4, ring=0.35, ring_decay=0.1), 0.17, 0.95)
    return y


def mp5_charge_slap(rng):
    s = 1.1
    y = np.zeros(ns(0.45))
    place(y, thud(rng, 0.08, 260, 140, tau=0.015, noise_lp=2500, noise_amt=0.9), 0.03, 0.55)  # palm slap
    place(y, noise_burst(rng, 0.03, 500, 4000, 0.003), 0.03, 0.4)
    place(y, click(rng, 3000 * s, 0.006, n_modes=4), 0.035, 0.4)
    _slam_forward(rng, s, y, 0.04, spring_amt=0.1, ring=0.3)
    ring = modal(ns(0.4), np.array([2650, 4120, 5980]) * s, [0.15, 0.1, 0.07], [1.0, 0.5, 0.3])
    place(y, normalize(ring), 0.062, 0.35)
    return y


def ar15_bolt_release(rng):
    y = np.zeros(ns(0.4))
    place(y, click(rng, 4400, 0.006, n_modes=5, noise=0.5), 0.02, 0.5)
    _slam_forward(rng, 1.0, y, 0.035, spring_amt=0.16, ring=0.2)
    return y


def pump_back(rng):
    s = 0.85
    y = np.zeros(ns(0.35))
    place(y, wood_knock(rng, 520, 0.012, 0.1), 0.01, 0.3)  # hand grips the forend
    place(y, scrape(rng, 0.11, 700, 1100, q=1.6, grit=0.6, metallic=0.15, metal_f=1300, am_rate=45.0), 0.015, 0.6)
    place(y, click(rng, 1700 * s * 1.1, 0.016, n_modes=7, hard=1.3, noise=0.55, body_f=300, body=0.6, ring=0.15,
                   ring_decay=0.05), 0.125, 1.0)
    place(y, click(rng, 3200, 0.006, n_modes=4), 0.13, 0.35)
    return y


def pump_forward(rng):
    y = np.zeros(ns(0.35))
    place(y, scrape(rng, 0.10, 1100, 750, q=1.6, grit=0.6, metallic=0.15, metal_f=1300, am_rate=45.0), 0.015, 0.6)
    place(y, click(rng, 1900, 0.018, n_modes=7, hard=1.4, noise=0.6, body_f=280, body=0.7, ring=0.2,
                   ring_decay=0.06), 0.12, 1.0)
    place(y, click(rng, 3600, 0.005, n_modes=4), 0.123, 0.3)
    place(y, wood_knock(rng, 480, 0.015, 0.1), 0.12, 0.3)
    return y


def pump_shell_insert(rng):
    y = np.zeros(ns(0.35))
    place(y, click(rng, 3000, 0.006, n_modes=4), 0.03, 0.35)  # loading gate flap
    place(y, scrape(rng, 0.08, 1300, 1000, q=2.0, grit=0.5, metallic=0.15, metal_f=1500), 0.03, 0.5)
    place(y, tension(rng, 0.08, 400, 700), 0.035, 0.15)
    place(y, click(rng, 2600, 0.008, body_f=700, body=0.4), 0.115, 0.8)  # shell latch
    place(y, tock(rng, 650, 0.012), 0.115, 0.4)  # thumb / plastic hull
    place(y, spring(rng, 0.12, 600, tau=0.05, chirps=2, chirp_amt=0.3), 0.12, 0.12)
    return y


def sniper_bolt_up(rng):
    s = 0.9
    y = np.zeros(ns(0.3))
    place(y, tock(rng, 900, 0.006), 0.015, 0.25)
    place(y, scrape(rng, 0.05, 1800 * s, 2400 * s, q=3.0, grit=0.3, metallic=0.6, metal_f=2300 * s), 0.035, 0.4)
    place(y, tension(rng, 0.05, 600, 1100), 0.035, 0.2)
    place(y, click(rng, 2500 * s, 0.014, body_f=420, body=0.5), 0.05, 0.85)
    place(y, click(rng, 4000 * s, 0.005, n_modes=4), 0.06, 0.3)
    return y


def sniper_bolt_back(rng):
    s = 0.9
    y = np.zeros(ns(0.45))
    place(y, scrape(rng, 0.2, 2100 * s, 2500 * s, q=3.2, grit=0.25, metallic=0.6, metal_f=2300 * s,
                    attack=0.25, release=0.2), 0.02, 0.6)
    place(y, click(rng, 3000 * s, 0.010, n_modes=5), 0.2, 0.6)  # extractor flicks the case
    place(y, click(rng, 2200 * s, 0.012, body_f=400, body=0.5), 0.215, 0.9)  # bolt stop
    place(y, casing_ping(rng, 3800, 0.08, 0.2), 0.24, 0.35)
    return y


def sniper_bolt_forward(rng):
    s = 0.9
    y = np.zeros(ns(0.45))
    place(y, scrape(rng, 0.17, 2500 * s, 2100 * s, q=3.2, grit=0.25, metallic=0.6, metal_f=2300 * s,
                    attack=0.2, release=0.25), 0.02, 0.55)
    place(y, click(rng, 3200 * s, 0.008, n_modes=5), 0.06, 0.4)  # strips a round
    place(y, click(rng, 2300 * s, 0.016, n_modes=7, body_f=380, body=0.6), 0.19, 0.9)  # chambers
    return y


def sniper_bolt_down(rng):
    s = 0.9
    y = np.zeros(ns(0.3))
    place(y, click(rng, 2200 * s, 0.016, n_modes=7, hard=1.4, body_f=400, body=0.7, ring=0.15, ring_decay=0.06), 0.04, 1.0)
    place(y, click(rng, 3800 * s, 0.005, n_modes=4), 0.045, 0.35)
    place(y, thud(rng, 0.08, 180, 100, tau=0.015, noise_lp=800), 0.04, 0.3)
    return y


def lmg_cover_open(rng):
    y = np.zeros(ns(0.55))
    place(y, click(rng, 2500, 0.010, n_modes=5, body_f=400, body=0.3), 0.02, 0.6)
    place(y, scrape(rng, 0.18, 900, 1500, q=5.0, grit=0.7, grain_rate=120.0, metallic=0.3, metal_f=1200,
                    attack=0.3, release=0.3), 0.04, 0.45)
    place(y, click(rng, 1500, 0.020, n_modes=7, body_f=330, body=0.5, ring=0.3, ring_decay=0.1), 0.24, 0.9)
    place(y, rattle(rng, 0.15, 4, 0.06, 3200, 5500, decay=0.01, ring=0.15), 0.245, 0.3)
    return y


def lmg_box_out(rng):
    y = np.zeros(ns(0.6))
    place(y, click(rng, 2200, 0.010, n_modes=5, body_f=500, body=0.3), 0.02, 0.6)
    place(y, scrape(rng, 0.2, 1100, 800, q=1.8, grit=0.5, metallic=0.15, metal_f=1300, attack=0.2, release=0.4), 0.06, 0.6)
    place(y, rattle(rng, 0.3, 8, 0.2, 3000, 5500, decay=0.012, ring=0.2), 0.1, 0.45)
    place(y, tock(rng, 500, 0.016), 0.27, 0.5)
    return y


def lmg_box_in(rng):
    y = np.zeros(ns(0.6))
    place(y, scrape(rng, 0.17, 800, 1150, q=1.8, grit=0.5, metallic=0.15, metal_f=1300, attack=0.5, release=0.1), 0.03, 0.6)
    place(y, rattle(rng, 0.2, 6, 0.15, 3000, 5500, decay=0.012, ring=0.2), 0.05, 0.35)
    place(y, click(rng, 1900, 0.018, n_modes=7, hard=1.4, noise=0.55, body_f=420, body=0.6), 0.22, 1.0)
    place(y, click(rng, 4000, 0.005, n_modes=4), 0.228, 0.4)
    place(y, tock(rng, 600, 0.014), 0.22, 0.4)
    return y


def lmg_belt(rng):
    y = np.zeros(ns(0.7))
    place(y, rattle(rng, 0.45, 16, 0.3, 3000, 6500, decay=0.015, ring=0.2), 0.05, 0.6)
    place(y, scrape(rng, 0.2, 3000, 2500, q=1.2, grit=0.5, metallic=0.4, metal_f=3500), 0.06, 0.25)
    place(y, click(rng, 2100, 0.016, n_modes=7, body_f=380, body=0.6), 0.38, 0.85)
    place(y, rattle(rng, 0.2, 4, 0.06, 3500, 6000, decay=0.012, ring=0.2), 0.39, 0.3)
    return y


def lmg_cover_close(rng):
    y = np.zeros(ns(0.5))
    place(y, scrape(rng, 0.07, 1400, 1000, q=3.0, grit=0.5, metallic=0.3, metal_f=1200), 0.02, 0.35)
    place(y, click(rng, 1250, 0.024, n_modes=8, hard=1.5, noise=0.6, body_f=260, body=0.8, body_decay=0.03,
                   ring=0.3, ring_decay=0.12), 0.095, 1.0)
    place(y, click(rng, 3200, 0.010, n_modes=5), 0.104, 0.55)
    place(y, rattle(rng, 0.12, 3, 0.04, 3200, 5500, decay=0.01, ring=0.15), 0.11, 0.3)
    return y


def lmg_charge(rng):
    y = np.zeros(ns(0.75))
    place(y, tock(rng, 700, 0.01), 0.02, 0.3)
    place(y, scrape(rng, 0.26, 1300, 1900, q=2.8, grit=0.5, metallic=0.55, metal_f=1700, attack=0.35, release=0.15), 0.03, 0.55)
    place(y, tension(rng, 0.26, 400, 900), 0.03, 0.22)
    place(y, click(rng, 1700, 0.018, n_modes=7, hard=1.3, body_f=330, body=0.6, ring=0.2, ring_decay=0.07), 0.3, 1.0)
    place(y, scrape(rng, 0.08, 1900, 1500, q=2.5, grit=0.4, metallic=0.3, metal_f=1800), 0.38, 0.35)
    place(y, click(rng, 2600, 0.010, body_f=400, body=0.3), 0.47, 0.65)
    return y


# (weapon, event) -> (builder, length_s)
MECH = {
    ("m9", "mag_out"): (lambda r: _mag_out(r, 1.3, "steel", 0.45), 0.45),
    ("m9", "mag_in"): (lambda r: _mag_in(r, 1.3, "steel", 0.45), 0.45),
    ("m9", "slide_back"): (m9_slide_back, 0.4),
    ("m9", "slide_release"): (m9_slide_release, 0.4),
    ("revolver", "cylinder_open"): (rev_cylinder_open, 0.5),
    ("revolver", "eject"): (rev_eject, 0.95),
    ("revolver", "speedloader"): (rev_speedloader, 0.65),
    ("revolver", "cylinder_close"): (rev_cylinder_close, 0.45),
    ("revolver", "hammer"): (rev_hammer, 0.35),
    ("vector9", "mag_out"): (lambda r: _mag_out(r, 1.15, "polymer", 0.45), 0.45),
    ("vector9", "mag_in"): (lambda r: _mag_in(r, 1.15, "polymer", 0.5), 0.5),
    ("vector9", "charge"): (lambda r: _charge(r, 1.15, "polymer", 0.55, pull=0.16, spring_amt=0.3), 0.55),
    ("mp5", "mag_out"): (lambda r: _mag_out(r, 1.1, "steel", 0.5), 0.5),
    ("mp5", "mag_in"): (lambda r: _mag_in(r, 1.1, "steel", 0.55), 0.55),
    ("mp5", "charge_back"): (mp5_charge_back, 0.45),
    ("mp5", "charge_slap"): (mp5_charge_slap, 0.45),
    ("ar15", "mag_out"): (lambda r: _mag_out(r, 1.0, "alu", 0.5), 0.5),
    ("ar15", "mag_in"): (lambda r: _mag_in(r, 1.0, "alu", 0.55), 0.55),
    ("ar15", "charge"): (lambda r: _charge(r, 1.0, "alu", 0.65, spring_amt=0.55, pull=0.2), 0.65),
    ("ar15", "bolt_release"): (ar15_bolt_release, 0.4),
    ("ak", "mag_out"): (lambda r: _mag_out(r, 0.85, "steel", 0.55, rock=True, heavy=True), 0.55),
    ("ak", "mag_in"): (lambda r: _mag_in(r, 0.85, "steel", 0.6, rock=True, heavy=True), 0.6),
    ("ak", "charge"): (lambda r: _charge(r, 0.85, "steel", 0.7, heavy=True, rattle_amt=0.5, spring_amt=0.25,
                                         pull=0.18), 0.7),
    ("bullpup", "mag_out"): (lambda r: _mag_out(r, 1.05, "polymer", 0.5), 0.5),
    ("bullpup", "mag_in"): (lambda r: _mag_in(r, 1.05, "polymer", 0.5), 0.5),
    ("bullpup", "charge"): (lambda r: _charge(r, 1.05, "polymer", 0.55, pull=0.13, spring_amt=0.2,
                                              rattle_amt=0.3), 0.55),
    ("pump_shotgun", "pump_back"): (pump_back, 0.35),
    ("pump_shotgun", "pump_forward"): (pump_forward, 0.35),
    ("pump_shotgun", "shell_insert"): (pump_shell_insert, 0.35),
    ("auto_shotgun", "mag_out"): (lambda r: _mag_out(r, 0.8, "polymer", 0.55, rock=True, heavy=True), 0.55),
    ("auto_shotgun", "mag_in"): (lambda r: _mag_in(r, 0.8, "polymer", 0.6, rock=True, heavy=True), 0.6),
    ("auto_shotgun", "charge"): (lambda r: _charge(r, 0.8, "steel", 0.7, heavy=True, rattle_amt=0.4,
                                                   spring_amt=0.3, pull=0.2), 0.7),
    ("sniper", "bolt_up"): (sniper_bolt_up, 0.3),
    ("sniper", "bolt_back"): (sniper_bolt_back, 0.45),
    ("sniper", "bolt_forward"): (sniper_bolt_forward, 0.45),
    ("sniper", "bolt_down"): (sniper_bolt_down, 0.3),
    ("sniper", "mag_out"): (lambda r: _mag_out(r, 0.9, "steel", 0.5), 0.5),
    ("sniper", "mag_in"): (lambda r: _mag_in(r, 0.9, "steel", 0.55, heavy=True), 0.55),
    ("dmr", "mag_out"): (lambda r: _mag_out(r, 0.92, "steel", 0.5), 0.5),
    ("dmr", "mag_in"): (lambda r: _mag_in(r, 0.92, "steel", 0.55, heavy=True), 0.55),
    ("dmr", "charge"): (lambda r: _charge(r, 0.92, "alu", 0.65, heavy=True, spring_amt=0.4, pull=0.2), 0.65),
    ("lmg", "cover_open"): (lmg_cover_open, 0.55),
    ("lmg", "box_out"): (lmg_box_out, 0.6),
    ("lmg", "box_in"): (lmg_box_in, 0.6),
    ("lmg", "belt"): (lmg_belt, 0.7),
    ("lmg", "cover_close"): (lmg_cover_close, 0.5),
    ("lmg", "charge"): (lmg_charge, 0.75),
}


def render_mech(weapon: str, event: str, rng) -> np.ndarray:
    fn, length = MECH[(weapon, event)]
    y = fn(rng)
    y = softclip(normalize(y), 1.5)
    return finish(y, LEVEL_MECH, length=length, fout=0.04)
