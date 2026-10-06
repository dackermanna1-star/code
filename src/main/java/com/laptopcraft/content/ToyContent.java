package com.laptopcraft.content;

import com.laptopcraft.block.decor.PlushBlock;
import com.laptopcraft.block.decor.PuzzleCubeBlock;
import com.laptopcraft.block.decor.RubberDuckBlock;
import com.laptopcraft.item.toy.BouncyBallEntity;
import com.laptopcraft.item.toy.BouncyBallItem;
import com.laptopcraft.item.toy.ConfettiPopperItem;
import com.laptopcraft.item.toy.Magic8BallItem;
import com.laptopcraft.item.toy.RubberDuckItem;
import com.laptopcraft.item.toy.TrickToyItem;
import com.laptopcraft.registry.Reg;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;
import java.util.List;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/** Toys: a rubber duck, six plushies, a puzzle cube and a handful of hand-held toys (all sold on Emerazon). */
public final class ToyContent {
	public static final ResourceKey<EntityType<?>> BOUNCY_BALL_KEY = ResourceKey.create(Registries.ENTITY_TYPE, Reg.id("bouncy_ball"));
	public static final EntityType<BouncyBallEntity> BOUNCY_BALL_ENTITY = Registry.register(BuiltInRegistries.ENTITY_TYPE, BOUNCY_BALL_KEY,
			EntityType.Builder.<BouncyBallEntity>of(BouncyBallEntity::new, MobCategory.MISC)
					.noLootTable()
					.sized(0.25F, 0.25F)
					.clientTrackingRange(4)
					.updateInterval(4)
					.build(BOUNCY_BALL_KEY));

	public static final Block RUBBER_DUCK = Reg.block("rubber_duck", RubberDuckBlock::new, toy(MapColor.COLOR_YELLOW, SoundType.SLIME_BLOCK),
			RubberDuckItem::new, new Item.Properties().stacksTo(16));
	public static final Block CREEPER_PLUSH = plush("creeper_plush", PlushBlock.Kind.CREEPER, MapColor.COLOR_GREEN);
	public static final Block PIG_PLUSH = plush("pig_plush", PlushBlock.Kind.PIG, MapColor.COLOR_PINK);
	public static final Block TEDDY_BEAR = plush("teddy_bear", PlushBlock.Kind.TEDDY_BEAR, MapColor.COLOR_BROWN);
	public static final Block AXOLOTL_PLUSH = plush("axolotl_plush", PlushBlock.Kind.AXOLOTL, MapColor.COLOR_PINK);
	public static final Block ENDERMAN_PLUSH = plush("enderman_plush", PlushBlock.Kind.ENDERMAN, MapColor.COLOR_BLACK);
	public static final Block SNIFFER_PLUSH = plush("sniffer_plush", PlushBlock.Kind.SNIFFER, MapColor.COLOR_RED);
	public static final Block PUZZLE_CUBE = Reg.block("puzzle_cube", PuzzleCubeBlock::new, toy(MapColor.COLOR_LIGHT_BLUE, SoundType.BAMBOO_WOOD));

	public static final Item MAGIC_8_BALL = Reg.item("magic_8_ball", Magic8BallItem::new, new Item.Properties().stacksTo(1));
	public static final Item CONFETTI_POPPER = Reg.item("confetti_popper", ConfettiPopperItem::new, new Item.Properties().stacksTo(16));
	public static final Item YO_YO = Reg.item("yo_yo",
			p -> new TrickToyItem("yo_yo", 6, SoundEvents.FISHING_BOBBER_THROW, 1.3F, ParticleTypes.CRIT, 15, p), new Item.Properties().stacksTo(1));
	public static final Item FIDGET_SPINNER = Reg.item("fidget_spinner",
			p -> new TrickToyItem("fidget_spinner", 6, SoundEvents.GRINDSTONE_USE, 1.9F, ParticleTypes.ELECTRIC_SPARK, 20, p), new Item.Properties().stacksTo(1));
	public static final Item BOUNCY_BALL = Reg.item("bouncy_ball", BouncyBallItem::new, new Item.Properties().stacksTo(16));

	/** Toy blocks with partially transparent textures (client sets them to the cutout layer). */
	public static final List<Block> CUTOUT_BLOCKS = List.of(RUBBER_DUCK, CREEPER_PLUSH, PIG_PLUSH, TEDDY_BEAR, AXOLOTL_PLUSH, ENDERMAN_PLUSH,
			SNIFFER_PLUSH, PUZZLE_CUBE);

	private ToyContent() {
	}

	private static BlockBehaviour.Properties toy(MapColor color, SoundType sound) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(0.4F).sound(sound).noOcclusion().pushReaction(PushReaction.DESTROY);
	}

	private static Block plush(String name, PlushBlock.Kind kind, MapColor color) {
		return Reg.block(name, p -> new PlushBlock(kind, p), toy(color, SoundType.WOOL), new Item.Properties().stacksTo(16));
	}

	/** Registers blocks/items. Called during mod init, before the catalog is built. */
	public static void init() {
		// Class loading registers the fields above (entity type first, then blocks and items in creative-tab order).
	}

	/** Adds this group's products to the {@link Catalog}. */
	public static void addProducts() {
		String t = Categories.TOYS;
		add("rubber_duck", t, "Rubber Duck",
				"Squeaks on demand and floats like a pro. Also debugs your redstone if you explain it slowly enough.",
				3, RUBBER_DUCK, 1, 48, 2210, "Best Seller");
		add("creeper_plush", t, "Creeper Plushie",
				"All of the hiss, none of the crater. Hug responsibly.",
				8, CREEPER_PLUSH, 1, 47, 1312, "Best Seller");
		add("pig_plush", t, "Pig Plushie",
				"Soft, squishy and 100% bacon-free. Saddle sold separately.",
				6, PIG_PLUSH, 1, 46, 845, "");
		add("teddy_bear", t, "Classic Teddy Bear",
				"Wears a bow tie at all times. Has seen things in the Nether it refuses to talk about.",
				7, TEDDY_BEAR, 1, 49, 3120, "Best Seller");
		add("axolotl_plush", t, "Axolotl Plushie",
				"Plays dead whenever you need a nap. The gills are purely decorative and extremely fluffy.",
				8, AXOLOTL_PLUSH, 1, 49, 1876, "New");
		add("enderman_plush", t, "Enderman Plushie",
				"Comes holding its very own grass block. Please do not make eye contact with the plushie.",
				9, ENDERMAN_PLUSH, 1, 45, 666, "Limited");
		add("sniffer_plush", t, "Sniffer Plushie",
				"An ancient friend, lovingly revived in polyester. Sniffs for snacks, finds only love.",
				12, SNIFFER_PLUSH, 1, 48, 402, "New");
		add("puzzle_cube", t, "Puzzle Cube",
				"43 quintillion combinations, one solution, zero instructions. Click to twist.",
				5, PUZZLE_CUBE, 1, 44, 978, "");
		add("magic_8_ball", t, "Magic 8-Ball",
				"Answers any question with total confidence. Not liable for decisions made near lava.",
				5, MAGIC_8_BALL, 1, 43, 1543, "");
		add("confetti_popper", t, "Confetti Poppers (4-pack)",
				"Celebrate anything: a new base, a rare drop, surviving a creeper. Single use, maximum joy.",
				4, CONFETTI_POPPER, 4, 47, 690, "Deal");
		add("yo_yo", t, "Yo-Yo",
				"Walk the dog without leaving the house. Comes pre-tangled for authenticity.",
				3, YO_YO, 1, 42, 311, "");
		add("fidget_spinner", t, "Fidget Spinner",
				"Spins at 3,000 RPM. Generates zero redstone power, despite many, many attempts.",
				4, FIDGET_SPINNER, 1, 39, 2048, "Deal");
		add("bouncy_ball", t, "Bouncy Balls (3-pack)",
				"Boing! Ricochets off walls, mobs and your little brother's patience.",
				2, BOUNCY_BALL, 3, 46, 1204, "");
	}

	private static void add(String id, String category, String name, String description, int price, ItemLike item,
			int count, int rating, int reviews, String badge) {
		Catalog.register(Product.emerazon(id, category, name, description, price, item, count, rating, reviews, badge));
	}

	/** Every item of this group (for tooltips etc.). */
	public static List<Item> items() {
		return List.of(RUBBER_DUCK.asItem(), CREEPER_PLUSH.asItem(), PIG_PLUSH.asItem(), TEDDY_BEAR.asItem(), AXOLOTL_PLUSH.asItem(),
				ENDERMAN_PLUSH.asItem(), SNIFFER_PLUSH.asItem(), PUZZLE_CUBE.asItem(), MAGIC_8_BALL, CONFETTI_POPPER, YO_YO, FIDGET_SPINNER,
				BOUNCY_BALL);
	}
}
