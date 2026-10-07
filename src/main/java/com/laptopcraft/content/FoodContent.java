package com.laptopcraft.content;

import static com.laptopcraft.item.food.FoodItems.*;

import com.laptopcraft.item.food.FoodItems;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;
import com.laptopcraft.shop.Restaurant;
import com.laptopcraft.shop.Store;
import java.util.function.Function;
import net.minecraft.core.HolderLookup;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.alchemy.Potions;
import net.minecraft.world.level.ItemLike;

/** Food items, Ender Eats restaurants and menus. */
public final class FoodContent {
	private static final String MAINS = Categories.MENU_MAINS;
	private static final String SIDES = Categories.MENU_SIDES;
	private static final String DRINKS = Categories.MENU_DRINKS;
	private static final String DESSERTS = Categories.MENU_DESSERTS;

	private FoodContent() {
	}

	/** Registers blocks/items. Called during mod init, before the catalog is built. */
	public static void init() {
		FoodItems.init();
	}

	/** Adds this group's products to the {@link com.laptopcraft.shop.Catalog}. */
	public static void addRestaurantsAndMenus() {
		pigstepPizza();
		netherGrill();
		sushiSea();
		tacoBlaze();
		sweetBerryBakery();
		ramenRavine();
		brewAndBee();
	}

	private static void pigstepPizza() {
		Menu m = restaurant("pigstep_pizza", "Pigstep Pizza", "Pizza · Italian",
				"Slices so good, Piglins trade their gold for them.", 0xFFE4472F, PEPPERONI_PIZZA, 47, 40, 2);
		m.add("pepperoni_pizza", MAINS, "Pepperoni Pizza (Whole)",
				"Eight-block-wide pie loaded with pepperoni and molten cheese. Sneak + use to slice it — sharing is optional.",
				8, PEPPERONI_PIZZA, 1, 48, 2214, "Best Seller");
		m.add("pizza_slice", MAINS, "Pizza Slice Duo",
				"Two hot slices for when a whole pizza feels like commitment. Cheese pull guaranteed or your emeralds back*.",
				3, PIZZA_SLICE, 2, 46, 1530, "");
		m.add("spaghetti", MAINS, "Spaghetti alla Strider",
				"Hand-twirled noodles in slow-simmered tomato sauce. So good it's im-pasta-ble to share.",
				6, SPAGHETTI, 1, 45, 812, "Chef's Pick");
		m.add("bread_loaves", SIDES, "Rustic Bread Loaves (2)",
				"Baked in a furnace powered by pure enthusiasm (and coal). Crusty outside, fluffy inside.",
				2, Items.BREAD, 2, 43, 377, "");
		m.add("cola_can", DRINKS, "Ice-Cold Cola",
				"Fizzy enough to give you a little hop in your step. Literally: Jump Boost.",
				2, COLA_CAN, 1, 44, 980, "");
		m.add("gelato_cone", DESSERTS, "Gelato Cone",
				"Creamy Italian-style ice cream. Eat it slowly — brain freeze is a real status effect here.",
				3, ICE_CREAM_CONE, 1, 47, 640, "");
		m.add("party_cake", DESSERTS, "Tiramisu-ish Celebration Cake",
				"A whole cake for the table. The tiramisu is a lie, the cake is not.",
				7, Items.CAKE, 1, 42, 205, "");
	}

	private static void netherGrill() {
		Menu m = restaurant("nether_grill", "The Nether Grill", "Burgers · Fries",
				"Flame-grilled in the actual Nether. Ghast-approved since 2009.", 0xFF9C1F2E, CHEESEBURGER, 46, 35, 1);
		m.add("cheeseburger", MAINS, "Ghast Blaster Cheeseburger",
				"Double-stacked beef, melty cheese and crispy lettuce. So big it makes Ghasts cry (they always do).",
				5, CHEESEBURGER, 1, 48, 3121, "Best Seller");
		m.add("cluck_bucket", MAINS, "Cluck Bucket",
				"A whole bucket of golden fried chicken. No chickens were jockeyed in the making of this meal.",
				8, FRIED_CHICKEN_BUCKET, 1, 47, 1688, "Deal");
		m.add("strider_dog", MAINS, "Strider Dog",
				"Grilled sausage in a soft bun with a squiggle of mustard. Walks on lava, tastes like heaven.",
				4, HOT_DOG, 1, 44, 702, "");
		m.add("blaze_wings", MAINS, "Blaze Hot Wings (2)",
				"Glazed in blaze-pepper sauce. So spicy they grant 20 seconds of Fire Resistance. Lick your fingers carefully.",
				5, BLAZE_HOT_WINGS, 2, 46, 954, "New");
		m.add("fries", SIDES, "Crispy Fries",
				"Golden, salty and impossible to stop eating. Pairs well with everything, including more fries.",
				2, FRIES, 1, 46, 2450, "");
		m.add("loaded_potatoes", SIDES, "Loaded Baked Potatoes (2)",
				"Fluffy baked potatoes, loaded with everything we had in the chest.",
				2, Items.BAKED_POTATO, 2, 41, 198, "");
		m.add("cola_can", DRINKS, "Lava Cola",
				"Our classic cola, served in a can that is definitely not hot. Probably.",
				2, COLA_CAN, 1, 43, 865, "");
		m.add("milkshake", DRINKS, "Netherrack Milkshake",
				"Thick vanilla-strawberry shake. Washes away poison, hunger and regret.",
				4, MILKSHAKE, 1, 49, 1210, "Chef's Pick");
	}

	private static void sushiSea() {
		Menu m = restaurant("sushi_sea", "Sushi Sea", "Sushi · Japanese",
				"Fresh from the Ocean Monument. Guardians not included.", 0xFF2A8CC4, SUSHI_ROLL, 48, 50, 2);
		m.add("kelp_maki", MAINS, "Kelp Maki (6 pc)",
				"Rice and fish rolled in sun-dried kelp. Rolled by a very patient Drowned.",
				5, SUSHI_ROLL, 6, 48, 1777, "Best Seller");
		m.add("salmon_nigiri", MAINS, "Salmon Nigiri (4 pc)",
				"Buttery salmon on hand-pressed rice. So fresh you'll breathe underwater for 15 seconds.",
				6, SALMON_NIGIRI, 4, 49, 1342, "Chef's Pick");
		m.add("grilled_salmon", MAINS, "Grilled Salmon Fillets (2)",
				"Simply grilled over campfire coals. The salmon swam upstream just for this.",
				4, Items.COOKED_SALMON, 2, 45, 410, "");
		m.add("cod_teriyaki", MAINS, "Cod Teriyaki (2)",
				"Sweet glazed cod. The only cod that never despawned on its way to you.",
				3, Items.COOKED_COD, 2, 42, 233, "");
		m.add("miso_soup", SIDES, "Miso-shroom Soup",
				"Warm mushroom broth served in a real wooden bowl. Keep the bowl, we have plenty.",
				3, Items.MUSHROOM_STEW, 1, 44, 501, "");
		m.add("kelp_chips", SIDES, "Seaweed Snack Pack (8)",
				"Crunchy dried kelp. Rich in vitamins Sea and Kelp.",
				1, Items.DRIED_KELP, 8, 40, 288, "Deal");
		m.add("ocean_water", DRINKS, "Artisanal Ocean Water",
				"Hand-collected from a deep ocean biome. Subtle notes of Guardian and existential dread.",
				1, r -> PotionContents.createItemStack(Items.POTION, Potions.WATER), 31, 96, "");
	}

	private static void tacoBlaze() {
		Menu m = restaurant("taco_blaze", "Taco Blaze", "Mexican · Tex-Mex",
				"Hotter than a Blaze, faster than a Phantom at 3 AM.", 0xFFF29A12, TACO, 46, 30, 1);
		m.add("taco_duo", MAINS, "Crunchy Taco Duo",
				"Two crispy shells packed with seasoned beef, lettuce and cheese. Taco 'bout delicious.",
				4, TACO, 2, 47, 2033, "Best Seller");
		m.add("mega_burrito", MAINS, "Mega Burrito",
				"Rice, beans, beef and salsa wrapped tighter than a Shulker box. Weighs about one block.",
				6, BURRITO, 1, 46, 1120, "");
		m.add("nachos", SIDES, "Nachos Supreme",
				"Golden tortilla chips drowning in cheese and salsa. Nacho average snack.",
				4, NACHOS, 1, 45, 860, "Chef's Pick");
		m.add("beet_salsa", SIDES, "Beetroot Salsa Bowl",
				"Zesty beetroot salsa. Rabbits keep trying to order this.",
				2, Items.BEETROOT_SOUP, 1, 38, 120, "");
		m.add("agua_fresca", DRINKS, "Sweet Berry Agua Fresca",
				"Fresh sweet berry smoothie, thorns removed by hand. A little regeneration in every sip.",
				3, SWEET_BERRY_SMOOTHIE, 1, 47, 598, "");
		m.add("cola_can", DRINKS, "Cactus Cola",
				"Our cola, now served next to a cactus for authenticity. Do not hug the cactus.",
				2, COLA_CAN, 1, 42, 410, "");
		m.add("churro_donut", DESSERTS, "Churro Donut",
				"Cinnamon-sugar donut that's crispy outside and soft inside. Hole included at no extra cost.",
				3, DONUT, 1, 46, 733, "");
	}

	private static void sweetBerryBakery() {
		Menu m = restaurant("sweet_berry_bakery", "Sweet Berry Bakery", "Desserts · Bakery",
				"Baked fresh every in-game morning. Free delivery, sweet as berries.", 0xFFE2508A, CUPCAKE, 49, 45, 0);
		m.add("golden_apple_pie", DESSERTS, "Golden Apple Pie",
				"Flaky crust, real golden apples, a whole minute of Absorption. Notch would be proud.",
				12, GOLDEN_APPLE_PIE, 1, 50, 777, "Chef's Pick");
		m.add("cupcakes", DESSERTS, "Sweet Berry Cupcakes (2)",
				"Fluffy vanilla cupcakes with pink frosting and a sweet berry on top. Instagram-able. Er, BlockTube-able.",
				4, CUPCAKE, 2, 48, 1504, "Best Seller");
		m.add("donut_trio", DESSERTS, "Sprinkle Donut Trio",
				"Three glazed donuts with rainbow sprinkles. Unlike a Wither, these have holes on purpose.",
				4, DONUT, 3, 47, 1288, "");
		m.add("chorus_cookies", DESSERTS, "Chorus Cookies (3)",
				"Baked with real chorus fruit. Side effects may include being somewhere else.",
				5, CHORUS_COOKIE, 3, 44, 432, "New");
		m.add("cookie_tin", DESSERTS, "Cookie Tin (12)",
				"A dozen chocolate chip cookies. Great for you, terrible for parrots.",
				3, Items.COOKIE, 12, 46, 2010, "Deal");
		m.add("pumpkin_pie", DESSERTS, "Classic Pumpkin Pie",
				"Grandma's recipe. Grandma is a Witch, but the pie is fine.",
				3, Items.PUMPKIN_PIE, 1, 45, 365, "");
		m.add("butter_croissants", MAINS, "Butter Croissants (2)",
				"Flaky, golden and 82% butter. Each layer laminated by a very dedicated Villager.",
				3, CROISSANT, 2, 47, 820, "");
		m.add("berry_milkshake", DRINKS, "Berry Milkshake",
				"Thick strawberry-berry shake with whipped cream and a cherry from the Cherry Grove.",
				4, MILKSHAKE, 1, 48, 915, "");
	}

	private static void ramenRavine() {
		Menu m = restaurant("ramen_ravine", "Ramen Ravine", "Noodles · Asian",
				"Deep bowls from a deep ravine. Slurping encouraged.", 0xFF7B4FC9, RAMEN_BOWL, 48, 45, 2);
		m.add("tonkotsu_ramen", MAINS, "Tonkotsu Ramen",
				"Rich 18-hour broth, springy noodles and a perfect soft egg. Gives Regeneration — and life advice.",
				6, RAMEN_BOWL, 1, 49, 2604, "Chef's Pick");
		m.add("dumplings", MAINS, "Pork Dumplings (4)",
				"Pan-fried and juicy. Folded by hand, eaten by mouth.",
				4, DUMPLINGS, 4, 47, 1190, "Best Seller");
		m.add("rabbit_hot_pot", MAINS, "Rabbit Hot Pot",
				"Hearty rabbit stew with veggies. The rabbit's foot is sold separately (for luck).",
				5, Items.RABBIT_STEW, 1, 44, 402, "");
		m.add("miso_soup", SIDES, "Miso Mushroom Soup",
				"Light, savory and served in a reusable bowl. Very sustainable. Very mushroom.",
				3, Items.MUSHROOM_STEW, 1, 43, 377, "");
		m.add("kelp_crisps", SIDES, "Kelp Crisps (10)",
				"Salty, crispy kelp. The healthiest thing you'll order this week.",
				1, Items.DRIED_KELP, 10, 39, 154, "");
		m.add("honey_tea", DRINKS, "Hot Honey Tea",
				"Soothing honey brew. Cures Poison, comforts Bees (they are not in the tea).",
				2, Items.HONEY_BOTTLE, 1, 45, 288, "");
		m.add("fortune_cookies", DESSERTS, "Fortune Cookies (4)",
				"Today's fortune: \"You will find diamonds at Y=-59.\" Results may vary.",
				2, Items.COOKIE, 4, 42, 666, "");
	}

	private static void brewAndBee() {
		Menu m = restaurant("brew_bee_cafe", "Brew & Bee Café", "Coffee · Breakfast",
				"Ethically sourced beans, emotionally supportive bees.", 0xFF7A4E2D, ICED_COFFEE, 47, 25, 1);
		m.add("iced_coffee", DRINKS, "Iced Coffee",
				"Cold brew over ice with a swirl of cream. 30 seconds of Speed for those 6 AM creeper commutes.",
				3, ICED_COFFEE, 1, 48, 3333, "Best Seller");
		m.add("redstone_rush", DRINKS, "Redstone Rush Energy",
				"Fully powered: Speed + Haste II for 30 seconds. Signal strength: 15. Do not drink near TNT.",
				4, REDSTONE_RUSH_ENERGY_DRINK, 1, 44, 1015, "Limited");
		m.add("honey_shot", DRINKS, "Honey Wellness Shot",
				"Straight from our own beehives. The bees unionised, so this is their premium blend.",
				2, Items.HONEY_BOTTLE, 1, 46, 540, "");
		m.add("pancake_stack", MAINS, "Fluffy Pancake Stack",
				"Three buttermilk pancakes, a pat of butter and a waterfall of maple syrup.",
				5, PANCAKES, 1, 49, 1876, "Chef's Pick");
		m.add("croissant", MAINS, "Morning Croissant",
				"Warm, buttery and flaky. The crumbs will be in your inventory for weeks.",
				2, CROISSANT, 1, 46, 702, "");
		m.add("toast", SIDES, "Thick-Cut Toast (2)",
				"Bread, but warmer. Avocado sold separately (we're still looking for the biome).",
				2, Items.BREAD, 2, 40, 143, "");
		m.add("honey_donut", DESSERTS, "Honey-Glazed Donut",
				"Glazed with local honey by bees who take their job very seriously.",
				2, DONUT, 1, 47, 690, "New");
	}

	// ---- helpers ----------------------------------------------------------------------------------

	private static Menu restaurant(String id, String name, String cuisine, String tagline, int accent, Item icon, int rating, int etaSeconds, int fee) {
		Catalog.registerRestaurant(new Restaurant(id, name, cuisine, tagline, accent, icon, rating, etaSeconds, fee));
		return new Menu(id);
	}

	/** Adds products to one restaurant's menu; product ids become {@code "<restaurant>/<item>"}. */
	private record Menu(String restaurantId) {
		void add(String item, String section, String name, String description, int price, ItemLike stack, int count, int rating, int reviews, String badge) {
			Catalog.register(Product.menuItem(restaurantId + "/" + item, restaurantId, section, name, description, price, stack, count, rating, reviews, badge));
		}

		void add(String item, String section, String name, String description, int price,
				Function<HolderLookup.Provider, ItemStack> factory, int rating, int reviews, String badge) {
			Catalog.register(new Product(restaurantId + "/" + item, Store.ENDER_EATS, section, name, description, price, factory, rating, reviews, badge, restaurantId));
		}
	}
}
