"""Generates every food & painting asset of LaptopCraft (reproducible, run from anywhere):

  python3 tools/art/food/gen_food_assets.py

Writes
  * assets/laptopcraft/textures/item/food/<id>.png, models/item/food/<id>.json, items/<id>.json
  * assets/laptopcraft/textures/painting/<id>.png
  * data/laptopcraft/painting_variant/<id>.json and data/minecraft/tags/painting_variant/placeable.json
  * assets/laptopcraft/lang/parts/food.json
and checks that the painting list matches PaintingContent.GALLERY in Java.
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import food_sprites  # noqa: E402
import paintings  # noqa: E402
import pixel  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
RES = os.path.join(ROOT, 'src', 'main', 'resources')
ASSETS = os.path.join(RES, 'assets', 'laptopcraft')
DATA = os.path.join(RES, 'data')
NS = 'laptopcraft'

# item id -> (display name, flavor line)
FOODS = {
	'pizza_slice': ('Pizza Slice', 'A triangle of happiness. Best eaten mid-mineshaft.'),
	'pepperoni_pizza': ('Pepperoni Pizza', 'A whole pie, still warm from the Nether.'),
	'spaghetti': ('Spaghetti', 'Twirl responsibly. Comes with a reusable bowl.'),
	'cheeseburger': ('Cheeseburger', 'Double-stacked and Ghast-approved.'),
	'fries': ('Fries', 'Crispy, golden and gone in seconds.'),
	'hot_dog': ('Hot Dog', 'A Strider-sized sausage in a soft bun.'),
	'blaze_hot_wings': ('Blaze Hot Wings', 'So spicy you turn fireproof. Briefly.'),
	'fried_chicken_bucket': ('Fried Chicken Bucket', 'No chicken jockeys were harmed.'),
	'taco': ('Taco', "Taco 'bout a crunchy snack."),
	'burrito': ('Burrito', 'Wrapped tighter than a Shulker box.'),
	'nachos': ('Nachos', 'Nacho average snack.'),
	'sushi_roll': ('Sushi Roll', 'Rolled by a very patient Drowned.'),
	'salmon_nigiri': ('Salmon Nigiri', 'So fresh you can breathe underwater.'),
	'ramen_bowl': ('Ramen Bowl', 'Slurping is mandatory. Keep the bowl.'),
	'dumplings': ('Dumplings', 'Pan-fried pockets of joy.'),
	'pancakes': ('Pancakes', 'Stacked high, drowned in syrup.'),
	'croissant': ('Croissant', 'Flaky, buttery, crumbs everywhere.'),
	'donut': ('Donut', 'Unlike a Wither, it has a hole on purpose.'),
	'cupcake': ('Cupcake', 'Frosting-to-cake ratio: perfect.'),
	'ice_cream_cone': ('Ice Cream Cone', 'Risk of brain freeze: 25%.'),
	'golden_apple_pie': ('Golden Apple Pie', "Notch's grandma's secret recipe."),
	'chorus_cookie': ('Chorus Cookie', 'Side effects may include being somewhere else.'),
	'milkshake': ('Milkshake', 'Washes away poison, hunger and regret.'),
	'cola_can': ('Cola', 'Bubbly enough to put a hop in your step.'),
	'iced_coffee': ('Iced Coffee', 'Fuel for 6 AM creeper commutes.'),
	'redstone_rush_energy_drink': ('Redstone Rush Energy Drink', 'Signal strength: 15. Do not drink near TNT.'),
	'sweet_berry_smoothie': ('Sweet Berry Smoothie', 'Thorns removed by hand. Mostly.'),
}
EXTRA_LANG = {
	'item.laptopcraft.pepperoni_pizza.hint': 'Sneak + use to cut it into 4 slices',
}

# painting id -> (width, height, title, author); order = gallery order
GALLERY = {
	'mona_llama': (2, 3, 'Mona Llama', 'Leonardo da Villager'),
	'starry_night_sky': (4, 3, 'The Starry Night Sky', 'Vincent van Golem'),
	'creeper_scream': (2, 2, 'The Creeper Scream', 'Edvard Munchcraft'),
	'sunflower_field': (4, 2, 'Sunflower Field', 'Claude Mobnet'),
	'great_wave': (3, 2, 'The Great Wave', 'Katsushika Hokusquid'),
	'emerald_earring': (2, 2, 'Villager with an Emerald Earring', 'Johannes Ver-Miner'),
	'redstone_composition': (2, 2, 'Composition with Redstone', 'Piet Minedrian'),
	'dragon_sunset': (4, 2, 'Ender Dragon Sunset', 'J.M.W. Turnip'),
	'cherry_grove_dawn': (3, 2, 'Cherry Grove at Dawn', 'Utagawa Hirobiome'),
	'diamond_still_life': (2, 2, 'Still Life with Diamond Ore', 'Paul Cobblezanne'),
	'steve_portrait': (1, 1, 'Portrait of Steve', 'Steve (probably)'),
	'netherhawks': (3, 2, 'Netherhawks', 'Edward Hoglin'),
	'villager_gothic': (2, 2, 'Villager Gothic', 'Grant Oakwood'),
	'persistence_of_mining': (3, 2, 'The Persistence of Mining', 'Salvador Dallay'),
	'creation_of_steve': (4, 1, 'The Creation of Steve', 'Michelangelo Buonarr-oak-ti'),
}


def write_json(path: str, obj) -> None:
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, 'w', encoding='utf-8', newline='\n') as f:
		json.dump(obj, f, indent=2, ensure_ascii=False)
		f.write('\n')


def save_png(img, path: str) -> None:
	os.makedirs(os.path.dirname(path), exist_ok=True)
	img.save(path, optimize=True)


def check_java_gallery() -> None:
	java = os.path.join(ROOT, 'src', 'main', 'java', 'com', 'laptopcraft', 'content', 'PaintingContent.java')
	with open(java, encoding='utf-8') as f:
		src = f.read()
	found = re.findall(r'new Masterpiece\("([a-z0-9_]+)", "([^"]+)", (\d+), (\d+),', src)
	java_gallery = {pid: (int(w), int(h), title) for pid, title, w, h in found}
	py_gallery = {pid: (w, h, title) for pid, (w, h, title, _) in GALLERY.items()}
	if java_gallery != py_gallery:
		raise SystemExit(f'PaintingContent.GALLERY and gen_food_assets.GALLERY differ:\n java={java_gallery}\n py={py_gallery}')


def main() -> None:
	lang: dict[str, str] = {}
	missing = set(FOODS) ^ set(food_sprites.SPRITES)
	if missing:
		raise SystemExit(f'food sprite / name mismatch: {sorted(missing)}')
	for item_id, (name, desc) in FOODS.items():
		grid, palette = food_sprites.SPRITES[item_id]
		save_png(pixel.render(grid, palette), os.path.join(ASSETS, 'textures', 'item', 'food', item_id + '.png'))
		write_json(os.path.join(ASSETS, 'models', 'item', 'food', item_id + '.json'),
				{'parent': 'minecraft:item/generated', 'textures': {'layer0': f'{NS}:item/food/{item_id}'}})
		write_json(os.path.join(ASSETS, 'items', item_id + '.json'),
				{'model': {'type': 'minecraft:model', 'model': f'{NS}:item/food/{item_id}'}})
		lang[f'item.{NS}.{item_id}'] = name
		lang[f'item.{NS}.{item_id}.desc'] = desc
	lang.update(EXTRA_LANG)

	check_java_gallery()
	if list(GALLERY) != list(paintings.PAINTINGS):
		raise SystemExit('GALLERY and paintings.PAINTINGS differ')
	for pid, (w, h, title, author) in GALLERY.items():
		canvas = paintings.PAINTINGS[pid]()
		if (canvas.w, canvas.h) != (w * 16, h * 16):
			raise SystemExit(f'{pid}: canvas {canvas.w}x{canvas.h} does not match {w}x{h} blocks')
		save_png(canvas.image(), os.path.join(ASSETS, 'textures', 'painting', pid + '.png'))
		write_json(os.path.join(DATA, NS, 'painting_variant', pid + '.json'), {
			'asset_id': f'{NS}:{pid}',
			'author': {'color': 'gray', 'translate': f'painting.{NS}.{pid}.author', 'fallback': author},
			'height': h,
			'title': {'color': 'yellow', 'translate': f'painting.{NS}.{pid}.title', 'fallback': title},
			'width': w,
		})
		lang[f'painting.{NS}.{pid}.title'] = title
		lang[f'painting.{NS}.{pid}.author'] = author
	write_json(os.path.join(DATA, 'minecraft', 'tags', 'painting_variant', 'placeable.json'),
			{'replace': False, 'values': [f'{NS}:{pid}' for pid in GALLERY]})
	write_json(os.path.join(ASSETS, 'lang', 'parts', 'food.json'), lang)
	print(f'wrote {len(FOODS)} foods, {len(GALLERY)} paintings, {len(lang)} lang keys')


if __name__ == '__main__':
	main()
