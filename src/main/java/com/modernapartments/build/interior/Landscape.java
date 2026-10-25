package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.registry.ModBlocks;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.FenceGateBlock;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.SlabBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.SlabType;

/**
 * Site work: trees, planting, paths, lighting, and outdoor amenities. Ground level is y = 0 (the surface
 * block) with things standing on it at y = 1, as in room frames.
 */
public final class Landscape {
	public enum Tree { OAK, BIRCH, SPRUCE, CHERRY, FLOWERING }

	private Landscape() {
	}

	// ================================================================================== planting
	private static BlockState leaves(Block b) {
		BlockState s = b.defaultBlockState();
		return s.hasProperty(LeavesBlock.PERSISTENT) ? s.setValue(LeavesBlock.PERSISTENT, true) : s;
	}

	/** A small street tree with its trunk base at (x, y, z) (y = first log above the ground block). */
	public static void tree(Canvas c, int x, int y, int z, Tree kind, RandomSource r) {
		Block log;
		Block leaf;
		switch (kind) {
			case BIRCH -> {
				log = Blocks.BIRCH_LOG;
				leaf = Blocks.BIRCH_LEAVES;
			}
			case SPRUCE -> {
				log = Blocks.SPRUCE_LOG;
				leaf = Blocks.SPRUCE_LEAVES;
			}
			case CHERRY -> {
				log = Blocks.CHERRY_LOG;
				leaf = Blocks.CHERRY_LEAVES;
			}
			case FLOWERING -> {
				log = Blocks.OAK_LOG;
				leaf = Blocks.FLOWERING_AZALEA_LEAVES;
			}
			default -> {
				log = Blocks.OAK_LOG;
				leaf = Blocks.OAK_LEAVES;
			}
		}
		BlockState l = leaves(leaf);
		BlockState trunk = log.defaultBlockState().setValue(RotatedPillarBlock.AXIS, Direction.Axis.Y);
		if (kind == Tree.SPRUCE) {
			int th = 6 + r.nextInt(2);
			for (int i = 0; i < th; i++) {
				c.set(x, y + i, z, trunk);
			}
			int[] radii = {2, 2, 1, 1, 1, 0};
			for (int i = 0; i < radii.length; i++) {
				blob(c, x, y + 2 + i, z, radii[i], l, i % 2 == 1);
			}
			c.set(x, y + th, z, l);
			return;
		}
		int th = kind == Tree.FLOWERING ? 2 : (kind == Tree.BIRCH ? 4 : 3) + r.nextInt(2);
		for (int i = 0; i < th; i++) {
			c.set(x, y + i, z, trunk);
		}
		int top = y + th;
		int radius = kind == Tree.FLOWERING ? 1 : 2;
		blob(c, x, top - 1, z, radius, l, true);
		blob(c, x, top, z, radius, l, false);
		blob(c, x, top + 1, z, Math.max(1, radius - 1), l, false);
		if (kind != Tree.FLOWERING) {
			c.set(x, top + 2, z, l);
		}
	}

	/** Disc of leaves (corners trimmed), never replacing logs. */
	private static void blob(Canvas c, int x, int y, int z, int radius, BlockState leaf, boolean trimCorners) {
		for (int dx = -radius; dx <= radius; dx++) {
			for (int dz = -radius; dz <= radius; dz++) {
				if (radius > 0 && Math.abs(dx) == radius && Math.abs(dz) == radius && (trimCorners || radius > 1)) {
					continue;
				}
				if (c.isAirOrUnset(x + dx, y, z + dz)) {
					c.set(x + dx, y, z + dz, leaf);
				}
			}
		}
	}

	public static Tree randomTree(RandomSource r) {
		return switch (r.nextInt(6)) {
			case 0, 1 -> Tree.OAK;
			case 2 -> Tree.BIRCH;
			case 3 -> Tree.CHERRY;
			case 4 -> Tree.FLOWERING;
			default -> Tree.SPRUCE;
		};
	}

	/** Grass with a scatter of flowers and tufts on the given rectangle (ground at y). */
	public static void lawn(Canvas c, int x0, int z0, int x1, int z1, int y, RandomSource r, double flowers) {
		Block[] blooms = {Blocks.POPPY, Blocks.DANDELION, Blocks.CORNFLOWER, Blocks.OXEYE_DAISY, Blocks.ALLIUM, Blocks.AZURE_BLUET};
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				c.set(x, y, z, Blocks.GRASS_BLOCK);
				if (c.isAirOrUnset(x, y + 1, z)) {
					double roll = r.nextDouble();
					if (roll < flowers) {
						c.set(x, y + 1, z, blooms[r.nextInt(blooms.length)]);
					} else if (roll < flowers + 0.12) {
						c.set(x, y + 1, z, Blocks.SHORT_GRASS);
					}
				}
			}
		}
	}

	/** Flower bed of one or two species (mulch-like coarse dirt base). */
	public static void flowerBed(Canvas c, int x0, int z0, int x1, int z1, int y, RandomSource r) {
		Block[][] palettes = {{Blocks.RED_TULIP, Blocks.WHITE_TULIP}, {Blocks.PINK_TULIP, Blocks.ALLIUM}, {Blocks.CORNFLOWER, Blocks.OXEYE_DAISY},
			{Blocks.ORANGE_TULIP, Blocks.DANDELION}, {Blocks.LILY_OF_THE_VALLEY, Blocks.BLUE_ORCHID}};
		Block[] p = palettes[r.nextInt(palettes.length)];
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				c.set(x, y, z, Blocks.ROOTED_DIRT);
				c.set(x, y + 1, z, p[(x + z) % 2]);
			}
		}
	}

	/** Clipped hedge (persistent leaves) one or two blocks tall. */
	public static void hedge(Canvas c, int x0, int z0, int x1, int z1, int y, int height, Block leaf) {
		for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
			for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
				c.set(x, y - 1, z, Blocks.GRASS_BLOCK);
				for (int i = 0; i < height; i++) {
					c.set(x, y + i, z, leaves(leaf));
				}
			}
		}
	}

	/** Street lamp: three post sections and a lamp head. */
	public static void lampPost(Canvas c, int x, int y, int z) {
		for (int i = 0; i < 3; i++) {
			c.set(x, y + i, z, ModBlocks.LAMP_POST);
		}
		c.set(x, y + 3, z, ModBlocks.LAMP_HEAD);
	}

	/** Lamps every {@code spacing} blocks along a straight line. */
	public static void lampsAlong(Canvas c, int x0, int z0, int x1, int z1, int y, int spacing) {
		int len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
		for (int i = 0; i <= len; i += spacing) {
			int x = x0 + Integer.signum(x1 - x0) * i;
			int z = z0 + Integer.signum(z1 - z0) * i;
			lampPost(c, x, y, z);
		}
	}

	/** String lights strung between two posts at height y + 3. */
	public static void stringLights(Canvas c, int x0, int z0, int x1, int z1, int y) {
		lampPost(c, x0, y, z0);
		lampPost(c, x1, y, z1);
		Direction along = x0 == x1 ? Direction.SOUTH : Direction.EAST;
		int len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
		for (int i = 1; i < len; i++) {
			int x = x0 + Integer.signum(x1 - x0) * i;
			int z = z0 + Integer.signum(z1 - z0) * i;
			c.put(x, y + 3, z, ModBlocks.STRING_LIGHTS, along.getClockWise());
		}
	}

	// ================================================================================== outdoor amenities (frame-local)
	/** Playground in a w x d frame: safety surface, swing set, slide, benches for parents. */
	public static void playground(Canvas c, int w, int d, RandomSource r) {
		c.fill(0, 0, 0, w - 1, 0, d - 1, ModBlocks.get("rubber_safety_surface"));
		c.fill(0, 0, 0, w - 1, 0, 0, ModBlocks.get("playground_mulch"));
		c.put(w / 2 - 2, 1, d / 2, ModBlocks.SWING_SET, Direction.SOUTH);
		c.put(w / 2 + 1, 1, d / 2, ModBlocks.SWING_SET, Direction.SOUTH);
		if (d >= 5) {
			c.twoPart(w - 2, 1, d - 2, ModBlocks.SLIDE, Direction.NORTH);
		}
		c.put(0, 1, d - 1, ModBlocks.PARK_BENCH, Direction.NORTH);
		c.put(1, 1, d - 1, ModBlocks.PARK_BENCH, Direction.NORTH);
		c.put(w - 1, 1, 0, ModBlocks.TRASH_BIN, Direction.SOUTH);
	}

	/** Fenced dog park with artificial turf, agility hurdles, a waste station and a bench. */
	public static void dogPark(Canvas c, int w, int d, RandomSource r, Direction gateSide) {
		c.fill(0, 0, 0, w - 1, 0, d - 1, ModBlocks.get("artificial_turf"));
		for (int x = -1; x <= w; x++) {
			c.set(x, 0, -1, ModBlocks.get("sidewalk"));
			c.set(x, 0, d, ModBlocks.get("sidewalk"));
			c.set(x, 1, -1, Blocks.DARK_OAK_FENCE);
			c.set(x, 1, d, Blocks.DARK_OAK_FENCE);
		}
		for (int z = 0; z < d; z++) {
			c.set(-1, 0, z, ModBlocks.get("sidewalk"));
			c.set(w, 0, z, ModBlocks.get("sidewalk"));
			c.set(-1, 1, z, Blocks.DARK_OAK_FENCE);
			c.set(w, 1, z, Blocks.DARK_OAK_FENCE);
		}
		int gx = gateSide.getAxis() == Direction.Axis.Z ? w / 2 : (gateSide == Direction.EAST ? w : -1);
		int gz = gateSide.getAxis() == Direction.Axis.X ? d / 2 : (gateSide == Direction.SOUTH ? d : -1);
		c.set(gx, 1, gz, Blocks.DARK_OAK_FENCE_GATE.defaultBlockState().setValue(FenceGateBlock.FACING, gateSide));
		for (int i = 0; i < Math.min(3, w / 3); i++) {
			c.put(2 + i * 3, 1, d / 2, ModBlocks.AGILITY_HURDLE, Direction.NORTH);
		}
		c.put(0, 1, 0, ModBlocks.PET_WASTE_STATION, Direction.SOUTH);
		c.put(w - 1, 1, d - 1, ModBlocks.PARK_BENCH, Direction.NORTH);
		c.put(w - 2, 1, d - 1, ModBlocks.PARK_BENCH, Direction.NORTH);
		if (w >= 6 && d >= 6) {
			tree(c, w - 2, 1, 1, Tree.OAK, r);
		}
		c.marker("amenity", w / 2, 1, d / 2 + 1 < d ? d / 2 + 1 : d / 2, "dog park");
	}

	/** Grilling area: two grills, picnic tables, a trash bin and string lights. */
	public static void bbq(Canvas c, int w, int d, RandomSource r) {
		c.fill(0, 0, 0, w - 1, 0, d - 1, ModBlocks.get("pavers_charcoal"));
		c.put(1, 1, 0, ModBlocks.BBQ_GRILL, Direction.SOUTH);
		if (w >= 7) {
			c.put(w - 2, 1, 0, ModBlocks.BBQ_GRILL, Direction.SOUTH);
		}
		for (int i = 0; i < Math.max(1, (w - 2) / 4); i++) {
			c.put(2 + i * 4, 1, d / 2 + 1, ModBlocks.PICNIC_TABLE, Direction.EAST);
		}
		c.put(0, 1, d - 1, ModBlocks.TRASH_BIN, Direction.NORTH);
		c.put(w - 1, 1, d - 1, ModBlocks.RECYCLING_BIN, Direction.NORTH);
		stringLights(c, 0, 1, w - 1, 1, 1);
		c.marker("amenity", w / 2, 1, d - 1, "grilling area");
	}

	/** Cornhole lawn: turf strip with two boards facing each other and chairs at the ends. */
	public static void cornhole(Canvas c, int w, int d) {
		c.fill(0, 0, 0, w - 1, 0, d - 1, ModBlocks.get("artificial_turf"));
		int mid = w / 2;
		c.put(mid, 1, 1, ModBlocks.CORNHOLE_BOARD, Direction.SOUTH);
		c.put(mid, 1, d - 2, ModBlocks.CORNHOLE_BOARD, Direction.NORTH);
		if (w >= 5) {
			c.put(mid - 2, 1, 0, ModBlocks.ADIRONDACK_CHAIR, Direction.SOUTH);
			c.put(mid + 2, 1, d - 1, ModBlocks.ADIRONDACK_CHAIR, Direction.NORTH);
		}
		c.marker("amenity", mid - 1, 1, d / 2, "cornhole");
	}

	/** Fire pit: a lit campfire in a stone ring with four Adirondack chairs facing it. */
	public static void firePit(Canvas c, int x, int y, int z) {
		c.set(x, y - 1, z, Blocks.SMOOTH_STONE);
		c.set(x, y, z, Blocks.CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true)
			.setValue(CampfireBlock.SIGNAL_FIRE, false));
		for (Direction d : Direction.Plane.HORIZONTAL) {
			c.set(x + d.getStepX(), y, z + d.getStepZ(), Blocks.SMOOTH_STONE_SLAB.defaultBlockState().setValue(SlabBlock.TYPE, SlabType.BOTTOM));
			c.put(x + d.getStepX() * 2, y, z + d.getStepZ() * 2, ModBlocks.ADIRONDACK_CHAIR, d.getOpposite());
		}
	}

	/**
	 * Pool deck in a w x d frame: a sunken pool (2 deep below y = 0) with coping, loungers and umbrellas along
	 * both long sides, a hot tub in one corner, an outdoor shower and a lifeguard station.
	 */
	public static void poolDeck(Canvas c, int w, int d, RandomSource r, Block deck) {
		c.fill(0, 0, 0, w - 1, 0, d - 1, deck);
		int px0 = 3;
		int px1 = w - 8;
		int pz0 = 4;
		int pz1 = d - 4;
		if (px1 - px0 < 5 || pz1 - pz0 < 2) {
			px1 = w - 4;
		}
		// basin
		c.fill(px0 - 1, -3, pz0 - 1, px1 + 1, 0, pz1 + 1, ModBlocks.get("pool_tile"));
		c.fill(px0, -2, pz0, px1, 0, pz1, Blocks.WATER);
		c.fill(px0, -3, pz0, px1, -3, pz1, ModBlocks.get("pool_tile_dark"));
		for (int x = px0 - 1; x <= px1 + 1; x++) {
			c.set(x, 0, pz0 - 1, ModBlocks.get("pool_coping"));
			c.set(x, 0, pz1 + 1, ModBlocks.get("pool_coping"));
		}
		for (int z = pz0 - 1; z <= pz1 + 1; z++) {
			c.set(px0 - 1, 0, z, ModBlocks.get("pool_coping"));
			c.set(px1 + 1, 0, z, ModBlocks.get("pool_coping"));
		}
		c.put(px0, 0, pz0, ModBlocks.POOL_LADDER, Direction.SOUTH);
		c.put(px1, 0, pz1, ModBlocks.POOL_LADDER, Direction.NORTH);
		// loungers facing the water on both long sides, umbrellas between pairs
		for (int x = px0; x + 1 <= px1; x += 3) {
			c.twoPart(x, 1, pz0 - 2, ModBlocks.POOL_LOUNGER, Direction.NORTH);
			c.twoPart(x, 1, pz1 + 2, ModBlocks.POOL_LOUNGER, Direction.SOUTH);
			if (x + 1 <= px1) {
				c.put(x + 1, 1, pz0 - 3, ModBlocks.UMBRELLAS.get((x / 3) % ModBlocks.UMBRELLAS.size()), Direction.NORTH);
				c.put(x + 1, 1, pz1 + 3, ModBlocks.UMBRELLAS.get((x / 3 + 1) % ModBlocks.UMBRELLAS.size()), Direction.NORTH);
			}
		}
		// hot tub
		int hx = w - 6;
		int hz = pz0;
		if (hx > px1 + 2) {
			c.fill(hx - 1, -1, hz - 1, hx + 3, 0, hz + 3, ModBlocks.get("pool_tile"));
			c.fill(hx, -1, hz, hx + 2, 0, hz + 2, Blocks.WATER);
			for (int i = 0; i <= 2; i++) {
				c.put(hx + i, 1, hz - 1, ModBlocks.HOT_TUB_JET, Direction.SOUTH);
			}
			c.marker("amenity", hx + 1, 1, hz + 4, "hot tub");
			c.tall(hx + 1, 1, hz + 5, ModBlocks.OUTDOOR_SHOWER, Direction.NORTH);
			c.put(hx + 3, 1, hz + 5, ModBlocks.TOWEL_CART, Direction.WEST);
		}
		c.put(px0 - 2, 1, pz1 + 1, ModBlocks.LIFEBUOY, Direction.EAST);
		c.marker("amenity", (px0 + px1) / 2, 1, pz0 - 2, "pool");
	}

	/**
	 * A row of parking stalls (3 wide, 5 deep) along x in a frame, cars nosing towards -z; every
	 * {@code evEvery}-th stall gets an EV charger, the first is accessible.
	 */
	public static void parkingRow(Canvas c, int stalls, int evEvery, boolean wallAtFront) {
		Block asphalt = ModBlocks.get("asphalt");
		Block line = ModBlocks.get("parking_line");
		for (int i = 0; i < stalls; i++) {
			int x0 = i * 3;
			c.fill(x0, 0, 0, x0 + 2, 0, 4, asphalt);
			for (int z = 0; z < 5; z++) {
				c.put(x0, 0, z, line, Direction.NORTH);
			}
			c.put(x0 + 1, 1, 0, ModBlocks.WHEEL_STOP, Direction.SOUTH);
			if (i == 0) {
				c.put(x0 + 1, 0, 2, ModBlocks.get("parking_accessible"), Direction.SOUTH);
			}
			if (wallAtFront && evEvery > 0 && i % evEvery == evEvery - 1) {
				c.put(x0 + 1, 2, 0, ModBlocks.EV_CHARGER, Direction.SOUTH);
			}
		}
		for (int z = 0; z < 5; z++) {
			c.put(stalls * 3, 0, z, line, Direction.NORTH);
		}
	}
}
