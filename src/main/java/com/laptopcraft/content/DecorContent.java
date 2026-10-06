package com.laptopcraft.content;

import com.laptopcraft.block.decor.ArcadeCabinetBlock;
import com.laptopcraft.block.decor.DiscoBallBlock;
import com.laptopcraft.block.decor.FacingDecorBlock;
import com.laptopcraft.block.decor.GlobeBlock;
import com.laptopcraft.block.decor.MiniFridgeBlock;
import com.laptopcraft.block.decor.MiniFridgeBlockEntity;
import com.laptopcraft.block.decor.PottedPlantBlock;
import com.laptopcraft.block.decor.SeatBlock;
import com.laptopcraft.block.decor.SeatEntity;
import com.laptopcraft.block.decor.ShapedDecorBlock;
import com.laptopcraft.block.decor.ToggleDecorBlock;
import com.laptopcraft.registry.Reg;
import com.laptopcraft.shop.Catalog;
import com.laptopcraft.shop.Categories;
import com.laptopcraft.shop.Product;
import java.util.List;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
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
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.shapes.Shapes;

/** Home decor: lamps, a disco ball, a neon sign, furniture you can sit on, a mini fridge, a retro TV and an arcade. */
public final class DecorContent {
	public static final ResourceKey<EntityType<?>> SEAT_KEY = ResourceKey.create(Registries.ENTITY_TYPE, Reg.id("seat"));
	public static final EntityType<SeatEntity> SEAT = Registry.register(BuiltInRegistries.ENTITY_TYPE, SEAT_KEY,
			EntityType.Builder.<SeatEntity>of(SeatEntity::new, MobCategory.MISC)
					.noLootTable()
					.noSummon()
					.fireImmune()
					.sized(0.01F, 0.01F)
					.clientTrackingRange(10)
					.updateInterval(20)
					.build(SEAT_KEY));

	public static final Block LAVA_LAMP = lavaLamp("lava_lamp", MapColor.COLOR_RED);
	public static final Block LAVA_LAMP_BLUE = lavaLamp("lava_lamp_blue", MapColor.COLOR_BLUE);
	public static final Block LAVA_LAMP_PURPLE = lavaLamp("lava_lamp_purple", MapColor.COLOR_PURPLE);
	public static final Block DISCO_BALL = Reg.block("disco_ball", DiscoBallBlock::new,
			props(MapColor.METAL, SoundType.GLASS, 0.6F).lightLevel(s -> 10));
	public static final Block NEON_SIGN = Reg.block("neon_sign",
			p -> new FacingDecorBlock(p, Shapes.or(Block.box(0, 1.5, 7, 16, 12.5, 9), Block.box(2, 0, 5.5, 14, 1.5, 10.5))),
			props(MapColor.COLOR_LIGHT_GREEN, SoundType.GLASS, 0.6F).lightLevel(s -> 9));
	public static final Block DESK_LAMP = Reg.block("desk_lamp",
			p -> new ToggleDecorBlock(p, Shapes.or(Block.box(5, 0, 7, 11, 1.5, 13), Block.box(7, 1.5, 8, 9, 10, 13), Block.box(4.5, 8, 1.5, 11.5, 14, 9)),
					SoundEvents.COPPER_BULB_TURN_ON, SoundEvents.COPPER_BULB_TURN_OFF, null, 0),
			props(MapColor.COLOR_CYAN, SoundType.LANTERN, 0.5F).lightLevel(s -> s.getValue(ToggleDecorBlock.LIT) ? 14 : 0));
	public static final Block GLOBE = Reg.block("globe", GlobeBlock::new, props(MapColor.COLOR_BLUE, SoundType.WOOD, 0.6F));
	public static final Block BEAN_BAG = beanBag("bean_bag", MapColor.COLOR_RED);
	public static final Block BEAN_BAG_BLUE = beanBag("bean_bag_blue", MapColor.COLOR_BLUE);
	public static final Block BEAN_BAG_LIME = beanBag("bean_bag_lime", MapColor.COLOR_LIGHT_GREEN);
	public static final Block GAMING_CHAIR = Reg.block("gaming_chair",
			p -> new SeatBlock(p, Shapes.or(Block.box(2, 0, 2, 14, 7, 12.5), Block.box(3, 7, 11.5, 13, 16, 14)), 0.45, 1.0F),
			props(MapColor.COLOR_BLACK, SoundType.WOOL, 1.0F));
	public static final Block POTTED_MONSTERA = Reg.block("potted_monstera", PottedPlantBlock::new,
			props(MapColor.PLANT, SoundType.DECORATED_POT, 0.4F));
	public static final Block MINI_FRIDGE = Reg.block("mini_fridge", MiniFridgeBlock::new,
			BlockBehaviour.Properties.of().mapColor(MapColor.SNOW).strength(1.5F).sound(SoundType.METAL).noOcclusion());
	public static final Block RETRO_TV = Reg.block("retro_tv",
			p -> new ToggleDecorBlock(p, Block.box(1, 0, 2.5, 15, 13, 14), SoundEvents.STONE_BUTTON_CLICK_ON, SoundEvents.STONE_BUTTON_CLICK_OFF,
					"block.laptopcraft.retro_tv.show", 8),
			props(MapColor.WOOD, SoundType.WOOD, 1.0F).lightLevel(s -> s.getValue(ToggleDecorBlock.LIT) ? 6 : 0));
	public static final Block ARCADE_CABINET = Reg.block("arcade_cabinet", ArcadeCabinetBlock::new,
			BlockBehaviour.Properties.of().mapColor(MapColor.COLOR_PURPLE).strength(1.5F).sound(SoundType.WOOD).noOcclusion()
					.lightLevel(s -> 7).pushReaction(PushReaction.BLOCK));

	public static final BlockEntityType<MiniFridgeBlockEntity> MINI_FRIDGE_BLOCK_ENTITY = Registry.register(BuiltInRegistries.BLOCK_ENTITY_TYPE,
			Reg.id("mini_fridge"), FabricBlockEntityTypeBuilder.create(MiniFridgeBlockEntity::new, MINI_FRIDGE).build());

	/** Blocks drawn in the translucent layer (glass with real transparency). */
	public static final List<Block> TRANSLUCENT_BLOCKS = List.of(LAVA_LAMP, LAVA_LAMP_BLUE, LAVA_LAMP_PURPLE, MINI_FRIDGE);
	/** Every other decor block (cutout layer: leaves, tubes, thin planes). */
	public static final List<Block> CUTOUT_BLOCKS = List.of(DISCO_BALL, NEON_SIGN, DESK_LAMP, GLOBE, BEAN_BAG, BEAN_BAG_BLUE, BEAN_BAG_LIME,
			GAMING_CHAIR, POTTED_MONSTERA, RETRO_TV, ARCADE_CABINET);

	private DecorContent() {
	}

	private static BlockBehaviour.Properties props(MapColor color, SoundType sound, float strength) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(strength).sound(sound).noOcclusion();
	}

	private static Block lavaLamp(String name, MapColor color) {
		return Reg.block(name, p -> new ShapedDecorBlock(p, Block.box(5, 0, 5, 11, 14.5, 11)),
				props(color, SoundType.GLASS, 0.5F).lightLevel(s -> 12).pushReaction(PushReaction.DESTROY));
	}

	private static Block beanBag(String name, MapColor color) {
		return Reg.block(name, p -> new SeatBlock(p, Shapes.or(Block.box(1, 0, 1, 15, 6, 15), Block.box(3, 6, 9, 13, 11, 14)), 0.4, 0.1F),
				props(color, SoundType.WOOL, 0.5F));
	}

	/** Registers blocks/items. Called during mod init, before the catalog is built. */
	public static void init() {
		// Class loading registers the fields above.
	}

	/** Adds this group's products to the {@link Catalog}. */
	public static void addProducts() {
		String h = Categories.HOME;
		add("lava_lamp", h, "Lava Lamp (Molten Red)",
				"Real lava sold separately (and strongly discouraged). All of the glow, none of the fire hazard.",
				9, LAVA_LAMP, 48, 1532, "Best Seller");
		add("lava_lamp_blue", h, "Lava Lamp (Deep Ocean)",
				"Like a guardian's daydream in a bottle. Soothing blue wax that rises, falls and simply vibes.",
				9, LAVA_LAMP_BLUE, 47, 804, "");
		add("lava_lamp_purple", h, "Lava Lamp (End Glow)",
				"Pink wax drifting through purple goo. Endermen find it strangely calming.",
				9, LAVA_LAMP_PURPLE, 47, 615, "New");
		add("disco_ball", h, "Disco Ball",
				"Turns any cave into a dance floor. Hang it from the ceiling and let the mirrors do the work.",
				16, DISCO_BALL, 49, 977, "Best Seller");
		add("neon_sign", h, "Neon OPEN Sign",
				"Tell every villager in town you're open for business. Glows emerald green and only buzzes a little.",
				12, NEON_SIGN, 46, 488, "");
		add("desk_lamp", h, "Bendy Desk Lamp",
				"Friendly, flexible and suspiciously animated-looking. Click to switch it on and off.",
				7, DESK_LAMP, 47, 1103, "");
		add("globe", h, "Desk Globe",
				"A spinning model of a perfectly round world, which is adorable. Click it to see where you are.",
				10, GLOBE, 45, 352, "");
		add("bean_bag", h, "Bean Bag (Cherry Red)",
				"Maximum comfort, minimal posture. Sit down and you may never get up again. Also breaks your falls.",
				11, BEAN_BAG, 48, 1420, "Best Seller");
		add("bean_bag_blue", h, "Bean Bag (Ocean Blue)",
				"The same legendary squish, now in calming blue. Fully creeper-proof stitching (not really).",
				11, BEAN_BAG_BLUE, 47, 733, "");
		add("bean_bag_lime", h, "Bean Bag (Slime Lime)",
				"Bright, bouncy-looking and absolutely not made of slime. We checked twice.",
				11, BEAN_BAG_LIME, 46, 512, "Deal");
		add("gaming_chair", h, "Pro Gaming Chair",
				"Racing stripes add +10 speed (spiritually). Ergonomic, swivel-ready and RGB-adjacent. Right-click to sit.",
				18, GAMING_CHAIR, 46, 2077, "Deal");
		add("potted_monstera", h, "Potted Monstera",
				"Swiss-cheese leaves and zero watering required. Brings the jungle home without the ocelots.",
				6, POTTED_MONSTERA, 48, 734, "");
		add("mini_fridge", h, "Mini Fridge",
				"Keeps nine stacks of snacks perfectly chilled. Yes, the light really turns off when you close it.",
				20, MINI_FRIDGE, 49, 856, "New");
		add("retro_tv", h, "Retro TV",
				"Rabbit ears, wood paneling and three channels of premium content. Click to channel-surf.",
				15, RETRO_TV, 45, 523, "");
		add("arcade_cabinet", h, "Arcade Cabinet",
				"Creeper Invaders, straight from 1989. Two blocks tall, endlessly addictive, coins not included.",
				24, ARCADE_CABINET, 50, 404, "Limited");
	}

	private static void add(String id, String category, String name, String description, int price, ItemLike item, int rating, int reviews, String badge) {
		Catalog.register(Product.emerazon(id, category, name, description, price, item, 1, rating, reviews, badge));
	}

	/** Every item of this group (for tooltips etc.). */
	public static List<Item> items() {
		return List.of(LAVA_LAMP.asItem(), LAVA_LAMP_BLUE.asItem(), LAVA_LAMP_PURPLE.asItem(), DISCO_BALL.asItem(), NEON_SIGN.asItem(),
				DESK_LAMP.asItem(), GLOBE.asItem(), BEAN_BAG.asItem(), BEAN_BAG_BLUE.asItem(), BEAN_BAG_LIME.asItem(), GAMING_CHAIR.asItem(),
				POTTED_MONSTERA.asItem(), MINI_FRIDGE.asItem(), RETRO_TV.asItem(), ARCADE_CABINET.asItem());
	}
}
