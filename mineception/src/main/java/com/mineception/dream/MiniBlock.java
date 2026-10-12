package com.mineception.dream;

import java.util.List;

/**
 * Block types of the miniature worlds that run on the laptops. Pure Java: the ids are persisted in laptop data and
 * sent over the network, so never renumber or remove an entry; only append.
 */
public enum MiniBlock {
	AIR(0, Kind.AIR, "minecraft:air", 0),
	BEDROCK(1, Kind.OPAQUE, "minecraft:bedrock", 0),
	STONE(2, Kind.OPAQUE, "minecraft:stone", 0),
	DIRT(3, Kind.OPAQUE, "minecraft:dirt", 0),
	GRASS(4, Kind.OPAQUE, "minecraft:grass_block", 0),
	COBBLESTONE(5, Kind.OPAQUE, "minecraft:cobblestone", 0),
	OAK_PLANKS(6, Kind.OPAQUE, "minecraft:oak_planks", 0),
	OAK_LOG(7, Kind.OPAQUE, "minecraft:oak_log", 0),
	OAK_LEAVES(8, Kind.CUTOUT, "minecraft:oak_leaves", 0),
	SAND(9, Kind.OPAQUE, "minecraft:sand", 0),
	SANDSTONE(10, Kind.OPAQUE, "minecraft:sandstone", 0),
	WATER(11, Kind.LIQUID, "minecraft:water", 0),
	GLASS(12, Kind.CUTOUT, "minecraft:glass", 0),
	BRICKS(13, Kind.OPAQUE, "minecraft:bricks", 0),
	STONE_BRICKS(14, Kind.OPAQUE, "minecraft:stone_bricks", 0),
	MOSSY_STONE_BRICKS(15, Kind.OPAQUE, "minecraft:mossy_stone_bricks", 0),
	CRACKED_STONE_BRICKS(16, Kind.OPAQUE, "minecraft:cracked_stone_bricks", 0),
	SMOOTH_STONE(17, Kind.OPAQUE, "minecraft:smooth_stone", 0),
	GRAY_CONCRETE(18, Kind.OPAQUE, "minecraft:gray_concrete", 0),
	LIGHT_GRAY_CONCRETE(19, Kind.OPAQUE, "minecraft:light_gray_concrete", 0),
	QUARTZ_BLOCK(20, Kind.OPAQUE, "minecraft:quartz_block", 0),
	RED_WOOL(21, Kind.OPAQUE, "minecraft:red_wool", 0),
	WHITE_WOOL(22, Kind.OPAQUE, "minecraft:white_wool", 0),
	TERRACOTTA(23, Kind.OPAQUE, "minecraft:terracotta", 0),
	DARK_OAK_PLANKS(24, Kind.OPAQUE, "minecraft:dark_oak_planks", 0),
	SPRUCE_LOG(25, Kind.OPAQUE, "minecraft:spruce_log", 0),
	SPRUCE_LEAVES(26, Kind.CUTOUT, "minecraft:spruce_leaves", 0),
	SNOW_BLOCK(27, Kind.OPAQUE, "minecraft:snow_block", 0),
	ICE(28, Kind.TRANSLUCENT, "minecraft:ice", 0),
	PACKED_ICE(29, Kind.OPAQUE, "minecraft:packed_ice", 0),
	GLOWSTONE(30, Kind.OPAQUE, "minecraft:glowstone", 15),
	BOOKSHELF(31, Kind.OPAQUE, "minecraft:bookshelf", 0),
	POLISHED_ANDESITE(32, Kind.OPAQUE, "minecraft:polished_andesite", 0),
	BLACK_CONCRETE(33, Kind.OPAQUE, "minecraft:black_concrete", 0),
	YELLOW_CONCRETE(34, Kind.OPAQUE, "minecraft:yellow_concrete", 0),
	SEA_LANTERN(35, Kind.OPAQUE, "minecraft:sea_lantern", 15),
	/** The laptop inside a dream level; its screen shows the next level down. Non-solid special geometry. */
	LAPTOP(36, Kind.SPECIAL, "mineception:laptop", 0),
	CRAFTING_TABLE(37, Kind.OPAQUE, "minecraft:crafting_table", 0),
	DEEPSLATE_TILES(38, Kind.OPAQUE, "minecraft:deepslate_tiles", 0),
	PRISMARINE(39, Kind.OPAQUE, "minecraft:prismarine", 0);

	/** How a block is drawn and collided with. */
	public enum Kind {
		AIR,
		/** Full opaque cube. */
		OPAQUE,
		/** Full cube with alpha-tested holes (leaves, glass). */
		CUTOUT,
		/** Full cube blended over what is behind it (ice). */
		TRANSLUCENT,
		/** Non-solid translucent fluid (water). */
		LIQUID,
		/** Custom geometry (the laptop). */
		SPECIAL
	}

	private static final MiniBlock[] BY_ID = new MiniBlock[256];

	static {
		for (MiniBlock block : values()) {
			if (BY_ID[block.id] != null) {
				throw new IllegalStateException("Duplicate mini block id " + block.id);
			}
			BY_ID[block.id] = block;
		}
	}

	/** Blocks offered in the in-game hotbar, in slot order (9 slots). */
	public static final List<MiniBlock> HOTBAR = List.of(
		GRASS, DIRT, STONE, COBBLESTONE, OAK_PLANKS, OAK_LOG, GLASS, BRICKS, GLOWSTONE);

	public final int id;
	public final Kind kind;
	/** Matching vanilla block/item id, used for icons and sounds on the client. */
	public final String vanillaId;
	/** Light emitted (0-15); emissive blocks are drawn full-bright. */
	public final int light;

	MiniBlock(int id, Kind kind, String vanillaId, int light) {
		this.id = id;
		this.kind = kind;
		this.vanillaId = vanillaId;
		this.light = light;
	}

	public static MiniBlock byId(int id) {
		MiniBlock block = id >= 0 && id < BY_ID.length ? BY_ID[id] : null;
		return block == null ? AIR : block;
	}

	public static boolean isValidId(int id) {
		return id >= 0 && id < BY_ID.length && BY_ID[id] != null;
	}

	/** Blocks the avatar collides with. */
	public boolean solid() {
		return kind == Kind.OPAQUE || kind == Kind.CUTOUT || kind == Kind.TRANSLUCENT;
	}

	/** Blocks that completely hide what is behind them. */
	public boolean opaque() {
		return kind == Kind.OPAQUE;
	}

	public boolean isAir() {
		return this == AIR;
	}

	/** Whether a player may place this block from the hotbar. */
	public boolean placeable() {
		return HOTBAR.contains(this);
	}

	/** Whether a player may break this block. Bedrock and the laptop that leads deeper are protected. */
	public boolean breakable() {
		return this != AIR && this != BEDROCK && this != LAPTOP && this != WATER;
	}
}
