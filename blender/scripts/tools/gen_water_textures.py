"""Generate tileable water textures with numpy + Pillow (run: /opt/tts/bin/python gen_water_textures.py).
ripple_normal.png  - capillary/wind-wave normal map from a directional power spectrum
foam_noise.png     - fractal 1/f noise for foam breakup
caustics.png       - caustic network from refracting light through the ripple field"""
import numpy as np
from PIL import Image
OUT = '/home/user/code/blender/assets/textures/'
N = 1024
rng = np.random.default_rng(11)
kx = np.fft.fftfreq(N) * N; ky = np.fft.fftfreq(N) * N
KX, KY = np.meshgrid(kx, ky); K = np.sqrt(KX ** 2 + KY ** 2) + 1e-6

def field(power, dir_bias=0.0, kmin=2, kmax=300, seed=0):
    r = np.random.default_rng(seed)
    ph = r.normal(size=(N, N)) + 1j * r.normal(size=(N, N))
    amp = K ** (-power)
    amp[K < kmin] = 0; amp[K > kmax] = 0
    if dir_bias:
        c = np.abs(KX / K)
        amp *= (1 - dir_bias) + dir_bias * c ** 2
    h = np.real(np.fft.ifft2(ph * amp))
    return (h - h.mean()) / h.std()

def save(name, arr, channels=3, depth='16'):
    a = np.clip(arr, 0, 1)
    if channels == 1:
        Image.fromarray((a * 65535).astype(np.uint16)).save(OUT + name + '.png')
    else:
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGB').save(OUT + name + '.png')

# ripple normals
h = field(1.9, dir_bias=0.35, kmin=3, kmax=220, seed=1)
gy, gx = np.gradient(h)
s = 0.28 / np.sqrt((gx ** 2 + gy ** 2).mean())   # target RMS slope ~0.28
n = np.stack([-gx * s, -gy * s, np.ones_like(h)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
save('ripple_normal', n * 0.5 + 0.5)
# foam fractal noise
f = field(1.25, kmin=2, kmax=400, seed=2); f = (f - f.min()) / (f.max() - f.min())
save('foam_noise', f, 1)
# caustics: inverse Jacobian of the light map through a smooth wave field
hc = field(2.6, kmin=4, kmax=40, seed=3)
lap = np.real(np.fft.ifft2(np.fft.fft2(hc) * -(K ** 2)))
lap /= lap.std()
J = 1.0 + 1.5 * lap
dens = 1.0 / np.maximum(np.abs(J), 0.12)
F = np.fft.fft2(dens); g = np.exp(-(K ** 2) / (2 * (N / 3.0) ** 2)); dens = np.real(np.fft.ifft2(F * g))
dens = (dens - np.percentile(dens, 5)) / (np.percentile(dens, 99.7) - np.percentile(dens, 5)); dens = np.clip(dens, 0, 1) ** 1.6
save('caustics', dens, 1)
print('TEXTURES OK', h.shape)
