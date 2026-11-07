# Builds assets/textures/galley-steel and galley-laminate from ambientCG CC0 downloads
# plus procedural (numpy) brushing / stipple.
#   python3 -I make_textures.py <dir with extracted Metal012 + Plastic013A 1K-JPG sets> <assets/textures>
import sys, os
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
N = 1024
rng = np.random.default_rng(7)

def load(path, mode='L'):
    return np.asarray(Image.open(path).convert(mode).resize((N, N), Image.LANCZOS)).astype(np.float32) / 255.0

def save(arr, path, mode='L'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    a = np.clip(arr * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a, mode).save(path, quality=82, optimize=True)

def blur_x(a, r):
    # box blur along x (wraps) repeated -> approx gaussian streaks
    out = a.copy()
    for _ in range(3):
        c = np.cumsum(np.concatenate([out[:, -r:], out, out[:, :r]], axis=1), axis=1)
        out = (c[:, 2 * r:] - c[:, :-2 * r]) / (2 * r)
        out = out[:, :N] if out.shape[1] >= N else np.pad(out, ((0, 0), (0, N - out.shape[1])), mode='wrap')
    return out

def blur(a, r):
    return blur_x(blur_x(a, r).T, r).T

def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    n = np.stack([-gx, gy, np.ones_like(h)], -1)   # OpenGL convention (+Y up)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def find(prefix, kind):
    for root, _, files in os.walk(src):
        for f in files:
            if f.startswith(prefix) and f.endswith(kind + '.jpg'):
                return os.path.join(root, f)
    raise FileNotFoundError(prefix + kind)

# ------------------------------------------------------------------ brushed stainless steel
fine = rng.standard_normal((N, N)).astype(np.float32)
streak = blur_x(fine, 48)                      # long horizontal brushing
streak2 = blur_x(rng.standard_normal((N, N)).astype(np.float32), 9)
streak = streak / streak.std() * 0.6 + streak2 / streak2.std() * 0.4
smudge = load(find('Metal012', 'Roughness'))
smudge = (smudge - smudge.mean()) / (smudge.std() + 1e-6)
low = blur(rng.standard_normal((N, N)).astype(np.float32), 60)
low = low / (low.std() + 1e-6)
rough = 0.30 + 0.045 * streak + 0.04 * smudge + 0.02 * low
# a few random scratches (thin lines at random angles)
img = np.zeros((N, N), np.float32)
for _ in range(90):
    x0, y0 = rng.uniform(0, N, 2)
    ang = rng.normal(0, 0.25) + (np.pi / 2 if rng.random() < 0.2 else 0)
    ln = rng.uniform(20, 220)
    t = np.linspace(0, 1, int(ln))
    xs = ((x0 + np.cos(ang) * ln * t) % N).astype(int)
    ys = ((y0 + np.sin(ang) * ln * t) % N).astype(int)
    img[ys, xs] += rng.uniform(0.3, 1.0)
rough += 0.12 * np.clip(img, 0, 1)
save(np.clip(rough, 0.12, 0.7), f'{dst}/galley-steel/roughness.jpg')
col = 0.70 + 0.025 * streak + 0.02 * low - 0.03 * np.clip(img, 0, 1)
col = np.stack([col * 0.985, col * 0.99, col * 1.0], -1)
save(np.clip(col, 0, 1), f'{dst}/galley-steel/color.jpg', 'RGB')
h = streak * 0.6 - np.clip(img, 0, 1) * 1.5
save(normal_from_height(h, 0.35), f'{dst}/galley-steel/normal.jpg', 'RGB')

# ------------------------------------------------------------------ galley / lav laminate (fine stipple)
pc = load(find('Plastic013A', 'Color'), 'RGB')
pr = load(find('Plastic013A', 'Roughness'))
st = blur(rng.standard_normal((N, N)).astype(np.float32), 2)
st = st / (st.std() + 1e-6)
st2 = blur(rng.standard_normal((N, N)).astype(np.float32), 6)
st2 = st2 / (st2.std() + 1e-6)
lum = pc.mean(-1)
lum = (lum - lum.mean())
c = 0.86 + lum * 0.22 + 0.008 * st2
col = np.stack([c * 1.0, c * 0.985, c * 0.955], -1)
save(np.clip(col, 0, 1), f'{dst}/galley-laminate/color.jpg', 'RGB')
r = 0.48 + (pr - pr.mean()) * 0.8 + 0.04 * st
save(np.clip(r, 0.2, 0.9), f'{dst}/galley-laminate/roughness.jpg')
save(normal_from_height(st * 0.6 + st2 * 0.4, 0.3), f'{dst}/galley-laminate/normal.jpg', 'RGB')
print('ok')
