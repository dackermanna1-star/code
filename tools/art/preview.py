"""Contact sheets for visual QA (written to build/art-preview/, not committed).

  python3 tools/art/preview.py            # all sheets
  python3 tools/art/preview.py icons      # one sheet: icons | wallpapers | logos | blocks | os
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

from lib import ASSETS, PREVIEW

DARK = (32, 33, 36, 255)
LIGHT = (241, 243, 244, 255)
ACCENT = (61, 139, 253, 255)


def load(rel):
	return Image.open(os.path.join(ASSETS, rel)).convert("RGBA")


def paste(sheet, img, x, y):
	sheet.alpha_composite(img, (x, y))


def nearest(img, w, h):
	return img.resize((w, h), Image.NEAREST)


def icons_sheet():
	import icons
	groups = [("apps", list(icons.APPS)), ("sites", list(icons.SITES)), ("misc", list(icons.MISC)), ("extras", list(icons.EXTRAS))]
	cols = 13
	cell = 150
	rows = sum((len(n) + cols - 1) // cols for _, n in groups)
	sheet = Image.new("RGBA", (cols * cell, rows * cell + 20 * len(groups)), (60, 60, 60, 255))
	d = ImageDraw.Draw(sheet)
	y = 0
	for title, names in groups:
		d.text((4, y + 4), title, fill=(255, 255, 255, 255))
		y += 20
		for i, n in enumerate(names):
			x = (i % cols) * cell
			yy = y + (i // cols) * cell
			img = load(f"textures/gui/icons/{n}.png")
			# top half dark, bottom half light; 32px x2 and 16px x2 (nearest, like the game) + 32 x1 + 16 x1
			for k, bg in enumerate((DARK, LIGHT)):
				by = yy + k * 72
				d.rectangle([x, by, x + cell - 2, by + 71], fill=bg)
				paste(sheet, nearest(img, 64, 64), x + 2, by + 4)
				small = nearest(img, 16, 16)
				paste(sheet, nearest(small, 32, 32), x + 70, by + 4)
				paste(sheet, img, x + 106, by + 4)
				paste(sheet, small, x + 112, by + 40)
				if title in ("misc",):
					# tinted on accent
					pass
			d.text((x + 70, yy + 52), n[:12], fill=(200, 200, 200, 255))
		y += ((len(names) + cols - 1) // cols) * cell
	return sheet


def wallpapers_sheet():
	ids = ["meadow", "sunset", "night", "ocean", "nether", "the_end", "cherry", "snowy", "desert", "aurora"]
	w, h = 480, 270
	sheet = Image.new("RGBA", (w * 2 + 10, (h + 10) * 5), (40, 40, 40, 255))
	for i, n in enumerate(ids):
		img = load(f"textures/gui/wallpapers/{n}.png").resize((w, h), Image.LANCZOS)
		paste(sheet, img, (i % 2) * (w + 10), (i // 2) * (h + 10))
	return sheet


def wallpaper_full(name):
	img = load(f"textures/gui/wallpapers/{name}.png")
	# as displayed: ~780x400 GUI at scale 2 -> 1560x800 screen, nearest; show a 1:1 crop of that
	big = nearest(img, 1560, 878)
	return big


def logos_sheet():
	ids = ["bloogle", "emerazon", "blocktube", "endereats", "bank", "dailyblock", "mineweather", "squawker"]
	sheet = Image.new("RGBA", (2 * (160 * 2 + 20), len(ids) * (32 * 2 + 12)), (0, 0, 0, 255))
	d = ImageDraw.Draw(sheet)
	for i, n in enumerate(ids):
		img = load(f"textures/gui/sites/{n}_logo.png")
		for k, bg in enumerate(((255, 255, 255, 255), (24, 26, 32, 255))):
			x = k * (160 * 2 + 20)
			y = i * (32 * 2 + 12)
			d.rectangle([x, y, x + 160 * 2 + 10, y + 32 * 2 + 10], fill=bg)
			paste(sheet, nearest(img, img.width * 2, img.height * 2), x + 5, y + 5)
	return sheet


def os_sheet():
	sheet = Image.new("RGBA", (700, 300), DARK)
	logo = load("textures/gui/os/logo.png")
	paste(sheet, nearest(logo, 256, 256), 10, 10)
	paste(sheet, logo, 280, 10)
	em = load("textures/gui/os/emerald.png")
	paste(sheet, nearest(em, 90, 90), 280, 100)
	paste(sheet, em, 380, 100)
	ic = load("icon.png")
	paste(sheet, nearest(ic, 256, 256), 420, 10)
	cur = os.path.join(ASSETS, "textures/gui/os/cursor.png")
	if os.path.exists(cur):
		paste(sheet, nearest(load("textures/gui/os/cursor.png"), 64, 64), 280, 200)
	light = Image.new("RGBA", (140, 100), LIGHT)
	light.alpha_composite(logo, (5, 5))
	light.alpha_composite(em, (80, 20))
	paste(sheet, light, 140, 280 - 100)
	return sheet


def blocks_sheet():
	names = ["laptop_shell", "laptop_deck", "laptop_bezel", "laptop_lid", "laptop_logo", "emerazon_box_top", "emerazon_box_front",
		"emerazon_box_side", "ender_eats_bag_front", "ender_eats_bag_end", "ender_eats_bag_top", "ender_eats_bag_fold"]
	tiles = []
	for n in names:
		p = os.path.join(ASSETS, f"textures/block/{n}.png")
		if os.path.exists(p):
			tiles.append((n, Image.open(p).convert("RGBA")))
	k = 6
	cols = 6
	sheet = Image.new("RGBA", (cols * (32 * k + 8), 2 * (32 * k + 8) + 32 * k + 8), (90, 90, 90, 255))
	for i, (n, t) in enumerate(tiles):
		paste(sheet, nearest(t, t.width * k, t.height * k), (i % cols) * (32 * k + 8), (i // cols) * (32 * k + 8))
	scr = Image.open(os.path.join(ASSETS, "textures/block/laptop_screen.png")).convert("RGBA")
	frames = scr.height // 32
	for f in range(frames):
		fr = scr.crop((0, f * 32, 32, f * 32 + 24))
		sx = 4 + (f % 7) * (32 * 4 + 6)
		sy = 2 * (32 * k + 8) + (f // 7) * (24 * 4 + 6)
		paste(sheet, nearest(fr, 32 * 4, 24 * 4), sx, sy)
	return sheet


def zoom(names, k=8, bg=DARK, out="zoom.png"):
	"""Big nearest-neighbour view of some icons (for detailed review)."""
	imgs = [load(f"textures/gui/icons/{n}.png") for n in names]
	sheet = Image.new("RGBA", (len(imgs) * (32 * k + 8), 32 * k + 8 + 40), bg)
	for i, im in enumerate(imgs):
		paste(sheet, nearest(im, 32 * k, 32 * k), i * (32 * k + 8) + 4, 4)
		paste(sheet, nearest(nearest(im, 16, 16), 32, 32), i * (32 * k + 8) + 4, 32 * k + 8)
	path = os.path.join(PREVIEW, out)
	sheet.save(path)
	return path


def sounds_sheet():
	"""Waveform + log-frequency spectrogram of every generated sound (a visual 'listen check')."""
	import glob
	import subprocess

	import numpy as np
	files = sorted(glob.glob(os.path.join(ASSETS, "sounds", "**", "*.ogg"), recursive=True))
	row_h, w = 110, 700
	sheet = Image.new("RGB", (w + 160, row_h * len(files)), (20, 20, 24))
	d = ImageDraw.Draw(sheet)
	for i, f in enumerate(files):
		raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", f, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"],
			capture_output=True, check=True).stdout
		x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
		y0 = i * row_h
		d.text((4, y0 + 4), os.path.relpath(f, os.path.join(ASSETS, "sounds")), fill=(230, 230, 230))
		d.text((4, y0 + 20), f"{len(x) / 44100:.2f}s", fill=(160, 160, 160))
		# x axis: 2.0 s across the sheet (longer sounds are cut)
		span = 3.0 * 44100
		# waveform (top 30 px)
		for px_ in range(w):
			a, b = int(px_ * span / w), int((px_ + 1) * span / w)
			if a >= len(x):
				break
			seg = x[a:max(b, a + 1)]
			hi, lo = seg.max(), seg.min()
			d.line([(160 + px_, y0 + 18 - hi * 15), (160 + px_, y0 + 18 - lo * 15)], fill=(110, 200, 255))
		# spectrogram (bottom 76 px, 80 Hz .. 16 kHz log)
		hop, win = 256, 1024
		frames = max(1, (len(x) - win) // hop)
		spec = np.abs(np.fft.rfft(np.stack([x[k * hop:k * hop + win] * np.hanning(win) for k in range(frames)]) if len(x) > win
			else np.zeros((1, win)), axis=1))
		freqs = np.fft.rfftfreq(win, 1 / 44100)
		db = 20 * np.log10(spec + 1e-9)
		db = np.clip((db - db.max() + 70) / 70, 0, 1)
		for py in range(76):
			fr = 80 * (16000 / 80) ** (1 - py / 75)
			bi = np.searchsorted(freqs, fr)
			for px_ in range(w):
				k = int(px_ * span / w / hop)
				if k >= frames:
					break
				v = db[k, min(bi, len(freqs) - 1)]
				sheet.putpixel((160 + px_, y0 + 32 + py), (int(255 * v), int(180 * v ** 2), int(90 * v ** 3)))
	return sheet


SHEETS = {"sounds": sounds_sheet, "icons": icons_sheet, "wallpapers": wallpapers_sheet, "logos": logos_sheet, "os": os_sheet, "blocks": blocks_sheet}


def main(which):
	os.makedirs(PREVIEW, exist_ok=True)
	for n in which:
		if n.startswith("zoom:"):
			names = n[5:].split(",")
			print(zoom(names, 7, out=f"zoom_{names[0]}.png"))
			continue
		if n.startswith("wp:"):
			img = wallpaper_full(n[3:])
			img.save(os.path.join(PREVIEW, f"wp_{n[3:]}.png"))
			continue
		try:
			img = SHEETS[n]()
		except FileNotFoundError as e:
			print("skip", n, e)
			continue
		path = os.path.join(PREVIEW, f"{n}.png")
		img.save(path)
		print(path)


if __name__ == "__main__":
	main(sys.argv[1:] or list(SHEETS))
