package com.laptopcraft.content;

import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.network.Filterable;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.WrittenBookContent;
import net.minecraft.world.level.ItemLike;

/**
 * Vanilla-item products sold on Emerazon (garden, tools, books, pets, grocery...). Product ids use the
 * {@code "market/<name>"} prefix so they can never clash with other content groups.
 */
public final class MarketplaceContent {
	private MarketplaceContent() {
	}

	/** Registers blocks/items. Called during mod init, before the catalog is built. */
	public static void init() {
	}

	/** Adds this group's products to the {@link com.laptopcraft.shop.Catalog}. */
	public static void addProducts() {
		garden();
		tools();
		booksAndMusic();
		pets();
		grocery();
		electronics();
		home();
	}

	private static void garden() {
		String c = Categories.GARDEN;
		add("spring_bouquet", c, "Spring Bouquet Bundle",
				"Poppies, dandelions, cornflowers, alliums, tulips and daisies, hand-picked by a very careful bee. Arrives in a pink bundle.",
				4, r -> bundle(Items.PINK_BUNDLE, "Spring Bouquet",
						stack(Items.POPPY, 4), stack(Items.DANDELION, 4), stack(Items.CORNFLOWER, 4),
						stack(Items.ALLIUM, 4), stack(Items.PINK_TULIP, 4), stack(Items.OXEYE_DAISY, 4)), 48, 1630, "Best Seller");
		add("sapling_sampler", c, "Sapling Sampler (8 trees)",
				"One of every overworld tree, from humble oak to fancy cherry. Forest sold separately (just add time).",
				5, r -> bundle(Items.GREEN_BUNDLE, "Sapling Sampler",
						stack(Items.OAK_SAPLING, 1), stack(Items.BIRCH_SAPLING, 1), stack(Items.SPRUCE_SAPLING, 1),
						stack(Items.JUNGLE_SAPLING, 1), stack(Items.ACACIA_SAPLING, 1), stack(Items.DARK_OAK_SAPLING, 1),
						stack(Items.CHERRY_SAPLING, 1), stack(Items.PALE_OAK_SAPLING, 1)), 46, 820, "");
		add("veggie_seed_kit", c, "Veggie Garden Starter Kit",
				"Wheat, pumpkin, melon and beetroot seeds plus potatoes and carrots. Hoe not included, crows not invited.",
				3, r -> bundle(Items.LIME_BUNDLE, "Veggie Garden Kit",
						stack(Items.WHEAT_SEEDS, 8), stack(Items.PUMPKIN_SEEDS, 4), stack(Items.MELON_SEEDS, 4),
						stack(Items.BEETROOT_SEEDS, 8), stack(Items.POTATO, 4), stack(Items.CARROT, 4)), 45, 512, "");
		add("ancient_seeds", c, "Ancient Seeds (Sniffer-Dug)",
				"Torchflower seeds and a pitcher pod, sniffed out by a professional Sniffer. Sold \"as found\", slightly snouty.",
				6, r -> bundle(Items.ORANGE_BUNDLE, "Ancient Seeds", stack(Items.TORCHFLOWER_SEEDS, 2), stack(Items.PITCHER_POD, 2)), 47, 301, "Limited");
		add("bone_meal", c, "Organic Fertilizer (32)", "100% skeleton-sourced bone meal. Makes plants grow and skeletons nervous.",
				2, Items.BONE_MEAL, 32, 44, 1999, "Deal");
		add("flower_pots", c, "Terracotta Flower Pots (4)", "Give your saplings a home. Also great for storing one (1) cactus.",
				2, Items.FLOWER_POT, 4, 43, 402, "");
		add("garden_lanterns", c, "Garden Lanterns (4)", "Warm light for paths and porches. Keeps mobs away, moths very interested.",
				3, Items.LANTERN, 4, 47, 1144, "");
		add("firefly_bush", c, "Firefly Bush (2)", "A bush full of tiny glowing friends. Night-time ambiance, zero electricity bills.",
				3, Items.FIREFLY_BUSH, 2, 48, 377, "New");
		add("sunflowers", c, "Sunflowers (6)", "Tall, cheerful and always facing east. Built-in compass, no batteries required.",
				2, Items.SUNFLOWER, 6, 45, 266, "");
	}

	private static void tools() {
		String c = Categories.TOOLS;
		add("iron_pickaxe", c, "Iron Pickaxe", "The trusty classic. Mines diamonds, redstone and your free time.",
				6, Items.IRON_PICKAXE, 1, 46, 4402, "Best Seller");
		add("diamond_pickaxe", c, "Diamond Pickaxe", "Premium mining in sparkling blue. Pays for itself after the first vein (probably).",
				24, Items.DIAMOND_PICKAXE, 1, 49, 2871, "");
		add("diamond_sword", c, "Diamond Sword", "For defending your shopping deliveries from zombies. Self-sharpening* (*not really).",
				20, Items.DIAMOND_SWORD, 1, 48, 1984, "");
		add("spyglass", c, "Spyglass", "See your Emerazon courier coming from 64 blocks away. Also good for spotting Ghasts.",
				5, Items.SPYGLASS, 1, 47, 640, "");
		add("compass", c, "Compass", "Always points to spawn — the one place it remembers.",
				4, Items.COMPASS, 1, 44, 980, "");
		add("clock", c, "Golden Pocket Clock", "Tells you if it's day or night. Works best when you can't see the sky.",
				5, Items.CLOCK, 1, 43, 455, "");
		add("fishing_rod", c, "Fishing Rod", "Catch fish, treasure, and the occasional old boot. Patience sold separately.",
				3, Items.FISHING_ROD, 1, 45, 1210, "");
		add("torches", c, "Torches (32)", "Light up your mine and keep creepers guessing. The #1 essential of every adventure.",
				2, Items.TORCH, 32, 49, 9001, "Best Seller");
		add("shears", c, "Shears", "For sheep haircuts, leaf trimming and confusing Snow Golems.",
				2, Items.SHEARS, 1, 44, 512, "");
		add("brush", c, "Archaeology Brush", "Carefully uncover ancient pottery sherds. Results may include sand. Lots of sand.",
				3, Items.BRUSH, 1, 42, 188, "");
		add("rockets", c, "Firework Rockets (16)", "Fuel for flying, or for celebrating your first diamond. Please aim upward.",
				4, Items.FIREWORK_ROCKET, 16, 46, 733, "");
		add("used_elytra", c, "Elytra (Pre-Owned, 50% Durability)",
				"Gently used by one careful Enderman (they never wore it). Collector's item from the End City. No refunds.",
				640, r -> {
					ItemStack elytra = new ItemStack(Items.ELYTRA);
					elytra.setDamageValue(elytra.getMaxDamage() / 2);
					return elytra;
				}, 38, 12, "Limited");
	}

	private static void booksAndMusic() {
		String c = Categories.BOOKS_MUSIC;
		add("diamonds_for_dummies", c, "Diamonds for Dummies (Book)",
				"Bestselling guide by Steve. Chapter 1: Dig down. Chapter 2: Don't dig straight down.",
				3, r -> writtenBook("Diamonds for Dummies", "Steve",
						"Chapter 1\n\nDiamonds live deep down, near Y=-59. Bring torches. Bring more torches. You did not bring enough torches.",
						"Chapter 2\n\nNever dig straight down. Lava does not care about your feelings, or your inventory.",
						"Chapter 3\n\nFound diamonds? Mine them with an IRON pickaxe or better. Then tell nobody. Especially not the Creeper.",
						"Epilogue\n\nAlready lost your diamonds? Emerazon sells Diamond Pickaxes with Express delivery. You're welcome."), 48, 2048, "Best Seller");
		add("creeper_etiquette", c, "Creeper Etiquette (Book)",
				"A sensitive guide to understanding Creepers, by a Creeper. Short, explosive read.",
				2, r -> writtenBook("Creeper Etiquette", "A. Creeper",
						"Hello.\n\nWe Creepers just want hugs. That's all. Why does everyone run away?",
						"Tip 1\n\nIf you hear a gentle 'sssss', please stand still. We are trying to say hello.",
						"Tip 2\n\nCats are not cute. We do not want to talk about it.",
						"The End\n\n(This book may explode upon reading. It won't. Probably.)"), 45, 666, "New");
		add("book_and_quill", c, "Book & Quill", "Write your memoirs, your base coordinates or your grocery list. Ink not included (it's included).",
				2, Items.WRITABLE_BOOK, 1, 46, 870, "");
		add("blank_books", c, "Blank Books (3)", "Perfect for enchanting, bookshelves or pretending to read in front of Librarians.",
				2, Items.BOOK, 3, 43, 341, "");
		add("album_cat", c, "C418 — \"cat\" (Album)", "Timeless chiptune grooves. The Ocelots are huge fans, the Creepers less so.",
				8, Items.MUSIC_DISC_CAT, 1, 49, 3104, "");
		add("album_pigstep", c, "Lena Raine — \"Pigstep\" (Album)", "The Nether's biggest club banger. Piglins have been dancing to it since 1.16.",
				12, Items.MUSIC_DISC_PIGSTEP, 1, 50, 5120, "Best Seller");
		add("album_otherside", c, "Lena Raine — \"otherside\" (Album)", "Upbeat dungeon-crawling jazz. Found in stronghold chests — now with free shipping.",
				10, Items.MUSIC_DISC_OTHERSIDE, 1, 48, 1873, "");
		add("album_lava_chicken", c, "Hyper Potions — \"Lava Chicken\" (Single)", "The chicken jockey anthem everyone's been humming. Chicken jockey! Lava chicken!",
				10, Items.MUSIC_DISC_LAVA_CHICKEN, 1, 47, 2604, "New");
		add("album_13", c, "C418 — \"13\" (Album)", "Ambient cave noises for the whole family. Listening alone at night is not recommended.",
				6, Items.MUSIC_DISC_13, 1, 41, 1313, "");
		add("jukebox", c, "Jukebox", "Play your albums out loud. Allays will dance, neighbors will complain.",
				6, Items.JUKEBOX, 1, 47, 1440, "");
		add("note_blocks", c, "Note Blocks (2)", "Start a band. Put one on gold for a bell, on sand for a snare, and on wool for silence.",
				2, Items.NOTE_BLOCK, 2, 44, 488, "");
		add("goat_horn", c, "Goat Horn", "Ponder deeply, loudly and in public. Sourced from a goat who rammed a mountain.",
				7, Items.GOAT_HORN, 1, 45, 214, "");
	}

	private static void pets() {
		String c = Categories.PETS;
		add("dog_treats", c, "Bone Dog Treats (8)", "Wolves' favorite snack. Tame a new best friend, then buy them armor.",
				1, Items.BONE, 8, 48, 3502, "Best Seller");
		add("wolf_armor", c, "Wolf Armor", "Keep your good boy safe. Made from 100% ethically shed Armadillo scutes.",
				7, Items.WOLF_ARMOR, 1, 49, 1290, "");
		add("leads", c, "Leads (2)", "For walking llamas, pigs and the occasional Happy Ghast. Not for walking Creepers.",
				3, Items.LEAD, 2, 45, 770, "");
		add("name_tag", c, "Name Tag", "Give your pet a name. Pro tip: name a sheep jeb_ for a surprise.",
				8, Items.NAME_TAG, 1, 47, 1105, "");
		add("saddle", c, "Saddle", "Fits horses, pigs, striders and, according to one review, \"a very confused camel\".",
				6, Items.SADDLE, 1, 46, 642, "");
		add("axolotl", c, "Axolotl in a Bucket", "Ships with water, a smile and a random color. Blue ones are very rare, we promise nothing.",
				9, Items.AXOLOTL_BUCKET, 1, 49, 2222, "");
		add("tropical_fish", c, "Tropical Fish in a Bucket", "A colorful companion for your aquarium. Name it Nemo at your own legal risk.",
				6, Items.TROPICAL_FISH_BUCKET, 1, 46, 801, "");
		add("horse_treats", c, "Golden Carrot Horse Treats (4)", "Breed horses, heal them, or just eat them yourself. We won't tell.",
				4, Items.GOLDEN_CARROT, 4, 47, 503, "");
		add("parrot_cookies", c, "Cookies for Parrots — Do NOT Feed", "These are cookies. Parrots love cookies. Do NOT feed cookies to parrots. Seriously. Eat them yourself.",
				1, Items.COOKIE, 4, 32, 418, "");
	}

	private static void grocery() {
		String c = Categories.GROCERY;
		add("bread", c, "Farmhouse Bread (6)", "Baked by the village Farmer from three wheat each. Carbs for creeper-running.",
				2, Items.BREAD, 6, 46, 2380, "");
		add("apples", c, "Crisp Red Apples (8)", "Freshly fallen from oak trees. Doctors hate them.",
				2, Items.APPLE, 8, 45, 1504, "");
		add("carrots", c, "Carrots (12)", "Crunchy, orange, and great for night vision (they're not). Pigs will follow you everywhere.",
				1, Items.CARROT, 12, 44, 980, "Deal");
		add("eggs", c, "Free-Range Eggs (12)", "Laid by happy chickens. Throwing them is technically allowed but very rude.",
				2, Items.EGG, 12, 43, 712, "");
		add("milk", c, "Fresh Milk (Bucket)", "Straight from the cow. Cures every status effect, including the good ones. Bucket included.",
				2, Items.MILK_BUCKET, 1, 47, 1630, "");
		add("sugar", c, "Cane Sugar (16)", "For cakes, cookies and potions of Swiftness. Not for horses (they disagree).",
				1, Items.SUGAR, 16, 44, 340, "");
		add("cocoa", c, "Cocoa Beans (8)", "Jungle-grown and fair-traded with Ocelots. Cookies await.",
				2, Items.COCOA_BEANS, 8, 46, 455, "");
		add("honey", c, "Local Honey (2 bottles)", "From bees who are definitely not angry about it. Cures poison, sweetens everything.",
				3, Items.HONEY_BOTTLE, 2, 47, 610, "");
	}

	private static void electronics() {
		String c = Categories.ELECTRONICS;
		add("redstone_lamps", c, "Smart Redstone Lamps (2)", "Turns on when powered. That's it — that's the smart part.",
				3, Items.REDSTONE_LAMP, 2, 45, 980, "");
		add("daylight_sensor", c, "Daylight Detector", "Automatic sunrise alarms and night lights. Right-click to switch to night mode.",
				3, Items.DAYLIGHT_DETECTOR, 1, 46, 445, "");
		add("observers", c, "Observers (2)", "Watches blocks. Judges silently. Sends a redstone pulse when something changes.",
				4, Items.OBSERVER, 2, 47, 1210, "Best Seller");
		add("copper_bulbs", c, "Copper Bulbs (2)", "Toggleable copper lights. Ages beautifully into a nice teal (wax it to stop that).",
				4, Items.COPPER_BULB, 2, 46, 377, "New");
		add("comparator", c, "Redstone Comparator", "Compares, subtracts and measures how full your chests are. Basically a calculator.",
				3, Items.COMPARATOR, 1, 44, 512, "");
		add("repeaters", c, "Redstone Repeaters (4)", "Delay, extend and repeat. Like this sentence. Like this sentence.",
				3, Items.REPEATER, 4, 45, 690, "");
		add("sculk_sensor", c, "Sculk Sensor", "Hears footsteps, chests opening and you thinking about the Warden. Very sensitive.",
				6, Items.SCULK_SENSOR, 1, 43, 233, "");
	}

	private static void home() {
		String c = Categories.HOME;
		add("cozy_bed", c, "Cozy Red Bed", "Skip the night, set your spawn. Do NOT try it in the Nether.",
				3, Items.RED_BED, 1, 48, 3010, "Best Seller");
		add("candles", c, "Scented Candles (4)", "Fragrance: 'Freshly Mined Stone'. Light with flint and steel.",
				2, Items.CANDLE, 4, 45, 744, "");
		add("red_carpet", c, "Red Carpet Experience (8)", "Roll it out for VIP guests, or just for the cat. Cats are VIP guests.",
				2, Items.RED_CARPET, 8, 46, 512, "");
		add("item_frames", c, "Item Frames (4)", "Show off your best sword, rarest disc or very first cookie.",
				2, Items.ITEM_FRAME, 4, 44, 640, "");
		add("bookshelves", c, "Bookshelves (2)", "Instant library vibes. Doubles as enchanting table power, triples as cat furniture.",
				4, Items.BOOKSHELF, 2, 47, 822, "");
		add("doorbell", c, "Village Bell 'Doorbell'", "Ring it to summon villagers indoors. Works for deliveries too (it doesn't).",
				8, Items.BELL, 1, 42, 187, "");
		add("banner", c, "Blank Red Banner", "Make your base look official. Loom not included, creativity sold separately.",
				2, Items.RED_BANNER, 1, 41, 166, "");
	}

	// ---- helpers ----------------------------------------------------------------------------------

	private static void add(String id, String category, String name, String description, int price, ItemLike item, int count, int rating, int reviews, String badge) {
		Catalog.register(Product.emerazon("market/" + id, category, name, description, price, item, count, rating, reviews, badge));
	}

	private static void add(String id, String category, String name, String description, int price,
			Function<HolderLookup.Provider, ItemStack> factory, int rating, int reviews, String badge) {
		Catalog.register(Product.emerazon("market/" + id, category, name, description, price, factory, rating, reviews, badge));
	}

	private static ItemStack stack(ItemLike item, int count) {
		return new ItemStack(item, count);
	}

	/** A colored bundle pre-filled with {@code contents} (respecting the bundle's weight limit) and a custom name. */
	private static ItemStack bundle(Item bundleItem, String name, ItemStack... contents) {
		ItemStack bundle = new ItemStack(bundleItem);
		BundleContents.Mutable mutable = new BundleContents.Mutable(BundleContents.EMPTY);
		for (ItemStack content : contents) {
			mutable.tryInsert(content.copy());
		}
		bundle.set(DataComponents.BUNDLE_CONTENTS, mutable.toImmutable());
		bundle.set(DataComponents.CUSTOM_NAME, Component.literal(name).withStyle(style -> style.withItalic(false)));
		return bundle;
	}

	/** A signed book with real pages. */
	private static ItemStack writtenBook(String title, String author, String... pages) {
		ItemStack book = new ItemStack(Items.WRITTEN_BOOK);
		List<Filterable<Component>> pageList = Arrays.stream(pages).map(p -> Filterable.<Component>passThrough(Component.literal(p))).toList();
		book.set(DataComponents.WRITTEN_BOOK_CONTENT, new WrittenBookContent(Filterable.passThrough(title), author, 0, pageList, true));
		return book;
	}
}
