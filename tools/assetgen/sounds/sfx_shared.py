"""Shared (non weapon specific) sounds: generic mechanics, casings, bullet impacts per surface,
ricochets, near-miss whiz, hit markers and UI."""
from __future__ import annotations

import numpy as np

from sfx_dsp import (TWO_PI, add_space, bp, crackle, env_exp, env_swell, eq, finish, hp, lp, make_ir,
                     modal, normalize, ns, osc, place, reso, softclip, svf, taper, tvec, white)
from sfx_foley import (bounces, casing_ping, click, cloth, grain_cloud, noise_burst, rattle, scrape, spring,
                       thud, tock, wood_knock)

LEVEL_IMPACT = -4.0
LEVEL_BULLET = -4.0
LEVEL_WHIZ = -3.0
LEVEL_MECH = -10.0
LEVEL_CASING = -10.0
LEVEL_UI = -10.0
LEVEL_HIT = -11.0
T0 = 0.008  # onset of impulsive sounds (keeps codec pre-echo off the file start)


def _small_space(rng, y, rt=0.35, wet=0.08, lp_hz=6000.0):
    return add_space(y, make_ir(rng, rt, dur=rt * 1.1, hf=0.35, lp_hz=lp_hz), wet)


# ============================================================================================
# generic mechanics
# ============================================================================================
def dry_fire(rng):
    p = rng.uniform(0.96, 1.04)
    y = np.zeros(ns(0.3))
    place(y, click(rng, 4200 * p, 0.004, n_modes=4, noise=0.4), 0.01, 0.3)  # trigger take-up
    place(y, click(rng, 2700 * p, 0.012, n_modes=7, hard=1.4, noise=0.6, body_f=520 * p, body=0.5), 0.045, 1.0)
    hollow = modal(ns(0.2), np.array([1150, 1730, 2600]) * p, [0.03, 0.02, 0.012], [1.0, 0.5, 0.3])
    place(y, normalize(hollow), 0.045, 0.45)  # hollow 'tock' of the empty chamber
    place(y, click(rng, 4600 * p, 0.003, n_modes=4), 0.13, 0.15)  # trigger reset
    y = softclip(normalize(y), 1.4)
    return finish(y, -9.0, length=0.3, fout=0.04)


def fire_mode(rng):
    y = np.zeros(ns(0.2))
    place(y, click(rng, 3800, 0.005, n_modes=4, noise=0.3), 0.01, 0.35)
    place(y, click(rng, 3000, 0.008, n_modes=6, hard=1.3, noise=0.5, body_f=650, body=0.35), 0.032, 1.0)
    place(y, click(rng, 4500, 0.003, n_modes=4), 0.038, 0.25)
    y = softclip(normalize(y), 1.3)
    return finish(y, LEVEL_MECH, length=0.2, fout=0.03)


def overheat(rng):
    L = 1.5
    n = ns(L)
    w = white(rng, n)
    hiss = normalize(hp(w, 2500.0, 2)) + 0.6 * normalize(reso(w, 6000.0, 1.5))
    flutter = lp(white(rng, n), 9.0, 2)
    flutter = 0.7 + 0.3 * flutter / (np.max(np.abs(flutter)) + 1e-12)
    hiss = normalize(hiss) * env_exp(n, 0.55, 0.025) * flutter
    sizzle = normalize(bp(crackle(rng, n, 140.0, smooth=0.0001), 2000.0, 9000.0)) * env_exp(n, 0.5, 0.01)
    steam = normalize(bp(white(rng, n), 600.0, 1600.0)) * env_exp(n, 0.3, 0.03)
    y = 0.55 * hiss + 0.3 * sizzle + 0.15 * steam
    times = np.sort(np.concatenate([[0.05], rng.uniform(0.15, 1.3, 8)]))
    for tt in times:  # thermal expansion pings
        place(y, click(rng, rng.uniform(2800, 5500), rng.uniform(0.01, 0.03), n_modes=5, ring=0.3,
                       ring_decay=0.05), tt, rng.uniform(0.3, 0.7))
    y = softclip(normalize(y), 1.3)
    return finish(y, -8.0, length=L, fout=0.3)


def inspect(rng):
    L = 1.2
    y = 0.6 * cloth(rng, L, gestures=3, lo=600.0, hi=4500.0, crinkle=0.25)
    for tt in np.sort(rng.uniform(0.15, 1.0, 3)):
        place(y, click(rng, rng.uniform(1500, 2600), 0.012, hard=0.6, noise=0.15, body_f=rng.uniform(350, 500),
                       body=0.6), tt, rng.uniform(0.35, 0.6))
    place(y, rattle(rng, 0.3, 3, 0.12, 2800, 4500, decay=0.012, ring=0.2), rng.uniform(0.3, 0.8), 0.25)
    place(y, tock(rng, rng.uniform(550, 750), 0.012), rng.uniform(0.5, 1.0), 0.3)
    y = softclip(normalize(y), 1.3)
    return finish(y, -11.0, length=L, fout=0.1)


# ============================================================================================
# casings
# ============================================================================================
def casing_brass(rng):
    L = 0.65
    f0 = rng.uniform(3600, 4600)

    def hit(r, i):
        return casing_ping(r, f0 * r.uniform(0.985, 1.015), decay=r.uniform(0.07, 0.12), dur=0.35,
                           contact=0.35 + 0.1 * i)

    count = int(rng.integers(4, 7))
    y = bounces(rng, L, hit, first=T0, dt0=rng.uniform(0.09, 0.13), r=rng.uniform(0.55, 0.68), count=count,
                amp_r=rng.uniform(0.5, 0.65))
    place(y, tock(rng, 1300, 0.004, 0.03), T0, 0.15)  # the ground's share of the first hit
    t_roll = rng.uniform(0.28, 0.36)
    for i in range(int(rng.integers(3, 6))):  # rolling to a stop
        place(y, casing_ping(rng, f0 * rng.uniform(0.98, 1.02), 0.03, 0.12, contact=0.5), t_roll + i * rng.uniform(0.018, 0.03),
              0.12 * 0.75 ** i)
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_CASING, length=L, fout=0.08)


def casing_shell(rng):
    L = 0.6

    def hit(r, i):
        return normalize(tock(r, r.uniform(650, 850), 0.014, 0.12, noise=0.5)
                         + 0.35 * casing_ping(r, r.uniform(2100, 2500), 0.035, 0.12, contact=0.1))

    y = bounces(rng, L, hit, first=T0, dt0=rng.uniform(0.12, 0.15), r=0.55, count=int(rng.integers(3, 5)), amp_r=0.45)
    place(y, thud(rng, 0.08, 220, 130, tau=0.012, noise_lp=900), T0, 0.3)
    t_roll = rng.uniform(0.3, 0.38)
    for i in range(3):
        place(y, tock(rng, rng.uniform(700, 900), 0.008, 0.05), t_roll + i * 0.03, 0.12 * 0.7 ** i)
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_CASING, length=L, fout=0.08)


# ============================================================================================
# impacts
# ============================================================================================
def _snap(rng, lo=2500.0, tau=0.0012, dur=0.03):
    n = ns(dur)
    return normalize(hp(white(rng, n), lo, 2) * env_exp(n, tau, 0.00003))


def impact_stone(rng):
    L = 0.6
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, _snap(rng, 2500.0, 0.0012), T0, 1.0)
    place(y, noise_burst(rng, 0.08, 700, 3200, 0.006), T0, 0.7)
    f0 = rng.uniform(1700, 2400)
    m = modal(ns(0.1), f0 * np.array([1, 1.37, 1.93, 2.41, 3.1]), [0.012, 0.009, 0.007, 0.005, 0.004],
              [1, 0.8, 0.6, 0.5, 0.3])
    place(y, normalize(m), T0, 0.5)
    place(y, thud(rng, 0.08, 300, 160, tau=0.01, noise_lp=1200), T0, 0.35)

    def grain(r):
        if r.random() < 0.3:  # a pebble with a little pitch
            return click(r, r.uniform(3000, 7000), 0.004, n_modes=3, noise=0.6, dur=0.03)
        g = ns(0.004)
        lo = r.uniform(1200, 3000)
        return normalize(bp(white(r, g), lo, lo * 3.0, 2) * env_exp(g, r.uniform(0.0003, 0.001), 0.00002))

    place(y, normalize(grain_cloud(rng, L, 60, T0 + 0.005, 0.08, grain, gain_tau=0.15)), 0.0, 0.35)
    place(y, normalize(bp(white(rng, n), 1500.0, 6000.0, 2) * env_exp(n, 0.06, 0.004)), T0, 0.07)
    y = _small_space(rng, y, 0.35, 0.08)
    y = softclip(normalize(y), 1.4)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.1)


def impact_dirt(rng):
    L = 0.5
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, thud(rng, 0.25, rng.uniform(150, 175), 70, sweep=0.015, tau=0.03, noise_lp=600, noise_amt=0.9), T0, 1.0)
    place(y, noise_burst(rng, 0.1, 250, 1500, 0.014), T0, 0.9)
    place(y, _snap(rng, 1500.0, 0.0015), T0, 0.25)

    def grain(r):
        g = ns(r.uniform(0.001, 0.004))
        return normalize(bp(white(r, g), r.uniform(600, 1200), r.uniform(2000, 3500)) * np.hanning(g))

    place(y, normalize(grain_cloud(rng, L, 45, T0 + 0.01, 0.09, grain, gain_tau=0.2)), 0.0, 0.35)
    sand = normalize(bp(white(rng, n), 1000.0, 4500.0)) * env_swell(n, 0.02, 0.04, 0.02, 0.25)
    y = y + 0.12 * sand
    y = _small_space(rng, y, 0.3, 0.06, 4000.0)
    y = softclip(normalize(y), 1.5)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.1)


def impact_wood(rng):
    L = 0.5
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, wood_knock(rng, rng.uniform(380, 520), 0.03, 0.3, noise=0.5), T0, 1.0)
    place(y, normalize(reso(white(rng, ns(0.08)), rng.uniform(800, 1000), 3.0) * env_exp(ns(0.08), 0.008, 0.0002)), T0, 0.4)
    place(y, _snap(rng, 1500.0, 0.001), T0, 0.6)

    def splinter(r):
        g = ns(0.02)
        s = normalize(bp(white(r, g), 2000, 7000) * env_exp(g, r.uniform(0.0002, 0.0006), 0.00002))
        return s + 0.4 * click(r, r.uniform(2000, 4000), 0.003, n_modes=3, dur=0.02)

    place(y, normalize(grain_cloud(rng, L, int(rng.integers(10, 17)), T0 + 0.002, 0.02, splinter)), 0.0, 0.4)
    for _ in range(4):
        place(y, tock(rng, rng.uniform(1500, 3000), 0.004, 0.03), rng.uniform(0.1, 0.3), 0.12)
    y = _small_space(rng, y, 0.3, 0.07)
    y = softclip(normalize(y), 1.3)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.1)


def impact_metal(rng):
    L = 0.9
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, _snap(rng, 3000.0, 0.0006), T0, 0.8)
    f0 = rng.uniform(1700, 2500)
    ratios = np.array([1.0, 1.0042, 1.58, 2.37, 2.94, 3.71, 4.65, 5.3]) * (1 + rng.uniform(-0.02, 0.02, 8))
    ratios[1] = ratios[0] * rng.uniform(1.002, 1.006)  # beating partner of the fundamental
    decs = np.array([0.45, 0.42, 0.3, 0.22, 0.16, 0.11, 0.08, 0.06]) * rng.uniform(0.85, 1.15, 8)
    amps = np.array([1.0, 0.6, 0.55, 0.5, 0.35, 0.3, 0.2, 0.15]) * rng.uniform(0.7, 1.0, 8)
    place(y, normalize(modal(ns(L), f0 * ratios, decs, amps)), T0, 0.9)
    fb = rng.uniform(600, 900)
    place(y, normalize(modal(ns(0.5), fb * np.array([1.0, 1.5, 2.2]), [0.12, 0.09, 0.06], [1.0, 0.7, 0.5])), T0, 0.35)
    place(y, noise_burst(rng, 0.05, 1500, 8000, 0.004), T0, 0.3)
    y = _small_space(rng, y, 0.5, 0.1)
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.25)


def impact_glass(rng):
    L = 0.7
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, _snap(rng, 4000.0, 0.0008), T0, 0.9)
    place(y, noise_burst(rng, 0.1, 2500, 11000, 0.015), T0, 0.5)
    place(y, normalize(modal(ns(0.3), np.array([1400, 2300]) * rng.uniform(0.9, 1.1), [0.06, 0.04], [1.0, 0.6])), T0, 0.15)

    def shard(r, big=1.0):
        f = r.uniform(3000, 11000) / big
        g = ns(0.15)
        m = modal(g, [f, f * r.uniform(1.3, 1.9)], [r.uniform(0.02, 0.09), r.uniform(0.01, 0.04)], [1.0, 0.5])
        ct = hp(white(r, g), 5000, 2) * env_exp(g, 0.0002, 0.00002)
        return normalize(normalize(m) + 0.3 * normalize(ct))

    place(y, normalize(grain_cloud(rng, L, 45, T0 + 0.002, 0.06, shard, gain_tau=0.25)), 0.0, 0.5)
    place(y, normalize(grain_cloud(rng, L, 20, T0 + 0.15, 0.12, lambda r: shard(r, 1.2), gain_tau=0.3)), 0.0, 0.3)
    y = _small_space(rng, y, 0.35, 0.08, 9000.0)
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.15)


def _bubble(rng, f0, rise=1.6, tau=0.025, dur=0.08):
    n = ns(dur)
    t = tvec(n)
    f = f0 * (1.0 + (rise - 1.0) * (1.0 - np.exp(-t / (dur * 0.4))))
    return taper(osc(f) * env_exp(n, tau, 0.0008), 0.3)


def impact_water(rng):
    L = 0.7
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, noise_burst(rng, 0.03, 800, 6000, 0.004), T0, 0.6)  # entry slap
    place(y, normalize(_bubble(rng, rng.uniform(280, 380), rise=2.6, tau=0.03, dur=0.1)), T0 + 0.012, 0.9)  # cavity plop
    splash = normalize(bp(white(rng, n), 600.0, 5000.0)) * env_swell(n, T0 + 0.005, 0.02, 0.0, 0.3)
    y = y + 0.45 * splash * env_exp(n, 0.12, 0.0)
    drop = lambda r: _bubble(r, r.uniform(900, 3500), rise=r.uniform(1.3, 1.6), tau=r.uniform(0.005, 0.012), dur=0.03)
    place(y, normalize(grain_cloud(rng, L, 30, T0 + 0.06, 0.15, drop, gain_tau=0.3)), 0.0, 0.35)
    place(y, thud(rng, 0.15, 90, 60, tau=0.03, noise_lp=300), T0, 0.35)
    y = _small_space(rng, y, 0.3, 0.06)
    y = softclip(normalize(y), 1.3)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.15)


def impact_flesh(rng):
    L = 0.35
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, thud(rng, 0.25, rng.uniform(140, 160), 80, sweep=0.012, tau=0.025, noise_lp=900, noise_amt=1.0), T0, 1.0)
    place(y, noise_burst(rng, 0.05, 500, 2200, 0.006), T0, 0.7)
    wet = normalize(lp(crackle(rng, n, 300.0, smooth=0.0004), 1500.0, 2)) * env_exp(n, 0.03, 0.002)
    y = y + 0.18 * wet
    y = lp(y, 3500.0, 2)
    y = softclip(normalize(y), 1.5)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.08)


def impact_soft(rng):
    L = 0.35
    n = ns(L + 0.05)
    y = np.zeros(n)
    puff = normalize(lp(white(rng, n), 1100.0, 2)) * env_exp(n, 0.03, 0.002)
    place(y, puff, T0, 1.0)
    place(y, thud(rng, 0.2, 160, 85, tau=0.018, noise_lp=600), T0, 0.5)
    rustle = normalize(bp(white(rng, n) + 3 * crackle(rng, n, 600.0, 0.0001), 2000.0, 5500.0)) * env_exp(n, 0.06, 0.003)
    place(y, rustle, T0, 0.18)
    y = softclip(normalize(y), 1.4)
    return finish(y, LEVEL_IMPACT, length=L, fout=0.08)


# ============================================================================================
# bullets in flight
# ============================================================================================
def ricochet(rng):
    L = rng.uniform(0.75, 0.95)
    n = ns(L + 0.05)
    y = np.zeros(n)
    place(y, noise_burst(rng, 0.05, 1500, 7000, 0.003), T0, 0.7)
    place(y, click(rng, rng.uniform(2500, 4000), 0.01, n_modes=5, ring=0.2), T0, 0.4)
    ts = T0 + 0.008
    m = n - ns(ts)
    t = tvec(m)
    fs, fe = rng.uniform(3200, 4800), rng.uniform(900, 1500)
    t_mid = rng.uniform(0.12, 0.22) * L / 0.85
    w = rng.uniform(0.06, 0.1)
    f = fe + (fs - fe) / (1.0 + np.exp((t - t_mid) / w))
    f = f * (1.0 + 0.03 * (1.0 - np.exp(-t / 0.02)))
    tumble = 1.0 + 0.35 * np.sin(TWO_PI * rng.uniform(35, 70) * t + rng.uniform(0, TWO_PI))
    band = lp(white(rng, m), 220.0, 2)
    band = band / (np.max(np.abs(band)) + 1e-12)
    env = env_exp(m, L * 0.35, 0.012)
    whine = (osc(f) * (0.65 + 0.6 * band) + 0.15 * osc(2.0 * f)) * tumble * env
    place(y, normalize(whine), ts, 0.8)
    air = svf(white(rng, m), f, 5.0) * env
    place(y, normalize(air), ts, 0.25)
    y = add_space(y, make_ir(rng, 0.6, dur=0.6, hf=0.4, lp_hz=7000.0), 0.15)
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_BULLET, length=L, fout=L * 0.3)


def whiz(rng):
    L = rng.uniform(0.36, 0.44)
    n = ns(L + 0.05)
    y = np.zeros(n)
    sn = ns(0.02)
    nw = np.zeros(sn)
    d = ns(0.00025)
    nw[:d] = np.linspace(1.0, -1.0, d)
    snap = normalize(lp(nw, 15000.0, 2)) + normalize(hp(white(rng, sn), 3000.0, 2) * env_exp(sn, 0.0007, 0.00003))
    snap = eq(snap, "highshelf", 4000.0, 0.7, 4.0)
    place(y, normalize(snap), T0, 1.0)
    m = n - ns(T0)
    t = tvec(m)
    fc = 600.0 + (rng.uniform(3500, 5000) - 600.0) * np.exp(-t / rng.uniform(0.05, 0.08))
    env = env_exp(m, rng.uniform(0.06, 0.09), 0.004)
    whoosh = svf(white(rng, m), fc, 2.5) * env
    tone = osc(fc * 0.95) * env
    place(y, normalize(normalize(whoosh) + 0.15 * normalize(tone)), T0 + 0.001, 0.55)
    y = add_space(y, make_ir(rng, 0.3, dur=0.35, hf=0.4, lp_hz=8000.0), 0.1)
    y = softclip(normalize(y), 1.1)
    return finish(y, LEVEL_WHIZ, length=L, fout=L * 0.3)


# ============================================================================================
# hit markers
# ============================================================================================
def _tick(rng, f0, dec, dur, bright=0.0):
    n = ns(dur)
    y = osc(np.full(n, f0)) * env_exp(n, dec, 0.0004)
    y = y + 0.3 * osc(np.full(n, 2.01 * f0)) * env_exp(n, dec * 0.6, 0.0004)
    y = y + 0.4 * osc(np.full(n, 0.45 * f0)) * env_exp(n, 0.006, 0.0004)
    y = y + 0.25 * normalize(bp(white(rng, n), 2500.0, 8000.0) * env_exp(n, 0.0006, 0.00005))
    if bright:
        y = y + bright * osc(np.full(n, 1.66 * f0)) * env_exp(n, dec * 1.5, 0.0004)
    return normalize(y)


def hit_marker(rng):
    y = np.zeros(ns(0.08))
    place(y, _tick(rng, 1850.0, 0.009, 0.075), T0)
    y = lp(y, 9000.0, 2)
    return finish(y, LEVEL_HIT, length=0.08, fout=0.02)


def hit_headshot(rng):
    n = ns(0.12)
    y = np.zeros(n)
    place(y, _tick(rng, 2400.0, 0.008, 0.05), T0, 0.7)
    m = n - ns(T0)
    f = 3150.0
    ding = (osc(np.full(m, f)) * env_exp(m, 0.028, 0.0005) + 0.35 * osc(np.full(m, 2.0 * f)) * env_exp(m, 0.015, 0.0005)
            + 0.2 * osc(np.full(m, 2.76 * f)) * env_exp(m, 0.012, 0.0005))
    place(y, normalize(ding), T0, 1.0)
    y = lp(y, 12000.0, 2)
    return finish(y, LEVEL_HIT + 1.0, length=0.12, fout=0.035)


def hit_kill(rng):
    y = np.zeros(ns(0.12))
    place(y, _tick(rng, 1700.0, 0.009, 0.05), T0, 0.8)
    place(y, _tick(rng, 2300.0, 0.014, 0.065, bright=0.3), T0 + 0.05, 1.0)
    y = lp(y, 10000.0, 2)
    return finish(y, LEVEL_HIT + 1.0, length=0.12, fout=0.02)


# ============================================================================================
# UI
# ============================================================================================
def ui_click(rng):
    y = np.zeros(ns(0.06))
    place(y, click(rng, 2600, 0.004, n_modes=4, noise=0.3, body_f=700, body=0.4, dur=0.05), T0)
    y = lp(y, 10000.0, 2)
    return finish(y, LEVEL_UI - 1.0, length=0.06, fout=0.015)


def ui_attachment_install(rng):
    y = np.zeros(ns(0.45))
    place(y, scrape(rng, 0.16, 1800, 2300, q=3.0, grit=0.4, metallic=0.5, metal_f=2600), 0.02, 0.4)
    for i in range(4):  # rail slots
        place(y, click(rng, 3500, 0.004, n_modes=4), 0.04 + i * 0.032, 0.35)
    place(y, click(rng, 2800, 0.012, n_modes=7, hard=1.4, noise=0.6, body_f=520, body=0.5, ring=0.15), 0.21, 1.0)
    place(y, click(rng, 3600, 0.006, n_modes=4), 0.225, 0.4)
    place(y, thud(rng, 0.08, 200, 120, tau=0.012, noise_lp=1000), 0.21, 0.2)
    y = softclip(normalize(y), 1.4)
    return finish(y, LEVEL_UI, length=0.45, fout=0.05)


def ui_attachment_remove(rng):
    y = np.zeros(ns(0.45))
    place(y, click(rng, 3300, 0.008, n_modes=6, body_f=600, body=0.3), 0.02, 0.9)
    place(y, spring(rng, 0.08, 500, tau=0.03, chirps=1, chirp_amt=0.3), 0.022, 0.12)
    place(y, scrape(rng, 0.18, 2300, 1700, q=3.0, grit=0.4, metallic=0.5, metal_f=2600, attack=0.2, release=0.4), 0.07, 0.4)
    for i in range(4):
        place(y, click(rng, 3500, 0.004, n_modes=4), 0.09 + i * 0.035, 0.3 * 0.8 ** i)
    place(y, click(rng, 4200, 0.004, n_modes=4), 0.25, 0.25)
    y = softclip(normalize(y), 1.4)
    return finish(y, LEVEL_UI, length=0.45, fout=0.05)


def ui_skin_apply(rng):
    L = 0.95
    n = ns(L)
    y = np.zeros(n)
    for tt in (0.01, 0.07):  # agitator ball in the can
        place(y, click(rng, 2200, 0.006, n_modes=4, ring=0.3, ring_decay=0.03), tt, 0.4)
    w = white(rng, n)
    hiss = normalize(hp(w, 3000.0, 2)) + 0.7 * normalize(reso(w, 7000.0, 1.2))
    flutter = lp(white(rng, n), 12.0, 2)
    flutter = 0.8 + 0.2 * flutter / (np.max(np.abs(flutter)) + 1e-12)
    y = y + 0.6 * normalize(hiss) * env_swell(n, 0.09, 0.03, 0.32, 0.1) * flutter
    base = 1568.0
    for i, r in enumerate([1.0, 1.26, 1.5, 2.0, 2.52, 3.0]):  # rising shimmer arpeggio
        m = ns(0.3)
        f = base * r
        ping = (osc(np.full(m, f - 3)) + osc(np.full(m, f + 3), 1.0) + 0.3 * osc(np.full(m, 2 * f))) * env_exp(m, 0.12, 0.002)
        place(y, normalize(ping), 0.38 + i * 0.06, 0.25 + 0.03 * i)
    sheen = normalize(bp(white(rng, n), 6000.0, 12000.0)) * env_swell(n, 0.35, 0.15, 0.1, 0.25)
    y = y + 0.08 * sheen
    y = softclip(normalize(y), 1.2)
    return finish(y, LEVEL_UI, length=L, fout=0.15)


def ui_gunsmith_open(rng):
    L = 1.1
    n = ns(L)
    y = np.zeros(n)
    place(y, click(rng, 2400, 0.010, n_modes=6, body_f=500, body=0.4), 0.02, 0.6)
    t = tvec(n)
    roll_env = env_swell(n, 0.05, 0.08, 0.2, 0.08)
    wob = lp(white(rng, n), 30.0, 2)
    am = 1.0 + 0.8 * np.sin(TWO_PI * 55.0 * t) * np.abs(wob) / (np.max(np.abs(wob)) + 1e-12)
    rolling = normalize(svf(white(rng, n), np.geomspace(300.0, 500.0, n), 1.5)) * am
    y = y + 0.45 * normalize(rolling * roll_env) + 0.3 * normalize(lp(white(rng, n), 200.0, 2) * roll_env)
    place(y, thud(rng, 0.2, 160, 90, tau=0.03, noise_lp=600), 0.42, 0.8)
    place(y, click(rng, 1400, 0.02, n_modes=6, body_f=300, body=0.6), 0.42, 0.7)
    place(y, click(rng, 900, 0.05, n_modes=6, ring=0.3, ring_decay=0.15), 0.44, 0.45)  # big wrench clank
    for i, tt in enumerate(np.sort(rng.uniform(0.43, 0.75, 10))):
        place(y, click(rng, rng.uniform(1200, 5000), rng.uniform(0.02, 0.12), n_modes=6, ring=0.3,
                       ring_decay=rng.uniform(0.05, 0.15)), tt, 0.55 * rng.uniform(0.4, 1.0) * 0.9 ** i)
    y = softclip(normalize(y), 1.3)
    return finish(y, LEVEL_UI + 1.0, length=L, fout=0.2)
