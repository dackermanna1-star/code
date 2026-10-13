"""Foley building blocks: metallic latch clicks, slide scrapes, polymer/wood knocks, springs,
rattles, cloth rustle and brass casing pings. All modal sounds are sums of exponentially damped
inharmonic sinusoids (2-pole resonator banks) plus filtered-noise contact transients.
"""
from __future__ import annotations

import numpy as np

from sfx_dsp import (SR, TWO_PI, bp, crackle, env_exp, env_swell, hp, lp, modal, normalize, ns, osc,
                     place, resonators, rms, svf, sweep_exp, taper, white)

# Inharmonic mode ratios of small stamped/machined steel parts (roughly plate/bar-like).
METAL_RATIOS = np.array([1.0, 1.52, 2.17, 2.61, 3.26, 3.89, 4.73, 5.92, 6.80])
# Thin-walled cylinder (brass casing) ratios.
CASING_RATIOS = np.array([1.0, 1.47, 2.09, 2.87, 3.55, 4.4])


def click(rng, f0: float = 3000.0, decay: float = 0.012, n_modes: int = 6, hard: float = 1.0,
          noise: float = 0.35, body_f: float = 0.0, body: float = 0.0, body_decay: float = 0.012,
          ring: float = 0.0, ring_decay: float = 0.1, spread: float = 0.06, dur: float | None = None) -> np.ndarray:
    """Crisp metallic latch click.

    f0: lowest prominent mode, decay: its decay time constant (higher modes decay faster),
    hard: striking hardness (more upper-mode energy), noise: contact-tick level,
    body_f/body: low receiver/frame resonance ('thock') level, ring: long beating ring level.
    """
    longest = max(decay, body_decay if body else 0.0, ring_decay if ring else 0.0)
    dur = dur or min(1.2, max(0.04, longest * 6.0))
    n = ns(dur)
    nm = min(n_modes, len(METAL_RATIOS))
    ratios = METAL_RATIOS[:nm] * (1.0 + rng.uniform(-spread, spread, nm))
    ratios[0] = 1.0
    freqs = f0 * ratios
    decs = decay * ratios ** -0.6 * rng.uniform(0.75, 1.25, nm)
    amps = rng.uniform(0.45, 1.0, nm) / (1.0 + (freqs / (f0 * 2.5 * hard)) ** 2)
    y = normalize(modal(n, freqs, decs, amps))
    ct = hp(white(rng, n), min(f0 * 0.7, 7000.0), 2) * env_exp(n, 0.00025 + 0.0006 / hard, 0.00003)
    y = y + noise * normalize(ct)
    if ring > 0:
        rf = f0 * rng.uniform(0.92, 1.08) * np.array([1.0, 1.0035, 2.71])
        y = y + ring * normalize(modal(n, rf, [ring_decay, ring_decay * 0.9, ring_decay * 0.4], [1.0, 0.7, 0.3]))
    if body > 0 and body_f > 0:
        bf = body_f * np.array([1.0, 1.63, 2.4])
        bdy = modal(n, bf, [body_decay, body_decay * 0.6, body_decay * 0.4], [1.0, 0.5, 0.25])
        bn = lp(white(rng, n), body_f * 3.0, 2) * env_exp(n, body_decay * 0.5, 0.0002)
        bdy = normalize(bdy) + 0.4 * normalize(bn)
        y = y + body * normalize(bdy)
    return normalize(y)


def scrape(rng, dur: float, f0: float, f1: float, q: float = 2.5, grit: float = 0.4, grain_rate: float = 300.0,
           metallic: float = 0.0, metal_f: float = 2500.0, metal_decay: float = 0.012, attack: float = 0.3,
           release: float = 0.35, am_rate: float = 30.0, am_depth: float = 0.6, curve: float = 1.5) -> np.ndarray:
    """Slide/scrape: band-passed noise sweeping f0->f1 with stick-slip grit and optional metallic
    resonances excited by the friction noise."""
    n = ns(dur)
    x = white(rng, n)
    if grit > 0:
        g = crackle(rng, n, grain_rate, smooth=0.00015)
        x = (1.0 - grit) * x + grit * g * (rms(x) / (rms(g) + 1e-12))
    fc = np.geomspace(max(f0, 20.0), max(f1, 20.0), n)
    y = svf(x, fc, q)
    m = lp(white(rng, n), am_rate, 2)
    m = m / (np.max(np.abs(m)) + 1e-12)
    y = y * np.clip(1.0 + am_depth * m, 0.05, None)
    if metallic > 0:
        nm = 6
        ratios = METAL_RATIOS[:nm] * (1.0 + rng.uniform(-0.05, 0.05, nm))
        res = resonators(y, metal_f * ratios, metal_decay * ratios ** -0.5, rng.uniform(0.4, 1.0, nm))
        mix = 0.6 * metallic
        y = (1.0 - mix) * normalize(y) + mix * normalize(res)
    env = env_swell(n, 0.0, dur * attack, dur * max(0.0, 1.0 - attack - release), dur * release, curve)
    return normalize(y * env)


def thud(rng, dur: float, f0: float = 150.0, f1: float = 60.0, sweep: float = 0.015, tau: float = 0.04,
         noise_lp: float = 500.0, noise_amt: float = 0.6, attack: float = 0.0008) -> np.ndarray:
    """Low body thump: pitch-swept sine + low-passed noise."""
    n = ns(dur)
    s = osc(sweep_exp(n, f0, f1, sweep)) * env_exp(n, tau, attack)
    nz = lp(white(rng, n), noise_lp, 2) * env_exp(n, tau * 0.6, attack)
    return taper(normalize(normalize(s) + noise_amt * normalize(nz)))


def tock(rng, f0: float = 700.0, decay: float = 0.012, dur: float = 0.08, noise: float = 0.5) -> np.ndarray:
    """Hollow polymer/wood knock: a few low, heavily damped modes + soft contact noise."""
    n = ns(dur)
    ratios = np.array([1.0, 1.71, 2.53, 3.4]) * (1.0 + rng.uniform(-0.04, 0.04, 4))
    y = normalize(modal(n, f0 * ratios, decay * ratios ** -0.8, [1.0, 0.6, 0.35, 0.2]))
    ct = bp(white(rng, n), f0, min(f0 * 6.0, 16000.0)) * env_exp(n, 0.0012, 0.0001)
    return normalize(y + noise * normalize(ct))


def wood_knock(rng, f0: float = 450.0, decay: float = 0.03, dur: float = 0.2, noise: float = 0.4) -> np.ndarray:
    """Woody knock: near-harmonic damped modes (beam-like) + bright contact."""
    n = ns(dur)
    ratios = np.array([1.0, 2.03, 3.12, 4.28, 5.6]) * (1.0 + rng.uniform(-0.03, 0.03, 5))
    amps = np.array([1.0, 0.7, 0.45, 0.3, 0.2]) * rng.uniform(0.7, 1.0, 5)
    y = normalize(modal(n, f0 * ratios, decay * ratios ** -0.9, amps))
    ct = bp(white(rng, n), 1200.0, 6000.0) * env_exp(n, 0.0008, 0.00005)
    return normalize(y + noise * normalize(ct))


def spring(rng, dur: float, f0: float = 420.0, tau: float = 0.09, n_part: int = 6, B: float = 0.004,
           droop: float = 0.05, chirps: int = 4, chirp_hi: float = 3200.0, chirp_lo: float = 380.0,
           period: float = 0.016, chirp_len: float = 0.010, chirp_amt: float = 0.6) -> np.ndarray:
    """Coil spring 'boing': dispersive near-harmonic partials with a pitch droop plus repeating
    descending chirps (dispersion echoes travelling along the coil)."""
    n = ns(dur)
    t = np.arange(n) / SR
    y = np.zeros(n)
    dr = 1.0 + droop * np.exp(-t / 0.015)
    for k in range(1, n_part + 1):
        fk = f0 * k * np.sqrt(1.0 + B * k * k) * rng.uniform(0.99, 1.01)
        if fk * (1 + droop) > SR * 0.45:
            break
        y += (1.0 / k ** 0.8) * osc(fk * dr, rng.uniform(0, TWO_PI)) * env_exp(n, tau / k ** 0.5, 0.0005)
    y = normalize(y)
    L = ns(chirp_len)
    for i in range(chirps):
        ch = osc(np.geomspace(chirp_hi, chirp_lo, L)) * np.hanning(L)
        place(y, ch, i * period, chirp_amt * 0.6 ** i)
    return taper(normalize(y), 0.3)


def rattle(rng, dur: float, count: int, span: float, f_lo: float, f_hi: float, decay: float = 0.008,
           start: float = 0.0, level_tau: float | None = None, n_modes: int = 4, noise: float = 0.4,
           ring: float = 0.0) -> np.ndarray:
    """Several small loose-part clicks scattered over ``span`` seconds."""
    n = ns(dur)
    y = np.zeros(n)
    times = start + np.sort(rng.uniform(0.0, span, count))
    for tt in times:
        c = click(rng, rng.uniform(f_lo, f_hi), decay * rng.uniform(0.6, 1.4), n_modes=n_modes, noise=noise,
                  ring=ring, ring_decay=decay * 4.0, dur=max(0.03, decay * 7.0))
        g = rng.uniform(0.35, 1.0)
        if level_tau:
            g *= np.exp(-(tt - start) / level_tau)
        place(y, c, tt, g)
    return normalize(y)


def cloth(rng, dur: float, gestures: int = 2, lo: float = 700.0, hi: float = 5500.0, crinkle: float = 0.35,
          start: float = 0.0, span: float | None = None) -> np.ndarray:
    """Fabric/glove rustle: band-limited noise + crinkle grains, shaped into a few hand gestures."""
    n = ns(dur)
    x = normalize(white(rng, n)) + crinkle * normalize(crackle(rng, n, 900.0, smooth=0.0001))
    x = bp(x, lo, hi, 2)
    m = np.abs(lp(white(rng, n), 18.0, 2))
    m = m / (np.max(m) + 1e-12)
    span = span or dur
    env = np.zeros(n)
    for _ in range(gestures):
        ln = rng.uniform(0.25, 0.5) * span
        st = start + rng.uniform(0.0, max(span - ln, 0.001))
        env += env_swell(n, st, ln * 0.4, ln * 0.1, ln * 0.5, 2.0) * rng.uniform(0.5, 1.0)
    return normalize(x * env * (0.35 + 0.65 * m))


def casing_ping(rng, f0: float = 4000.0, decay: float = 0.12, dur: float = 0.4, contact: float = 0.3) -> np.ndarray:
    """Brass casing impact: bright thin-cylinder modes with long-ish ring."""
    n = ns(dur)
    nm = len(CASING_RATIOS)
    freqs = f0 * CASING_RATIOS * (1.0 + rng.uniform(-0.03, 0.03, nm))
    decs = decay * np.array([1.0, 0.8, 0.55, 0.4, 0.3, 0.22]) * rng.uniform(0.8, 1.2, nm)
    amps = np.array([1.0, 0.7, 0.55, 0.35, 0.25, 0.15]) * rng.uniform(0.5, 1.0, nm)
    y = normalize(modal(n, freqs, decs, amps))
    ct = hp(white(rng, n), 5000.0, 2) * env_exp(n, 0.0003, 0.00003)
    return normalize(y + contact * normalize(ct))


def bounces(rng, dur: float, hit_fn, first: float = 0.004, dt0: float = 0.1, r: float = 0.6, count: int = 5,
            amp_r: float = 0.55) -> np.ndarray:
    """Bouncing object: impacts with geometrically shrinking intervals and amplitudes.
    hit_fn(rng, index) -> impact sound."""
    n = ns(dur)
    y = np.zeros(n)
    t, dt, a = first, dt0, 1.0
    for i in range(count):
        if t > dur - 0.02:
            break
        place(y, hit_fn(rng, i), t, a)
        t += dt * rng.uniform(0.85, 1.15)
        dt *= r
        a *= amp_r * rng.uniform(0.8, 1.15)
    return y


def grain_cloud(rng, dur: float, count: int, t0: float, tau: float, grain_fn, gain_tau: float | None = None,
                t_max: float | None = None) -> np.ndarray:
    """Scatter ``count`` grains with exponentially thinning density after t0 (debris, droplets, shards)."""
    n = ns(dur)
    y = np.zeros(n)
    t_max = t_max or dur * 0.9
    for _ in range(count):
        tt = t0 + rng.exponential(tau)
        if tt >= t_max:
            continue
        g = rng.uniform(0.3, 1.0)
        if gain_tau:
            g *= np.exp(-(tt - t0) / gain_tau)
        place(y, grain_fn(rng), tt, g)
    return y


def noise_burst(rng, dur: float, lo: float, hi: float, tau: float, attack: float = 0.0002, order: int = 2) -> np.ndarray:
    n = ns(dur)
    return normalize(bp(white(rng, n), lo, hi, order) * env_exp(n, tau, attack))


def tension(rng, dur: float, f0: float, f1: float, q: float = 6.0) -> np.ndarray:
    """Spring-compression 'zzz': resonant noise rising in pitch, rising in level."""
    n = ns(dur)
    y = svf(white(rng, n), np.geomspace(f0, f1, n), q)
    return normalize(y * env_swell(n, 0.0, dur * 0.8, 0.0, dur * 0.2, 1.0))
