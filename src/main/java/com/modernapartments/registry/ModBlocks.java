package com.modernapartments.registry;

import com.modernapartments.ModernApartments;
import com.modernapartments.block.ApartmentDoorBlock;
import com.modernapartments.block.CeilingLampBlock;
import com.modernapartments.block.CoffeeMakerBlock;
import com.modernapartments.block.ConciergeBellBlock;
import com.modernapartments.block.CurtainBlock;
import com.modernapartments.block.DecorBlock;
import com.modernapartments.block.ElevatorBlock;
import com.modernapartments.block.ElevatorDoorBlock;
import com.modernapartments.block.ElevatorPanelBlock;
import com.modernapartments.block.FacingCubeBlock;
import com.modernapartments.block.FurnitureBlock;
import com.modernapartments.block.GrillBlock;
import com.modernapartments.block.HotTubJetBlock;
import com.modernapartments.block.IntercomBlock;
import com.modernapartments.block.KeycardReaderBlock;
import com.modernapartments.block.LampBlock;
import com.modernapartments.block.LightPanelBlock;
import com.modernapartments.block.LightSwitchBlock;
import com.modernapartments.block.OvenRangeBlock;
import com.modernapartments.block.PoolLadderBlock;
import com.modernapartments.block.PunchingBagBlock;
import com.modernapartments.block.RailingBlock;
import com.modernapartments.block.SeatBlock;
import com.modernapartments.block.SofaBlock;
import com.modernapartments.block.StorageFurnitureBlock;
import com.modernapartments.block.StorageHolder.StorageSound;
import com.modernapartments.block.TableBlock;
import com.modernapartments.block.TallFurnitureBlock;
import com.modernapartments.block.TallStorageBlock;
import com.modernapartments.block.TallToggleBlock;
import com.modernapartments.block.ToggleFurnitureBlock;
import com.modernapartments.block.ToggleSettings;
import com.modernapartments.block.ToggleSettings.Effect;
import com.modernapartments.block.TreadmillBlock;
import com.modernapartments.block.TwoPartFurnitureBlock;
import com.modernapartments.block.VendingMachineBlock;
import com.modernapartments.block.WaterDispenserBlock;
import com.modernapartments.block.ModProperties;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import net.fabricmc.fabric.api.object.builder.v1.block.type.BlockSetTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.TransparentBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/**
 * Every block of the mod. Ids, kinds and render layers mirror tools/assetgen/catalog.py, which
 * generates the matching models, textures, loot tables and collision shapes.
 */
public final class ModBlocks {
	public enum Tab { MATERIALS, FURNITURE, KITCHEN_BATH, AMENITIES, SYSTEMS }

	public enum Render { SOLID, CUTOUT, TRANSLUCENT }

	public static final List<Block> ALL = new ArrayList<>();
	public static final Map<String, Block> BY_ID = new LinkedHashMap<>();
	public static final Map<Block, Tab> TABS = new LinkedHashMap<>();
	public static final Map<Block, Render> RENDER = new LinkedHashMap<>();
	/** Blocks whose items must be placed as two-high blocks. */
	private static final List<Block> DOUBLE_HIGH = new ArrayList<>();
	/** Storage furniture (share one block entity type). */
	public static final List<Block> STORAGE_BLOCKS = new ArrayList<>();
	/** Fixtures with client effects (share the fixture block entity type). */
	public static final List<Block> FIXTURE_BLOCKS = new ArrayList<>();

	// ------------------------------------------------------------------ door sound sets
	public static final BlockSetType GLASS_DOOR_SET = BlockSetTypeBuilder.copyOf(BlockSetType.COPPER)
		.soundGroup(SoundType.GLASS)
		.doorOpenSound(SoundEvents.WOODEN_DOOR_OPEN)
		.doorCloseSound(SoundEvents.WOODEN_DOOR_CLOSE)
		.register(ModernApartments.id("glass_door"));
	public static final BlockSetType STEEL_DOOR_SET = BlockSetTypeBuilder.copyOf(BlockSetType.IRON)
		.openableByHand(true)
		.register(ModernApartments.id("steel_door"));

	// ------------------------------------------------------------------ materials (looked up by id)
	public static final String[] STONE_CUBES = {
		"concrete_panel_white", "concrete_panel_gray", "concrete_panel_charcoal", "lap_siding_white", "lap_siding_gray",
		"lap_siding_navy", "lap_siding_sage", "lap_siding_charcoal", "facade_panel_white", "facade_panel_gray",
		"facade_panel_charcoal", "facade_panel_cream", "brick_red", "brick_charcoal", "brick_white", "brick_tan",
		"brick_exposed", "white_marble", "black_marble", "travertine", "terrazzo", "limestone", "subway_tile",
		"subway_tile_sage", "subway_tile_navy", "mosaic_tile", "large_tile_light", "large_tile_dark", "slate_tile",
		"pool_tile", "pool_tile_dark", "pool_coping", "drywall_white", "drywall_greige", "drywall_sage", "drywall_navy",
		"drywall_blush", "drywall_sky", "drywall_charcoal", "drywall_terracotta", "ceiling", "acoustic_ceiling",
		"polished_concrete", "asphalt", "sidewalk", "pavers_gray", "pavers_charcoal", "pavers_sand", "pool_deck",
		"curb_yellow", "garage_column", "shower_floor"};
	public static final String[] WOOD_CUBES = {
		"cedar_cladding", "walnut_cladding", "hardwood_light", "hardwood_walnut", "hardwood_gray", "hardwood_white_oak",
		"herringbone_oak"};
	public static final String[] METAL_CUBES = {
		"metal_panel_bronze", "metal_panel_graphite", "metal_panel_silver", "mullion_black", "mullion_silver", "elevator_wall"};
	public static final String[] SOFT_CUBES = {
		"artificial_turf", "rubber_flooring", "green_wall", "playground_mulch", "rubber_safety_surface"};
	public static final String[] GLASS = {
		"window_glass", "curtain_wall_blue", "curtain_wall_gray", "smoked_glass", "frosted_glass", "factory_window"};
	public static final String[] MARKINGS = {"parking_line", "parking_line_yellow", "parking_accessible", "parking_arrow", "crosswalk"};

	public static Block STEEL_BEAM;
	public static Block RECESSED_LIGHT;
	public static Block LED_PANEL;
	public static Block CEILING_FINISH, CEILING_FINISH_WOOD, CEILING_DOWNLIGHT, CEILING_LED_PANEL;

	// ------------------------------------------------------------------ living
	public enum SofaColor { GRAY, CHARCOAL, NAVY, BEIGE, EMERALD, COGNAC, WHITE, OUTDOOR }

	public enum ArmchairColor { GRAY, NAVY, MUSTARD, TERRACOTTA, EMERALD, CREAM }

	public enum CurtainColor { CREAM, GRAY, NAVY, SAGE, BLUSH }

	public enum Wood { WALNUT, WHITE, CHARCOAL }

	public static final Map<SofaColor, Block> SOFAS = new EnumMap<>(SofaColor.class);
	public static final Map<ArmchairColor, Block> ARMCHAIRS = new EnumMap<>(ArmchairColor.class);
	public static final Map<CurtainColor, Block> CURTAINS = new EnumMap<>(CurtainColor.class);
	public static final Map<Wood, Block> MEDIA_CONSOLES = new EnumMap<>(Wood.class);
	public static Block LOUNGE_CHAIR, LOUNGE_CHAIR_COGNAC, COFFEE_TABLE_WALNUT, COFFEE_TABLE_OAK, COFFEE_TABLE_MARBLE,
		GLASS_COFFEE_TABLE, SIDE_TABLE, SIDE_TABLE_WOOD, WALL_TV, SMART_TV, BOOKCASE_WALNUT, BOOKCASE_WHITE, BOOKCASE_BLACK,
		BLINDS_WHITE, BLINDS_WOOD, ELECTRIC_FIREPLACE, LOBBY_BENCH, BEAN_BAG;

	// ------------------------------------------------------------------ lighting
	public static Block FLOOR_LAMP, FLOOR_LAMP_BLACK, TABLE_LAMP_CERAMIC, TABLE_LAMP_BRASS, TABLE_LAMP_BLACK, PENDANT_LIGHT_BLACK,
		PENDANT_LIGHT_BRASS, PENDANT_LIGHT_WHITE, CHANDELIER, CEILING_FAN, WALL_SCONCE, GARAGE_LIGHT, STRING_LIGHTS, LAMP_POST,
		LAMP_HEAD, BOLLARD_LIGHT;

	// ------------------------------------------------------------------ kitchen
	public enum KitchenStyle { WHITE, NAVY, SAGE, CHARCOAL, WALNUT }

	public enum KitchenPart { CABINET, DRAWERS, SINK, UPPER, DISHWASHER }

	public enum TableStyle { WALNUT, OAK, WHITE, BLACK }

	public enum ChairStyle { WALNUT, OAK, BLACK, WHITE }

	private static final Map<KitchenStyle, Map<KitchenPart, Block>> KITCHEN = new EnumMap<>(KitchenStyle.class);
	public static final Map<TableStyle, Block> DINING_TABLES = new EnumMap<>(TableStyle.class);
	public static final Map<ChairStyle, Block> DINING_CHAIRS = new EnumMap<>(ChairStyle.class);
	public static Block REFRIGERATOR, OVEN_RANGE, RANGE_HOOD, MICROWAVE, COFFEE_MAKER, ESPRESSO_MACHINE, TOASTER, KITCHEN_UTENSILS,
		FRUIT_BOWL, BAR_STOOL_BLACK, BAR_STOOL_BRASS;

	// ------------------------------------------------------------------ bedroom, bath, laundry
	public static Block NIGHTSTAND_WALNUT, NIGHTSTAND_WHITE, DRESSER_OAK, DRESSER_WHITE, WARDROBE_WHITE, WARDROBE_WALNUT, DESK_WALNUT,
		DESK_WHITE, OFFICE_CHAIR, WALL_MIRROR, WALL_MIRROR_BRASS, CLOTHING_RACK, SHOE_RACK, LAUNDRY_BASKET, WALL_SHELF,
		TOILET, VANITY_WHITE, VANITY_WALNUT, VANITY_NAVY, BATHTUB, SHOWER_HEAD, TOWEL_RACK, TOILET_PAPER_HOLDER,
		MEDICINE_CABINET, VANITY_MIRROR, BATH_MAT, TOWEL_STACK, TOILETRIES, WASHING_MACHINE, DRYER;

	// ------------------------------------------------------------------ decor & electronics
	public static final List<Block> SMALL_PLANTS = new ArrayList<>();
	public static final List<Block> TALL_PLANTS = new ArrayList<>();
	public static final List<Block> ART = new ArrayList<>();
	public static final List<Block> WIDE_ART = new ArrayList<>();
	public static final List<Block> RUNNER_RUGS = new ArrayList<>();
	public static Block SUCCULENT_POT, FLOWER_VASE, PLANTER_BOX, PLANTER_BOX_GRASS, BOOK_STACK, VASE, CANDLE_SET, WALL_CLOCK, LAPTOP,
		DESKTOP_MONITOR, GAME_CONSOLE, SPEAKER, WIFI_ROUTER, DOORMAT;

	// ------------------------------------------------------------------ fitness, pool, outdoor, amenities
	public static final List<Block> YOGA_MATS = new ArrayList<>();
	public static final List<Block> UMBRELLAS = new ArrayList<>();
	public static Block TREADMILL, EXERCISE_BIKE, WEIGHT_BENCH, DUMBBELL_RACK, KETTLEBELLS, PUNCHING_BAG, SQUAT_RACK, ROLLED_YOGA_MAT,
		GYM_MIRROR, LOCKER, WATER_COOLER, TOWEL_CART, POOL_LOUNGER, POOL_LADDER, LIFEBUOY, HOT_TUB_JET, OUTDOOR_SHOWER, PARK_BENCH,
		ADIRONDACK_CHAIR, PICNIC_TABLE, BBQ_GRILL, PATIO_HEATER, BIKE_RACK, TRASH_BIN, RECYCLING_BIN, CORNHOLE_BOARD, SWING_SET,
		SLIDE, AGILITY_HURDLE, PET_WASTE_STATION, DOG_WASH_TUB, DOG_RAMP, PET_SPRAYER, GROOMING_TABLE, GROOMING_SUPPLIES,
		PAW_STATION, TREAT_JAR, POOL_TABLE, PING_PONG_TABLE, ARCADE_MACHINE, VENDING_MACHINE, MINI_FRIDGE, DARTBOARD,
		WHITEBOARD, PRINTER, CONFERENCE_TABLE;

	// ------------------------------------------------------------------ lobby & building systems
	public static final Map<String, Block> SIGNS = new LinkedHashMap<>();
	public static Block RECEPTION_DESK_MARBLE, RECEPTION_DESK_WALNUT, CONCIERGE_BELL, LUGGAGE_CART, MAILBOX_BANK, PARCEL_LOCKER,
		PACKAGE_SHELF, ELEVATOR_FLOOR, ELEVATOR_DOOR, ELEVATOR_PANEL, ELEVATOR_CALL_BUTTON, KEYCARD_READER, INTERCOM,
		SECURITY_CAMERA, SECURITY_CAMERA_DOME, SMOKE_DETECTOR, SPRINKLER, FIRE_EXTINGUISHER, FIRE_ALARM, EXIT_SIGN, THERMOSTAT,
		LIGHT_SWITCH, WALL_OUTLET, EV_CHARGER, WHEEL_STOP, SPEED_BUMP;

	// ------------------------------------------------------------------ doors & railings
	public enum DoorStyle { WALNUT, WHITE, CHARCOAL, GLASS, BARN, STEEL, PATIO, OAK }

	public static final Map<DoorStyle, Block> DOORS = new EnumMap<>(DoorStyle.class);
	public static Block GLASS_RAILING, METAL_RAILING, GLASS_PARTITION;

	private ModBlocks() {
	}

	public static Block get(String id) {
		Block b = BY_ID.get(id);
		if (b == null) {
			throw new IllegalArgumentException("Unknown block modernapartments:" + id);
		}
		return b;
	}

	public static Block kitchen(KitchenStyle style, KitchenPart part) {
		return KITCHEN.get(style).get(part);
	}

	public static void init() {
		registerMaterials();
		registerLiving();
		registerLighting();
		registerKitchen();
		registerBedroomBathLaundry();
		registerDecor();
		registerAmenities();
		registerSystems();
		registerDoors();
	}

	// =============================================================================== registration helpers
	private static <T extends Block> T register(String id, Function<BlockBehaviour.Properties, T> factory,
			BlockBehaviour.Properties properties, Tab tab, Render render) {
		ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, ModernApartments.id(id));
		T block = factory.apply(properties.setId(key));
		Registry.register(BuiltInRegistries.BLOCK, key, block);
		ALL.add(block);
		BY_ID.put(id, block);
		TABS.put(block, tab);
		RENDER.put(block, render);
		if (block instanceof com.modernapartments.block.StorageHolder) {
			STORAGE_BLOCKS.add(block);
		}
		if (block instanceof TallFurnitureBlock || block instanceof ApartmentDoorBlock || block instanceof ElevatorDoorBlock) {
			DOUBLE_HIGH.add(block);
		}
		return block;
	}

	private static <T extends Block> T register(String id, Function<BlockBehaviour.Properties, T> factory,
			BlockBehaviour.Properties properties, Tab tab) {
		return register(id, factory, properties, tab, Render.SOLID);
	}

	/** Creates the block items once every block exists (called from {@link ModItems#init()}). */
	static void registerBlockItems() {
		for (Block block : ALL) {
			ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, BuiltInRegistries.BLOCK.getKey(block));
			Item.Properties props = new Item.Properties().setId(key).useBlockDescriptionPrefix();
			Item item = DOUBLE_HIGH.contains(block) ? new DoubleHighBlockItem(block, props) : new BlockItem(block, props);
			Registry.register(BuiltInRegistries.ITEM, key, item);
		}
	}

	private static BlockBehaviour.Properties stone(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(1.5F, 6.0F).sound(SoundType.STONE);
	}

	private static BlockBehaviour.Properties wood(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(2.0F, 3.0F).sound(SoundType.WOOD).ignitedByLava();
	}

	private static BlockBehaviour.Properties metal(MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(3.0F, 6.0F).sound(SoundType.METAL);
	}

	private static BlockBehaviour.Properties glass() {
		return BlockBehaviour.Properties.of().strength(0.3F).sound(SoundType.GLASS).noOcclusion()
			.isValidSpawn((s, l, p, e) -> false).isRedstoneConductor((s, l, p) -> false)
			.isSuffocating((s, l, p) -> false).isViewBlocking((s, l, p) -> false);
	}

	/** Furniture: non-occluding, modest hardness, sound by material. */
	private static BlockBehaviour.Properties furniture(SoundType sound, MapColor color) {
		return BlockBehaviour.Properties.of().mapColor(color).strength(1.0F, 3.0F).sound(sound).noOcclusion()
			.isRedstoneConductor((s, l, p) -> false).isSuffocating((s, l, p) -> false).isViewBlocking((s, l, p) -> false);
	}

	private static BlockBehaviour.Properties fabric(MapColor color) {
		return furniture(SoundType.WOOL, color).ignitedByLava();
	}

	private static BlockBehaviour.Properties woodFurniture(MapColor color) {
		return furniture(SoundType.WOOD, color).ignitedByLava();
	}

	private static BlockBehaviour.Properties metalFurniture(MapColor color) {
		return furniture(SoundType.METAL, color);
	}

	private static BlockBehaviour.Properties decor(SoundType sound) {
		return furniture(sound, MapColor.NONE).strength(0.4F).pushReaction(PushReaction.DESTROY);
	}

	private static BlockBehaviour.Properties lit(BlockBehaviour.Properties props, int level) {
		return props.lightLevel(s -> s.getValue(BlockStateProperties.LIT) ? level : 0);
	}

	private static BlockBehaviour.Properties litWhenOn(BlockBehaviour.Properties props, int level) {
		return props.lightLevel(s -> s.getValue(ModProperties.ON) ? level : 0);
	}

	private static Block furniture(String id, BlockBehaviour.Properties props, Tab tab) {
		return register(id, FurnitureBlock::new, props, tab);
	}

	private static Block furniture(String id, BlockBehaviour.Properties props, Tab tab, Render render) {
		return register(id, FurnitureBlock::new, props, tab, render);
	}

	private static Block wall(String id, BlockBehaviour.Properties props, Tab tab) {
		return register(id, p -> new FurnitureBlock(p, true), props, tab);
	}

	private static Block wall(String id, BlockBehaviour.Properties props, Tab tab, Render render) {
		return register(id, p -> new FurnitureBlock(p, true), props, tab, render);
	}

	private static Block seat(String id, BlockBehaviour.Properties props, Tab tab, float height) {
		return register(id, p -> new SeatBlock(p, height), props, tab);
	}

	private static Block storage(String id, BlockBehaviour.Properties props, Tab tab, int rows, StorageSound sound) {
		return register(id, p -> new StorageFurnitureBlock(p, rows, sound, false), props, tab);
	}

	private static Block toggle(String id, BlockBehaviour.Properties props, Tab tab, ToggleSettings settings) {
		return toggle(id, props, tab, settings, Render.SOLID);
	}

	private static Block toggle(String id, BlockBehaviour.Properties props, Tab tab, ToggleSettings settings, Render render) {
		Block b = register(id, p -> new ToggleFurnitureBlock(p, settings), settings.light() > 0 ? litWhenOn(props, settings.light()) : props,
			tab, render);
		if (settings.hasEffects()) {
			FIXTURE_BLOCKS.add(b);
		}
		return b;
	}

	private static Block decorBlock(String id, BlockBehaviour.Properties props, Tab tab, Render render) {
		return register(id, DecorBlock::new, props, tab, render);
	}

	private static String lower(Enum<?> e) {
		return e.name().toLowerCase(Locale.ROOT);
	}

	// =============================================================================== materials
	private static void registerMaterials() {
		for (String id : STONE_CUBES) {
			register(id, Block::new, stone(materialColor(id)), Tab.MATERIALS);
		}
		for (String id : WOOD_CUBES) {
			register(id, Block::new, wood(MapColor.WOOD), Tab.MATERIALS);
		}
		for (String id : METAL_CUBES) {
			register(id, Block::new, metal(MapColor.METAL), Tab.MATERIALS);
		}
		register("artificial_turf", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.GRASS).strength(0.8F).sound(SoundType.GRASS), Tab.MATERIALS);
		register("rubber_flooring", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.COLOR_BLACK).strength(1.0F).sound(SoundType.WOOL), Tab.MATERIALS);
		register("green_wall", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.PLANT).strength(0.8F).sound(SoundType.AZALEA_LEAVES), Tab.MATERIALS);
		register("playground_mulch", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.DIRT).strength(0.6F).sound(SoundType.ROOTED_DIRT), Tab.MATERIALS);
		register("rubber_safety_surface", Block::new, BlockBehaviour.Properties.of().mapColor(MapColor.TERRACOTTA_RED).strength(1.0F).sound(SoundType.WOOL), Tab.MATERIALS);
		STEEL_BEAM = register("steel_beam", RotatedPillarBlock::new, metal(MapColor.COLOR_GRAY), Tab.MATERIALS);
		for (String id : GLASS) {
			register(id, TransparentBlock::new, glass(), Tab.MATERIALS, Render.TRANSLUCENT);
		}
		for (String id : MARKINGS) {
			register(id, FacingCubeBlock::new, stone(MapColor.COLOR_GRAY), Tab.MATERIALS);
		}
		CEILING_FINISH = register("ceiling_finish", DecorBlock::new, decor(SoundType.STONE).strength(0.5F).pushReaction(PushReaction.NORMAL), Tab.MATERIALS);
		CEILING_FINISH_WOOD = register("ceiling_finish_wood", DecorBlock::new, decor(SoundType.WOOD).strength(0.5F).pushReaction(PushReaction.NORMAL), Tab.MATERIALS);
		CEILING_DOWNLIGHT = register("ceiling_downlight", CeilingLampBlock::new, lit(decor(SoundType.STONE), 15), Tab.FURNITURE);
		CEILING_LED_PANEL = register("ceiling_led_panel", CeilingLampBlock::new, lit(decor(SoundType.STONE), 15), Tab.FURNITURE);
		RECESSED_LIGHT = register("recessed_light", LightPanelBlock::new, lit(stone(MapColor.SNOW), 15), Tab.MATERIALS);
		LED_PANEL = register("led_panel", LightPanelBlock::new, lit(stone(MapColor.SNOW), 15), Tab.MATERIALS);
	}

	private static MapColor materialColor(String id) {
		if (id.contains("white") || id.equals("ceiling") || id.equals("acoustic_ceiling") || id.equals("subway_tile")) {
			return MapColor.SNOW;
		}
		if (id.contains("charcoal") || id.contains("black") || id.equals("asphalt") || id.contains("dark") || id.contains("slate")) {
			return MapColor.COLOR_BLACK;
		}
		if (id.contains("navy")) {
			return MapColor.COLOR_BLUE;
		}
		if (id.contains("sage")) {
			return MapColor.COLOR_LIGHT_GREEN;
		}
		if (id.startsWith("brick_red") || id.equals("brick_exposed") || id.contains("terracotta")) {
			return MapColor.TERRACOTTA_RED;
		}
		if (id.contains("pool_tile")) {
			return MapColor.COLOR_LIGHT_BLUE;
		}
		if (id.contains("tan") || id.contains("sand") || id.contains("travertine") || id.contains("limestone") || id.contains("cream")) {
			return MapColor.SAND;
		}
		return MapColor.STONE;
	}

	// =============================================================================== living
	private static void registerLiving() {
		for (SofaColor c : SofaColor.values()) {
			SOFAS.put(c, register("sofa_" + lower(c), SofaBlock::new, fabric(MapColor.WOOL), Tab.FURNITURE));
		}
		for (ArmchairColor c : ArmchairColor.values()) {
			ARMCHAIRS.put(c, seat("armchair_" + lower(c), fabric(MapColor.WOOL), Tab.FURNITURE, 0.5F));
		}
		LOUNGE_CHAIR = seat("lounge_chair", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE, 0.45F);
		LOUNGE_CHAIR_COGNAC = seat("lounge_chair_cognac", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE, 0.45F);
		COFFEE_TABLE_WALNUT = furniture("coffee_table_walnut", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE);
		COFFEE_TABLE_OAK = furniture("coffee_table_oak", woodFurniture(MapColor.WOOD), Tab.FURNITURE);
		COFFEE_TABLE_MARBLE = furniture("coffee_table_marble", furniture(SoundType.STONE, MapColor.SNOW), Tab.FURNITURE);
		GLASS_COFFEE_TABLE = furniture("glass_coffee_table", furniture(SoundType.GLASS, MapColor.NONE), Tab.FURNITURE, Render.TRANSLUCENT);
		SIDE_TABLE = furniture("side_table", furniture(SoundType.STONE, MapColor.SNOW), Tab.FURNITURE);
		SIDE_TABLE_WOOD = furniture("side_table_wood", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE);
		for (Wood w : Wood.values()) {
			MEDIA_CONSOLES.put(w, storage("media_console_" + lower(w), woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE, 2, StorageSound.WOOD));
		}
		WALL_TV = register("wall_tv", p -> new ToggleFurnitureBlock(p, new ToggleSettings(4, 0, SoundEvents.STONE_BUTTON_CLICK_ON, null,
			Effect.NONE, false, true)), litWhenOn(metalFurniture(MapColor.COLOR_BLACK), 4), Tab.FURNITURE);
		SMART_TV = toggle("smart_tv", metalFurniture(MapColor.COLOR_BLACK), Tab.FURNITURE, ToggleSettings.screen(4));
		BOOKCASE_WALNUT = register("bookcase_walnut", TallFurnitureBlock::new, woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE);
		BOOKCASE_WHITE = register("bookcase_white", TallFurnitureBlock::new, woodFurniture(MapColor.SNOW), Tab.FURNITURE);
		BOOKCASE_BLACK = register("bookcase_black", TallFurnitureBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.FURNITURE);
		for (CurtainColor c : CurtainColor.values()) {
			CURTAINS.put(c, register("curtains_" + lower(c), CurtainBlock::new, fabric(MapColor.WOOL).noCollision(), Tab.FURNITURE));
		}
		BLINDS_WHITE = register("blinds_white", CurtainBlock::new, woodFurniture(MapColor.SNOW).noCollision(), Tab.FURNITURE);
		BLINDS_WOOD = register("blinds_wood", CurtainBlock::new, woodFurniture(MapColor.WOOD).noCollision(), Tab.FURNITURE);
		ELECTRIC_FIREPLACE = toggle("electric_fireplace", metalFurniture(MapColor.COLOR_BLACK), Tab.FURNITURE,
			ToggleSettings.heat(12, Effect.FIREPLACE, true));
		LOBBY_BENCH = seat("lobby_bench", fabric(MapColor.COLOR_BROWN), Tab.FURNITURE, 0.55F);
		BEAN_BAG = seat("bean_bag", fabric(MapColor.COLOR_YELLOW), Tab.FURNITURE, 0.25F);
	}

	// =============================================================================== lighting
	private static void registerLighting() {
		FLOOR_LAMP = register("floor_lamp", p -> new LampBlock(p, false), lit(metalFurniture(MapColor.GOLD), 14), Tab.FURNITURE);
		FLOOR_LAMP_BLACK = register("floor_lamp_black", p -> new LampBlock(p, false), lit(metalFurniture(MapColor.COLOR_BLACK), 14), Tab.FURNITURE);
		TABLE_LAMP_CERAMIC = register("table_lamp_ceramic", p -> new LampBlock(p, false), lit(decor(SoundType.STONE), 12), Tab.FURNITURE);
		TABLE_LAMP_BRASS = register("table_lamp_brass", p -> new LampBlock(p, false), lit(decor(SoundType.METAL), 12), Tab.FURNITURE);
		TABLE_LAMP_BLACK = register("table_lamp_black", p -> new LampBlock(p, false), lit(decor(SoundType.METAL), 12), Tab.FURNITURE);
		PENDANT_LIGHT_BLACK = register("pendant_light_black", CeilingLampBlock::new, lit(decor(SoundType.METAL), 14), Tab.FURNITURE);
		PENDANT_LIGHT_BRASS = register("pendant_light_brass", CeilingLampBlock::new, lit(decor(SoundType.METAL), 14), Tab.FURNITURE);
		PENDANT_LIGHT_WHITE = register("pendant_light_white", CeilingLampBlock::new, lit(decor(SoundType.METAL), 14), Tab.FURNITURE);
		CHANDELIER = register("chandelier", CeilingLampBlock::new, lit(decor(SoundType.METAL), 15), Tab.FURNITURE);
		CEILING_FAN = register("ceiling_fan", CeilingLampBlock::new, lit(decor(SoundType.METAL), 12), Tab.FURNITURE);
		WALL_SCONCE = register("wall_sconce", p -> new LampBlock(p, true), lit(decor(SoundType.METAL), 12), Tab.FURNITURE);
		GARAGE_LIGHT = register("garage_light", CeilingLampBlock::new, lit(decor(SoundType.METAL), 15), Tab.FURNITURE);
		STRING_LIGHTS = register("string_lights", p -> new LampBlock(p, false), lit(decor(SoundType.CHAIN).noCollision(), 10),
			Tab.FURNITURE, Render.CUTOUT);
		LAMP_POST = register("lamp_post", DecorBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		LAMP_HEAD = register("lamp_head", CeilingLampBlock::new, lit(metalFurniture(MapColor.COLOR_BLACK), 15), Tab.AMENITIES);
		BOLLARD_LIGHT = register("bollard_light", CeilingLampBlock::new, lit(metalFurniture(MapColor.COLOR_BLACK), 11), Tab.AMENITIES);
	}

	// =============================================================================== kitchen
	private static void registerKitchen() {
		for (KitchenStyle s : KitchenStyle.values()) {
			Map<KitchenPart, Block> parts = new EnumMap<>(KitchenPart.class);
			String base = "kitchen_" + lower(s) + "_";
			parts.put(KitchenPart.CABINET, storage(base + "cabinet", woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH, 3, StorageSound.WOOD));
			parts.put(KitchenPart.DRAWERS, storage(base + "drawers", woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH, 3, StorageSound.WOOD));
			Block sink = toggle(base + "sink", woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH, ToggleSettings.water(Effect.SINK, false),
				Render.TRANSLUCENT);
			parts.put(KitchenPart.SINK, sink);
			parts.put(KitchenPart.UPPER, register(base + "upper", p -> new StorageFurnitureBlock(p, 2, StorageSound.WOOD, true),
				woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH));
			parts.put(KitchenPart.DISHWASHER, toggle(base + "dishwasher", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH,
				ToggleSettings.appliance(20 * 20, Effect.DISHWASHER)));
			KITCHEN.put(s, parts);
		}
		REFRIGERATOR = register("refrigerator", p -> new TallStorageBlock(p, 6, StorageSound.FRIDGE), metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH);
		OVEN_RANGE = register("oven_range", OvenRangeBlock::new,
			metalFurniture(MapColor.METAL).lightLevel(s -> s.getValue(BlockStateProperties.LIT) ? 9 : 0), Tab.KITCHEN_BATH);
		RANGE_HOOD = wall("range_hood", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH);
		MICROWAVE = toggle("microwave", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH, new ToggleSettings(3, 20 * 6,
			SoundEvents.STONE_BUTTON_CLICK_ON, SoundEvents.NOTE_BLOCK_PLING.value(), Effect.NONE, false, false));
		COFFEE_MAKER = register("coffee_maker", CoffeeMakerBlock::new, decor(SoundType.METAL), Tab.KITCHEN_BATH, Render.TRANSLUCENT);
		ESPRESSO_MACHINE = register("espresso_machine", CoffeeMakerBlock::new, decor(SoundType.METAL), Tab.KITCHEN_BATH);
		TOASTER = furniture("toaster", decor(SoundType.METAL), Tab.KITCHEN_BATH);
		KITCHEN_UTENSILS = furniture("kitchen_utensils", decor(SoundType.WOOD), Tab.KITCHEN_BATH);
		FRUIT_BOWL = furniture("fruit_bowl", decor(SoundType.WOOD), Tab.KITCHEN_BATH);
		for (TableStyle t : TableStyle.values()) {
			DINING_TABLES.put(t, register("dining_table_" + lower(t), TableBlock::new, woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH));
		}
		for (ChairStyle c : ChairStyle.values()) {
			DINING_CHAIRS.put(c, seat("dining_chair_" + lower(c), woodFurniture(MapColor.WOOD), Tab.KITCHEN_BATH, 0.55F));
		}
		BAR_STOOL_BLACK = seat("bar_stool_black", metalFurniture(MapColor.COLOR_BLACK), Tab.KITCHEN_BATH, 0.78F);
		BAR_STOOL_BRASS = seat("bar_stool_brass", metalFurniture(MapColor.GOLD), Tab.KITCHEN_BATH, 0.78F);
	}

	// =============================================================================== bedroom, bathroom, laundry
	private static void registerBedroomBathLaundry() {
		NIGHTSTAND_WALNUT = storage("nightstand_walnut", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE, 1, StorageSound.WOOD);
		NIGHTSTAND_WHITE = storage("nightstand_white", woodFurniture(MapColor.SNOW), Tab.FURNITURE, 1, StorageSound.WOOD);
		DRESSER_OAK = storage("dresser_oak", woodFurniture(MapColor.WOOD), Tab.FURNITURE, 3, StorageSound.WOOD);
		DRESSER_WHITE = storage("dresser_white", woodFurniture(MapColor.SNOW), Tab.FURNITURE, 3, StorageSound.WOOD);
		WARDROBE_WHITE = register("wardrobe_white", p -> new TallStorageBlock(p, 6, StorageSound.WOOD), woodFurniture(MapColor.SNOW), Tab.FURNITURE);
		WARDROBE_WALNUT = register("wardrobe_walnut", p -> new TallStorageBlock(p, 6, StorageSound.WOOD), woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE);
		DESK_WALNUT = furniture("desk_walnut", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE);
		DESK_WHITE = furniture("desk_white", woodFurniture(MapColor.SNOW), Tab.FURNITURE);
		OFFICE_CHAIR = seat("office_chair", fabric(MapColor.COLOR_BLACK), Tab.FURNITURE, 0.55F);
		WALL_MIRROR = wall("wall_mirror", furniture(SoundType.GLASS, MapColor.NONE), Tab.FURNITURE);
		WALL_MIRROR_BRASS = wall("wall_mirror_brass", furniture(SoundType.GLASS, MapColor.NONE), Tab.FURNITURE);
		CLOTHING_RACK = furniture("clothing_rack", fabric(MapColor.WOOL), Tab.FURNITURE, Render.CUTOUT);
		SHOE_RACK = furniture("shoe_rack", woodFurniture(MapColor.WOOD), Tab.FURNITURE);
		LAUNDRY_BASKET = storage("laundry_basket", decor(SoundType.WOOD), Tab.FURNITURE, 1, StorageSound.SOFT);
		WALL_SHELF = wall("wall_shelf", woodFurniture(MapColor.COLOR_BROWN), Tab.FURNITURE, Render.CUTOUT);

		TOILET = seat("toilet", furniture(SoundType.STONE, MapColor.SNOW), Tab.KITCHEN_BATH, 0.5F);
		VANITY_WHITE = storage("vanity_white", woodFurniture(MapColor.SNOW), Tab.KITCHEN_BATH, 2, StorageSound.WOOD);
		VANITY_WALNUT = storage("vanity_walnut", woodFurniture(MapColor.COLOR_BROWN), Tab.KITCHEN_BATH, 2, StorageSound.WOOD);
		VANITY_NAVY = storage("vanity_navy", woodFurniture(MapColor.COLOR_BLUE), Tab.KITCHEN_BATH, 2, StorageSound.WOOD);
		BATHTUB = register("bathtub", p -> new TwoPartFurnitureBlock(p, 0.2F), furniture(SoundType.STONE, MapColor.SNOW), Tab.KITCHEN_BATH);
		SHOWER_HEAD = toggle("shower_head", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH, ToggleSettings.water(Effect.SHOWER, true));
		TOWEL_RACK = wall("towel_rack", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH);
		TOILET_PAPER_HOLDER = wall("toilet_paper_holder", metalFurniture(MapColor.METAL), Tab.KITCHEN_BATH);
		MEDICINE_CABINET = register("medicine_cabinet", p -> new StorageFurnitureBlock(p, 1, StorageSound.WOOD, true),
			furniture(SoundType.GLASS, MapColor.SNOW), Tab.KITCHEN_BATH);
		VANITY_MIRROR = wall("vanity_mirror", furniture(SoundType.GLASS, MapColor.NONE), Tab.KITCHEN_BATH);
		BATH_MAT = furniture("bath_mat", decor(SoundType.WOOL), Tab.KITCHEN_BATH);
		TOWEL_STACK = furniture("towel_stack", decor(SoundType.WOOL), Tab.KITCHEN_BATH);
		TOILETRIES = furniture("toiletries", decor(SoundType.STONE), Tab.KITCHEN_BATH);
		WASHING_MACHINE = toggle("washing_machine", metalFurniture(MapColor.SNOW), Tab.KITCHEN_BATH, ToggleSettings.appliance(20 * 15, Effect.WASHER));
		DRYER = toggle("dryer", metalFurniture(MapColor.SNOW), Tab.KITCHEN_BATH, ToggleSettings.appliance(20 * 15, Effect.DRYER));
	}

	// =============================================================================== decor & electronics
	private static void registerDecor() {
		for (String kind : new String[] {"monstera", "snake", "fern", "herbs", "flowers"}) {
			SMALL_PLANTS.add(decorBlock("potted_" + kind, decor(SoundType.STONE), Tab.FURNITURE, Render.CUTOUT));
		}
		for (String kind : new String[] {"fiddle", "olive", "palm"}) {
			TALL_PLANTS.add(decorBlock("potted_" + kind, decor(SoundType.STONE), Tab.FURNITURE, Render.CUTOUT));
		}
		SUCCULENT_POT = decorBlock("succulent_pot", decor(SoundType.STONE), Tab.FURNITURE, Render.CUTOUT);
		FLOWER_VASE = decorBlock("flower_vase", decor(SoundType.GLASS), Tab.FURNITURE, Render.CUTOUT);
		PLANTER_BOX = decorBlock("planter_box", woodFurniture(MapColor.WOOD), Tab.AMENITIES, Render.CUTOUT);
		PLANTER_BOX_GRASS = decorBlock("planter_box_grass", furniture(SoundType.STONE, MapColor.STONE), Tab.AMENITIES, Render.CUTOUT);
		BOOK_STACK = furniture("book_stack", decor(SoundType.WOOD), Tab.FURNITURE);
		VASE = furniture("vase", decor(SoundType.STONE), Tab.FURNITURE);
		CANDLE_SET = furniture("candle_set", decor(SoundType.CANDLE), Tab.FURNITURE);
		for (String art : new String[] {"fields", "grid", "waves", "sunset", "botanical", "geometric", "city"}) {
			ART.add(wall("art_" + art, decor(SoundType.WOOD), Tab.FURNITURE));
		}
		for (String art : new String[] {"wide_strokes", "wide_landscape"}) {
			WIDE_ART.add(wall("art_" + art, decor(SoundType.WOOD), Tab.FURNITURE));
		}
		WALL_CLOCK = wall("wall_clock", decor(SoundType.WOOD), Tab.FURNITURE);
		LAPTOP = toggle("laptop", decor(SoundType.METAL), Tab.FURNITURE, ToggleSettings.screen(0));
		DESKTOP_MONITOR = toggle("desktop_monitor", decor(SoundType.METAL), Tab.FURNITURE, ToggleSettings.screen(0));
		GAME_CONSOLE = furniture("game_console", decor(SoundType.METAL), Tab.FURNITURE);
		SPEAKER = furniture("speaker", decor(SoundType.WOOD), Tab.FURNITURE);
		WIFI_ROUTER = furniture("wifi_router", decor(SoundType.METAL), Tab.FURNITURE);
		for (String c : new String[] {"charcoal", "cream", "terracotta"}) {
			RUNNER_RUGS.add(furniture("runner_rug_" + c, decor(SoundType.WOOL), Tab.FURNITURE));
		}
		DOORMAT = furniture("doormat", decor(SoundType.WOOL), Tab.FURNITURE);
	}

	// =============================================================================== fitness, pool, outdoor, amenities
	private static void registerAmenities() {
		TREADMILL = register("treadmill", TreadmillBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		EXERCISE_BIKE = seat("exercise_bike", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES, 0.62F);
		WEIGHT_BENCH = seat("weight_bench", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES, 0.5F);
		DUMBBELL_RACK = furniture("dumbbell_rack", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		KETTLEBELLS = furniture("kettlebells", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		PUNCHING_BAG = register("punching_bag", PunchingBagBlock::new, fabric(MapColor.COLOR_BLACK), Tab.AMENITIES);
		SQUAT_RACK = register("squat_rack", TallFurnitureBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		for (String c : new String[] {"purple", "teal", "coral"}) {
			YOGA_MATS.add(furniture("yoga_mat_" + c, decor(SoundType.WOOL), Tab.AMENITIES));
		}
		ROLLED_YOGA_MAT = furniture("rolled_yoga_mat", decor(SoundType.WOOL), Tab.AMENITIES);
		GYM_MIRROR = wall("gym_mirror", furniture(SoundType.GLASS, MapColor.NONE), Tab.AMENITIES);
		LOCKER = register("locker", p -> new TallStorageBlock(p, 3, StorageSound.METAL), metalFurniture(MapColor.COLOR_BLUE), Tab.AMENITIES);
		WATER_COOLER = register("water_cooler", WaterDispenserBlock::new, metalFurniture(MapColor.SNOW), Tab.AMENITIES, Render.TRANSLUCENT);
		TOWEL_CART = furniture("towel_cart", decor(SoundType.WOOL), Tab.AMENITIES);
		POOL_LOUNGER = register("pool_lounger", p -> new TwoPartFurnitureBlock(p, 0.35F), metalFurniture(MapColor.SNOW), Tab.AMENITIES);
		for (String c : new String[] {"navy", "teal", "beige"}) {
			UMBRELLAS.add(furniture("patio_umbrella_" + c, fabric(MapColor.WOOL), Tab.AMENITIES));
		}
		POOL_LADDER = register("pool_ladder", PoolLadderBlock::new, metalFurniture(MapColor.METAL), Tab.AMENITIES);
		LIFEBUOY = wall("lifebuoy", decor(SoundType.WOOL), Tab.AMENITIES, Render.CUTOUT);
		HOT_TUB_JET = register("hot_tub_jet", HotTubJetBlock::new, metalFurniture(MapColor.METAL), Tab.AMENITIES);
		OUTDOOR_SHOWER = register("outdoor_shower", p -> new TallToggleBlock(p, ToggleSettings.water(Effect.SHOWER, false)),
			metalFurniture(MapColor.METAL), Tab.AMENITIES);
		FIXTURE_BLOCKS.add(OUTDOOR_SHOWER);
		PARK_BENCH = seat("park_bench", woodFurniture(MapColor.WOOD), Tab.AMENITIES, 0.5F);
		ADIRONDACK_CHAIR = seat("adirondack_chair", woodFurniture(MapColor.SNOW), Tab.AMENITIES, 0.4F);
		PICNIC_TABLE = furniture("picnic_table", woodFurniture(MapColor.WOOD), Tab.AMENITIES);
		BBQ_GRILL = register("bbq_grill", GrillBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES);
		FIXTURE_BLOCKS.add(BBQ_GRILL);
		PATIO_HEATER = register("patio_heater", p -> new TallToggleBlock(p, ToggleSettings.heat(13, Effect.HEATER, false)),
			litWhenOn(metalFurniture(MapColor.METAL), 13), Tab.AMENITIES);
		FIXTURE_BLOCKS.add(PATIO_HEATER);
		BIKE_RACK = furniture("bike_rack", metalFurniture(MapColor.METAL), Tab.AMENITIES);
		TRASH_BIN = storage("trash_bin", metalFurniture(MapColor.COLOR_GREEN), Tab.AMENITIES, 1, StorageSound.METAL);
		RECYCLING_BIN = storage("recycling_bin", metalFurniture(MapColor.COLOR_BLUE), Tab.AMENITIES, 1, StorageSound.METAL);
		CORNHOLE_BOARD = furniture("cornhole_board", woodFurniture(MapColor.WOOD), Tab.AMENITIES);
		SWING_SET = seat("swing_set", metalFurniture(MapColor.COLOR_BLUE), Tab.AMENITIES, 0.2F);
		SLIDE = register("slide", p -> new TwoPartFurnitureBlock(p, -1), furniture(SoundType.STONE, MapColor.COLOR_RED), Tab.AMENITIES);
		AGILITY_HURDLE = furniture("agility_hurdle", furniture(SoundType.STONE, MapColor.SNOW), Tab.AMENITIES);
		PET_WASTE_STATION = furniture("pet_waste_station", metalFurniture(MapColor.COLOR_GREEN), Tab.AMENITIES);
		DOG_WASH_TUB = furniture("dog_wash_tub", metalFurniture(MapColor.METAL), Tab.AMENITIES);
		DOG_RAMP = furniture("dog_ramp", furniture(SoundType.WOOL, MapColor.COLOR_BLACK), Tab.AMENITIES);
		PET_SPRAYER = toggle("pet_sprayer", metalFurniture(MapColor.METAL), Tab.AMENITIES, ToggleSettings.water(Effect.SPRAYER, true));
		GROOMING_TABLE = furniture("grooming_table", metalFurniture(MapColor.METAL), Tab.AMENITIES);
		GROOMING_SUPPLIES = wall("grooming_supplies", decor(SoundType.WOOD), Tab.AMENITIES, Render.CUTOUT);
		PAW_STATION = furniture("paw_station", metalFurniture(MapColor.METAL), Tab.AMENITIES, Render.TRANSLUCENT);
		TREAT_JAR = furniture("treat_jar", decor(SoundType.GLASS), Tab.AMENITIES, Render.TRANSLUCENT);
		POOL_TABLE = register("pool_table", p -> new TwoPartFurnitureBlock(p, -1), woodFurniture(MapColor.COLOR_GREEN), Tab.AMENITIES);
		PING_PONG_TABLE = register("ping_pong_table", p -> new TwoPartFurnitureBlock(p, -1), woodFurniture(MapColor.COLOR_BLUE), Tab.AMENITIES);
		ARCADE_MACHINE = register("arcade_machine", p -> new TallToggleBlock(p, ToggleSettings.screen(6)),
			litWhenOn(furniture(SoundType.WOOD, MapColor.COLOR_BLACK), 6), Tab.AMENITIES);
		VENDING_MACHINE = register("vending_machine", VendingMachineBlock::new,
			metalFurniture(MapColor.COLOR_RED).lightLevel(s -> 7), Tab.AMENITIES);
		MINI_FRIDGE = storage("mini_fridge", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES, 2, StorageSound.FRIDGE);
		DARTBOARD = wall("dartboard", decor(SoundType.WOOD), Tab.AMENITIES, Render.CUTOUT);
		WHITEBOARD = wall("whiteboard", furniture(SoundType.METAL, MapColor.SNOW), Tab.AMENITIES);
		PRINTER = furniture("printer", decor(SoundType.METAL), Tab.AMENITIES);
		CONFERENCE_TABLE = register("conference_table", TableBlock::new, woodFurniture(MapColor.COLOR_BROWN), Tab.AMENITIES);
	}

	// =============================================================================== lobby & systems
	private static void registerSystems() {
		RECEPTION_DESK_MARBLE = furniture("reception_desk_marble", furniture(SoundType.STONE, MapColor.SNOW), Tab.AMENITIES);
		RECEPTION_DESK_WALNUT = furniture("reception_desk_walnut", woodFurniture(MapColor.COLOR_BROWN), Tab.AMENITIES);
		CONCIERGE_BELL = register("concierge_bell", ConciergeBellBlock::new, decor(SoundType.METAL), Tab.AMENITIES);
		LUGGAGE_CART = furniture("luggage_cart", metalFurniture(MapColor.GOLD), Tab.AMENITIES);
		MAILBOX_BANK = register("mailbox_bank", p -> new StorageFurnitureBlock(p, 1, StorageSound.METAL, true), metalFurniture(MapColor.METAL), Tab.AMENITIES);
		PARCEL_LOCKER = register("parcel_locker", p -> new TallStorageBlock(p, 4, StorageSound.METAL), metalFurniture(MapColor.METAL), Tab.AMENITIES);
		PACKAGE_SHELF = storage("package_shelf", metalFurniture(MapColor.COLOR_BLACK), Tab.AMENITIES, 3, StorageSound.WOOD);

		ELEVATOR_FLOOR = register("elevator_floor", ElevatorBlock::new, metal(MapColor.METAL), Tab.SYSTEMS);
		ELEVATOR_DOOR = register("elevator_door", ElevatorDoorBlock::new, metalFurniture(MapColor.METAL).strength(3.0F, 6.0F), Tab.SYSTEMS);
		ELEVATOR_PANEL = register("elevator_panel", ElevatorPanelBlock::new, metalFurniture(MapColor.METAL), Tab.SYSTEMS);
		ELEVATOR_CALL_BUTTON = register("elevator_call_button", ElevatorPanelBlock::new, metalFurniture(MapColor.METAL), Tab.SYSTEMS);
		KEYCARD_READER = register("keycard_reader", KeycardReaderBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.SYSTEMS);
		INTERCOM = register("intercom", IntercomBlock::new, metalFurniture(MapColor.METAL), Tab.SYSTEMS);
		SECURITY_CAMERA = wall("security_camera", decor(SoundType.METAL), Tab.SYSTEMS);
		SECURITY_CAMERA_DOME = decorBlock("security_camera_dome", decor(SoundType.METAL), Tab.SYSTEMS, Render.SOLID);
		SMOKE_DETECTOR = decorBlock("smoke_detector", decor(SoundType.METAL), Tab.SYSTEMS, Render.SOLID);
		SPRINKLER = decorBlock("sprinkler", decor(SoundType.METAL), Tab.SYSTEMS, Render.SOLID);
		FIRE_EXTINGUISHER = wall("fire_extinguisher", decor(SoundType.METAL), Tab.SYSTEMS);
		FIRE_ALARM = wall("fire_alarm", decor(SoundType.METAL), Tab.SYSTEMS);
		EXIT_SIGN = wall("exit_sign", decor(SoundType.METAL).lightLevel(s -> 8), Tab.SYSTEMS);
		THERMOSTAT = wall("thermostat", decor(SoundType.METAL), Tab.SYSTEMS);
		LIGHT_SWITCH = register("light_switch", LightSwitchBlock::new, decor(SoundType.METAL), Tab.SYSTEMS);
		WALL_OUTLET = wall("wall_outlet", decor(SoundType.METAL), Tab.SYSTEMS);
		EV_CHARGER = wall("ev_charger", metalFurniture(MapColor.SNOW), Tab.SYSTEMS);
		WHEEL_STOP = furniture("wheel_stop", furniture(SoundType.STONE, MapColor.STONE), Tab.SYSTEMS);
		SPEED_BUMP = furniture("speed_bump", furniture(SoundType.STONE, MapColor.COLOR_YELLOW), Tab.SYSTEMS);
		for (String icon : new String[] {"stairs", "elevator", "restroom", "fitness", "pool", "laundry", "mail", "parking", "pets",
			"bike", "lounge", "wifi", "leasing", "trash", "accessible", "roof"}) {
			SIGNS.put(icon, wall("sign_" + icon, decor(SoundType.METAL), Tab.SYSTEMS));
		}
	}

	// =============================================================================== doors & railings
	private static void registerDoors() {
		for (DoorStyle style : DoorStyle.values()) {
			BlockSetType set = switch (style) {
				case GLASS, PATIO -> GLASS_DOOR_SET;
				case STEEL -> STEEL_DOOR_SET;
				case WHITE -> BlockSetType.BIRCH;
				default -> BlockSetType.DARK_OAK;
			};
			BlockBehaviour.Properties props = BlockBehaviour.Properties.of().mapColor(MapColor.WOOD).strength(3.0F).noOcclusion()
				.sound(set.soundType()).pushReaction(PushReaction.DESTROY);
			DOORS.put(style, register("door_" + lower(style), p -> new ApartmentDoorBlock(set, p), props, Tab.SYSTEMS, Render.CUTOUT));
		}
		GLASS_RAILING = register("glass_railing", RailingBlock::new, glass().strength(1.0F), Tab.SYSTEMS, Render.TRANSLUCENT);
		METAL_RAILING = register("metal_railing", RailingBlock::new, metalFurniture(MapColor.COLOR_BLACK), Tab.SYSTEMS, Render.CUTOUT);
		GLASS_PARTITION = register("glass_partition", RailingBlock::new, glass().strength(1.0F), Tab.SYSTEMS, Render.TRANSLUCENT);
	}
}
