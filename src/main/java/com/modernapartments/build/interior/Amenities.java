package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.registry.ModBlocks;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

/**
 * Shared amenity rooms. Each furnisher works in a room frame: interior x 0..w-1, z 0..d-1, floor at y = 0,
 * ceiling layer at y = h, entrance(s) already cut into the walls. Pieces go through a {@link RoomGrid} so
 * every door and fixture stays reachable whatever the room's proportions.
 */
public final class Amenities {
	private static final Direction N = Direction.NORTH;
	private static final Direction S = Direction.SOUTH;
	private static final Direction E = Direction.EAST;
	private static final Direction W = Direction.WEST;

	private Amenities() {
	}

	// ================================================================================== shell & helpers
	/** Walls around x -1..w / z -1..d (y 1..h), floor, ceiling layer and a cleared interior. */
	public static void shell(Canvas c, int w, int d, int h, Block floor, Block wall, Block ceiling) {
		c.fill(-1, 0, -1, w, 0, d, floor);
		c.walls(-1, 1, -1, w, h, d, wall.defaultBlockState());
		c.clear(0, 1, 0, w - 1, h - 1, d - 1);
		c.fill(0, h, 0, w - 1, h, d - 1, ceiling);
	}

	/** Grid over the room interior with doors detected; {@code theme} picks colours for soft furnishings. */
	public static RoomGrid grid(Canvas c, int w, int d, int h, RandomSource r, InteriorStyle.Theme theme) {
		RoomGrid g = new RoomGrid(c, InteriorStyle.roll(theme, r), 0, 0, w - 1, d - 1, h);
		// anything already standing in the room (fountains, planters, trees) is an obstacle
		for (int x = 0; x < w; x++) {
			for (int z = 0; z < d; z++) {
				net.minecraft.world.level.block.state.BlockState s = c.get(x, 1, z);
				if (s != null && !s.isAir() && !(s.getBlock() instanceof net.minecraft.world.level.block.CarpetBlock)) {
					g.use(x, z);
				}
			}
		}
		g.detectEntrances();
		return g;
	}

	static boolean put(RoomGrid g, int x, int z, Block b, Direction f) {
		return Furnish.placeIfFree(g, new int[] {x, z}, b, f);
	}

	static boolean tall(RoomGrid g, int x, int z, Block b, Direction f) {
		if (!g.free(x, z)) {
			return false;
		}
		RoomGrid.Tx tx = g.begin();
		Furnish.putTall(g, x, z, b, f);
		return g.commitIfConnected(tx);
	}

	/** Two-long piece: foot at (x, z), head one block towards {@code f}. */
	static boolean two(RoomGrid g, int x, int z, Block b, Direction f) {
		int hx = x + f.getStepX();
		int hz = z + f.getStepZ();
		if (!g.free(x, z) || !g.free(hx, hz)) {
			return false;
		}
		RoomGrid.Tx tx = g.begin();
		g.use(x, z);
		g.use(hx, hz);
		g.write(() -> g.c.twoPart(x, 1, z, b, f));
		return g.commitIfConnected(tx);
	}

	static boolean wall(RoomGrid g, int x, int z, Direction side, int y, Block b) {
		return Furnish.wallItem(g, x, z, side, y, b);
	}

	/** Puts {@code b} against every free wall cell of the given side within [from, to] (inclusive). */
	static void row(RoomGrid g, Direction side, int from, int to, Block b, boolean tall, int every) {
		int i = 0;
		for (int[] p : g.side(side)) {
			int k = side.getAxis() == Direction.Axis.Z ? p[0] : p[1];
			if (k < from || k > to) {
				continue;
			}
			if (i++ % every != 0) {
				continue;
			}
			if (g.edge(p[0], p[1], side) == RoomGrid.Edge.WALL) {
				if (tall) {
					tall(g, p[0], p[1], b, side.getOpposite());
				} else {
					put(g, p[0], p[1], b, side.getOpposite());
				}
			}
		}
	}

	/** Room name sign inside, on the entrance wall beside (not on) a door. */
	static void nameSign(Canvas c, int w, String... lines) {
		for (int i = 0; i < w; i++) {
			int x = w / 2 + (i % 2 == 0 ? i / 2 : -(i + 1) / 2);
			if (x < 0 || x >= w) {
				continue;
			}
			boolean ok = true;
			for (int dx = -1; dx <= 1; dx++) {
				net.minecraft.world.level.block.state.BlockState s = c.get(x + dx, 2, -1);
				if (s == null || s.getBlock() instanceof net.minecraft.world.level.block.DoorBlock
					|| (dx == 0 && !s.isCollisionShapeFullBlock(net.minecraft.world.level.EmptyBlockGetter.INSTANCE,
						net.minecraft.core.BlockPos.ZERO))) {
					ok = false;
				}
			}
			if (ok && c.isAirOrUnset(x, 2, 0)) {
				Signage.wayfinding(c, x, 2, 0, S, lines);
				return;
			}
		}
	}

	/** Downlights, smoke detector and corner plants; call last. */
	public static void finish(RoomGrid g, boolean plants) {
		if (plants) {
			for (int[] corner : new int[][] {{0, 0}, {g.x1, 0}, {0, g.z1}, {g.x1, g.z1}}) {
				put(g, corner[0], corner[1], g.style.tallPlant(), N);
			}
		}
		g.flush();
		Furnish.windowsAndSwitches(g);
		Furnish.ceilingLights(g, false);
	}

	/** Seating group: sofa run facing {@code facing}, coffee table and armchairs, on a rug. */
	static boolean lounge(RoomGrid g, int cx, int cz, Direction facing, Block sofa, Block armchair, Block table, Block rug, Block border) {
		Direction right = facing.getClockWise();
		int[][] sofaCells = {{cx - right.getStepX(), cz - right.getStepZ()}, {cx, cz}, {cx + right.getStepX(), cz + right.getStepZ()}};
		for (int[] p : sofaCells) {
			if (!g.free(p[0], p[1])) {
				return false;
			}
		}
		int tx = cx + facing.getStepX() * 2;
		int tz = cz + facing.getStepZ() * 2;
		if (!g.free(tx, tz)) {
			return false;
		}
		RoomGrid.Tx t = g.begin();
		for (int[] p : sofaCells) {
			g.use(p[0], p[1]);
			g.write(() -> g.c.put(p[0], 1, p[1], sofa, facing));
		}
		g.use(tx, tz);
		g.write(() -> g.c.put(tx, 1, tz, table, facing));
		for (int s = -1; s <= 1; s += 2) {
			int ax = tx + right.getStepX() * 2 * s;
			int az = tz + right.getStepZ() * 2 * s;
			if (g.free(ax, az)) {
				g.use(ax, az);
				Direction f = s < 0 ? right : right.getOpposite();
				g.write(() -> g.c.put(ax, 1, az, armchair, f));
			}
		}
		if (!g.commitIfConnected(t)) {
			return false;
		}
		Furnish.tabletop(g, tx, 2, tz, InteriorStyle.pick(g.random, ModBlocks.BOOK_STACK, ModBlocks.FLOWER_VASE, ModBlocks.CANDLE_SET),
			facing, table);
		for (int i = -1; i <= 1; i++) {
			for (int j = 1; j <= 3; j++) {
				int x = cx + right.getStepX() * i + facing.getStepX() * j;
				int z = cz + right.getStepZ() * i + facing.getStepZ() * j;
				boolean edge = Math.abs(i) == 1 || j == 1 || j == 3;
				if (g.walkable(x, z)) {
					Block carpet = edge ? border : rug;
					g.write(() -> {
						if (g.c.isAirOrUnset(x, 1, z)) {
							g.c.set(x, 1, z, carpet);
						}
					});
				}
			}
		}
		return true;
	}

	// ================================================================================== lobby
	/**
	 * Building lobby: a clear walk from the entrance (front wall) to the back, the concierge desk on one
	 * side, seating groups on the other, plants, art and chandeliers.
	 */
	public static void lobby(Canvas c, int w, int d, int h, RandomSource r, InteriorStyle.Theme theme, Block desk, String name,
		String... directory) {
		RoomGrid g = grid(c, w, d, h, r, theme);
		int ax0 = w / 2 - 1;
		int ax1 = w / 2;
		for (int z = 0; z < d; z++) {
			g.keep(ax0, z);
			g.keep(ax1, z);
		}
		// concierge desk facing the walkway, chair behind it
		int dx = Math.max(1, ax0 - 3);
		int dz0 = Math.max(1, d / 2 - 1);
		for (int z = dz0; z < dz0 + 3 && z < d - 1; z++) {
			put(g, dx, z, desk, E);
			put(g, dx - 1, z, z == dz0 + 1 ? ModBlocks.OFFICE_CHAIR : g.style.smallPlant(), E);
		}
		g.flush();
		c.put(dx, 2, dz0, ModBlocks.CONCIERGE_BELL, E);
		c.set(dx, 2, dz0 + 1, com.modernapartments.block.Tabletop.withDrop(Canvas.facing(ModBlocks.DESKTOP_MONITOR, W),
			com.modernapartments.block.Tabletop.dropOnto(Canvas.facing(desk, E))));
		put(g, dx, dz0 + 4, ModBlocks.LUGGAGE_CART, E);
		// seating on the other side
		int sx = Math.min(w - 3, ax1 + 4);
		InteriorStyle st = g.style;
		lounge(g, sx, Math.min(d - 2, d / 2 + 2), N, st.sofaBlock(), st.armchairBlock(), ModBlocks.COFFEE_TABLE_MARBLE, st.rug, st.rugBorder);
		if (d >= 14) {
			lounge(g, sx, Math.max(2, d / 2 - 4), S, ModBlocks.LOUNGE_CHAIR_COGNAC, st.armchairBlock(), ModBlocks.GLASS_COFFEE_TABLE,
				st.rug, st.rugBorder);
		}
		if (w >= 16) {
			lounge(g, 2, d - 2, N, ModBlocks.LOBBY_BENCH, st.armchairBlock(), ModBlocks.SIDE_TABLE_WOOD, st.rug, st.rugBorder);
		}
		// art and lighting
		for (int z = 2; z < d - 1; z += 4) {
			wall(g, 0, z, W, Math.min(3, h - 1), ModBlocks.WIDE_ART.get(r.nextInt(ModBlocks.WIDE_ART.size())));
			wall(g, w - 1, z, E, Math.min(3, h - 1), ModBlocks.ART.get(r.nextInt(ModBlocks.ART.size())));
		}
		g.flush();
		for (int z = 2; z < d - 1; z += 5) {
			c.set(ax0, h, z, h >= 6 ? ModBlocks.CHANDELIER : st.pendant);
		}
		finish(g, true);
		Signage.wayfinding(c, Math.max(0, ax0 - 1), 3, d - 1, N, name, "Welcome Home", "Elevators ahead", "Mail & Packages");
		// building directory: four lines per sign, on the back wall right of the walkway (left if there is no room)
		int sign = 0;
		for (int i = 0; i < w && sign * 4 < directory.length; i++) {
			int x = ax1 + 1 + i < w ? ax1 + 1 + i : ax0 - 1 - (i - (w - ax1 - 1));
			if (x < 0 || x >= w || g.edge(x, d - 1, S) != RoomGrid.Edge.WALL || !g.decorFree(x, d - 1, S) || !c.isAirOrUnset(x, 2, d - 1)) {
				continue;
			}
			g.useDecor(x, d - 1, S);
			Signage.wayfinding(c, x, 2, d - 1, N, java.util.Arrays.copyOfRange(directory, sign * 4, Math.min(directory.length, sign * 4 + 4)));
			sign++;
		}
	}

	// ================================================================================== mail & packages
	/** Mailbox banks along the first solid wall (the back wall unless it is glass), parcel lockers and shelves on the next. */
	public static void mailRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		List<Direction> walls = new java.util.ArrayList<>();
		for (Direction side : new Direction[] {S, W, E, N}) {
			int solid = 0;
			for (int[] p : g.side(side)) {
				if (g.edge(p[0], p[1], side) == RoomGrid.Edge.WALL) {
					solid++;
				}
			}
			if (solid >= 3) {
				walls.add(side);
			}
		}
		if (!walls.isEmpty()) {
			mailboxWall(g, walls.get(0), h);
		}
		for (int i = 1; i < Math.min(3, walls.size()); i++) {
			Direction side = walls.get(i);
			int length = side.getAxis() == Direction.Axis.Z ? w : d;
			row(g, side, 1, length - 2, i == 1 ? ModBlocks.PARCEL_LOCKER : ModBlocks.PACKAGE_SHELF, i == 1, 1);
		}
		put(g, w / 2, d / 2, ModBlocks.SIDE_TABLE, N);
		put(g, 0, 0, ModBlocks.RECYCLING_BIN, S);
		put(g, w - 1, 0, ModBlocks.TRASH_BIN, S);
		g.flush();
		nameSign(c, w, "MAIL & PACKAGES", "Parcel lockers", "open 24/7");
		finish(g, false);
	}

	/** Mailbox banks stacked two or three high on every free solid cell of one wall. */
	private static void mailboxWall(RoomGrid g, Direction side, int h) {
		Direction facing = side.getOpposite();
		for (int[] p : g.side(side)) {
			if (g.edge(p[0], p[1], side) != RoomGrid.Edge.WALL || !g.free(p[0], p[1])) {
				continue;
			}
			int x = p[0];
			int z = p[1];
			RoomGrid.Tx tx = g.begin();
			g.use(x, z);
			if (!g.commitIfConnected(tx)) {
				continue;
			}
			g.useDecor(x, z, side);
			g.write(() -> {
				for (int y = 1; y <= (h >= 4 ? 3 : 2); y++) {
					g.c.put(x, y, z, ModBlocks.MAILBOX_BANK, facing);
				}
			});
		}
	}

	// ================================================================================== fitness
	/** Fitness centre: cardio facing the windows (back wall), weights, a yoga corner and a mirror wall. */
	public static void fitness(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		// cardio row: treadmills (two long, facing the back windows) then bikes
		int x = 1;
		for (; x < w - 1 && x < w / 2 + 2; x += 2) {
			two(g, x, d - 3, ModBlocks.TREADMILL, S);
		}
		for (; x < w - 1; x += 2) {
			put(g, x, d - 2, ModBlocks.EXERCISE_BIKE, S);
		}
		// weights along the left wall
		tall(g, 1, 1, ModBlocks.SQUAT_RACK, E);
		put(g, 0, 3, ModBlocks.DUMBBELL_RACK, E);
		put(g, 0, 4, ModBlocks.DUMBBELL_RACK, E);
		put(g, 2, 4, ModBlocks.WEIGHT_BENCH, N);
		put(g, 0, 5, ModBlocks.KETTLEBELLS, E);
		// yoga corner on the right
		for (int z = 1; z < Math.min(d - 4, 5); z++) {
			Block mat = ModBlocks.YOGA_MATS.get((z + w) % ModBlocks.YOGA_MATS.size());
			put(g, w - 2, z, mat, N);
		}
		put(g, w - 1, 1, ModBlocks.ROLLED_YOGA_MAT, W);
		g.flush();
		if (h >= 4) {
			c.set(w / 2, h, 2, ModBlocks.PUNCHING_BAG);
		}
		// mirror wall (left), water cooler, towels and a TV on the entrance wall
		for (int z = 1; z < d - 1; z += 1) {
			wall(g, 0, z, W, 2, ModBlocks.GYM_MIRROR);
		}
		put(g, w - 1, d / 2, ModBlocks.WATER_COOLER, W);
		put(g, w - 1, d / 2 + 1, ModBlocks.TOWEL_CART, W);
		wall(g, w / 2 - 2, 0, N, 2, ModBlocks.WALL_TV);
		wall(g, w / 2 + 2, 0, N, 2, ModBlocks.WALL_CLOCK);
		g.flush();
		nameSign(c, w, "FITNESS CENTER", "Wipe down equipment", "after each use");
		finish(g, false);
	}

	/** Boxing gym: a roped ring at the back, heavy bags on chains, weights, mirrors and lockers. */
	public static void boxingGym(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.INDUSTRIAL);
		int size = Math.min(7, Math.min(w - 4, d - 5));
		if (size >= 5) {
			int rx0 = (w - size) / 2;
			int rz0 = d - 2 - size;
			int rx1 = rx0 + size - 1;
			int rz1 = rz0 + size - 1;
			int gate = rx0 + size / 2;
			boolean free = true;
			for (int x = rx0; x <= rx1; x++) {
				for (int z = rz0; z <= rz1; z++) {
					free &= g.free(x, z);
				}
			}
			RoomGrid.Tx tx = g.begin();
			if (free) {
				// corner posts and ropes all round, with a gap at the front to climb in
				for (int x = rx0; x <= rx1; x++) {
					for (int z = rz0; z <= rz1; z++) {
						boolean edge = x == rx0 || x == rx1 || z == rz0 || z == rz1;
						if (edge && !(z == rz0 && (x == gate || x == gate - 1))) {
							g.use(x, z);
						} else {
							g.keep(x, z);
						}
					}
				}
			}
			if (free && g.commitIfConnected(tx)) {
				for (int x = rx0; x <= rx1; x++) {
					for (int z = rz0; z <= rz1; z++) {
						boolean cornerX = x == rx0 || x == rx1;
						boolean cornerZ = z == rz0 || z == rz1;
						boolean opening = z == rz0 && (x == gate || x == gate - 1);
						if (cornerX && cornerZ) {
							c.set(x, 1, z, (x + z) % 2 == 0 ? Blocks.RED_CONCRETE : Blocks.BLUE_CONCRETE);
						} else if ((cornerX || cornerZ) && !opening) {
							c.set(x, 1, z, ModBlocks.METAL_RAILING);
						} else {
							c.set(x, 1, z, cornerX || cornerZ ? Blocks.WHITE_CARPET : Blocks.BLUE_CARPET);
						}
					}
				}
			} else if (!free) {
				tx.rollback();
			}
		}
		// heavy bags hang from the ceiling on chains along the left wall
		for (int z = 2; z < d - 2; z += 3) {
			if (g.free(1, z)) {
				RoomGrid.Tx tx = g.begin();
				g.use(1, z);
				if (g.commitIfConnected(tx)) {
					int bz = z;
					g.write(() -> {
						for (int y = 4; y < h; y++) {
							c.set(1, y, bz, Blocks.IRON_CHAIN);
						}
						c.set(1, 3, bz, ModBlocks.PUNCHING_BAG);
					});
				}
			}
		}
		// weights and mirrors on the right wall, lockers by the door
		put(g, w - 1, 1, ModBlocks.DUMBBELL_RACK, W);
		put(g, w - 1, 2, ModBlocks.DUMBBELL_RACK, W);
		put(g, w - 1, 3, ModBlocks.KETTLEBELLS, W);
		put(g, w - 3, 2, ModBlocks.WEIGHT_BENCH, N);
		for (int z = 5; z < d - 1; z++) {
			wall(g, w - 1, z, E, 2, ModBlocks.GYM_MIRROR);
		}
		for (int x = 0; x < w; x++) {
			if (Math.abs(x - w / 2) > 1 && x < w - 1) {
				tall(g, x, 0, ModBlocks.LOCKER, S);
			}
		}
		put(g, w - 1, d - 1, ModBlocks.WATER_COOLER, W);
		put(g, w - 2, d - 1, ModBlocks.TOWEL_CART, N);
		g.flush();
		nameSign(c, w, "BOXING GYM", "Gloves & wraps", "at the front desk");
		finish(g, false);
	}

	// ================================================================================== pets
	public static void dogSpa(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		int stations = Math.max(1, Math.min(3, (w - 1) / 3));
		for (int i = 0; i < stations; i++) {
			int x = 1 + i * 3;
			if (put(g, x, d - 1, ModBlocks.DOG_WASH_TUB, N)) {
				put(g, x + 1, d - 1, ModBlocks.DOG_RAMP, W);
				g.flush();
				c.put(x, 3 <= h - 1 ? 3 : 2, d - 1, ModBlocks.PET_SPRAYER, N);
			}
		}
		put(g, w - 1, 1, ModBlocks.GROOMING_TABLE, W);
		wall(g, w - 1, 2, E, 2, ModBlocks.GROOMING_SUPPLIES);
		put(g, 0, 1, ModBlocks.PAW_STATION, E);
		if (put(g, 0, 2, ModBlocks.kitchen(ModBlocks.KitchenStyle.WHITE, ModBlocks.KitchenPart.CABINET), E)) {
			Furnish.tabletop(g, 0, 2, 2, ModBlocks.TREAT_JAR, E, ModBlocks.kitchen(ModBlocks.KitchenStyle.WHITE, ModBlocks.KitchenPart.CABINET));
		}
		put(g, 0, 3, ModBlocks.TOWEL_STACK, E);
		g.flush();
		nameSign(c, w, "DOG SPA", "Wash, groom", "& treat!");
		finish(g, false);
	}

	// ================================================================================== social
	/** Resident club lounge: catering kitchen with island, fireplace seating, dining and a pool table. */
	public static void clubLounge(Canvas c, int w, int d, int h, RandomSource r, InteriorStyle.Theme theme) {
		RoomGrid g = grid(c, w, d, h, r, theme);
		InteriorStyle st = g.style;
		// catering kitchen along the left wall
		List<int[]> left = g.side(W);
		List<int[]> run = Furnish.kitchenRun(g, W, left.subList(0, Math.min(left.size(), 6)));
		if (run.size() >= 4) {
			Furnish.island(g, W, run, Math.min(3, run.size() - 2));
		}
		// fireplace + TV on the right wall with a seating group facing it
		int tvZ = d / 2;
		if (g.free(w - 1, tvZ) && g.edge(w - 1, tvZ, E) == RoomGrid.Edge.WALL) {
			RoomGrid.Tx t = g.begin();
			g.use(w - 1, tvZ);
			g.keep(w - 2, tvZ);
			if (g.commitIfConnected(t)) {
				g.write(() -> {
					c.set(w - 1, 1, tvZ, Canvas.facing(ModBlocks.ELECTRIC_FIREPLACE, W).setValue(com.modernapartments.block.ModProperties.ON, true));
					c.put(w - 1, 2, tvZ, ModBlocks.WALL_TV, W);
				});
				g.useDecor(w - 1, tvZ, E);
			}
		}
		lounge(g, Math.max(2, w - 5), tvZ, E, st.sofaBlock(), st.armchairBlock(), st.coffeeTable, st.rug, st.rugBorder);
		// pool table or dining in the middle
		if (w >= 12 && d >= 10) {
			two(g, w / 2, d - 4, ModBlocks.POOL_TABLE, N);
		}
		Furnish.dining(g, new Furnish.Zone(w / 2 - 2, 1, w / 2 + 2, Math.min(d - 6, 4)), 3);
		tall(g, w - 1, 0, st.bookcase, W);
		tall(g, w - 1, d - 1, st.bookcase, W);
		finish(g, true);
		nameSign(c, w, "RESIDENT LOUNGE", "Reserve for parties", "at the front desk");
	}

	// ================================================================================== long lounges
	/** What fills one bay of a {@link #wideLounge}. */
	public enum Bay { BAR, FIRESIDE, VIEW, DINING, CAFE, GAME, LIBRARY }

	/**
	 * Long lounge (sky lounges, roof clubs) split into bays of about eight blocks along x, each furnished as its
	 * own zone from {@code menu} in turn. Bays holding a door get armchairs along the glass instead, so the way
	 * in stays open. The inner wall is z = -1 and the view side z = d.
	 */
	public static void wideLounge(Canvas c, int w, int d, int h, RandomSource r, InteriorStyle.Theme theme, String[] sign,
		Bay... menu) {
		RoomGrid g = grid(c, w, d, h, r, theme);
		List<Integer> doors = new java.util.ArrayList<>();
		for (int[] e : g.entrances()) {
			doors.add(e[0]);
			Direction in = inward(g, e);
			for (int k = 1; k <= 2 && in != null; k++) {
				g.keep(e[0] + in.getStepX() * k, e[1] + in.getStepZ() * k);
			}
		}
		int bays = Math.max(1, Math.round(w / 8f));
		int next = 0;
		for (int i = 0; i < bays; i++) {
			int bx0 = i * w / bays;
			int bx1 = (i + 1) * w / bays - 1;
			if (menu.length == 0 || doors.stream().anyMatch(x -> x >= bx0 && x <= bx1)) {
				windowSeats(g, bx0, bx1, doors);
			} else {
				switch (menu[next++ % menu.length]) {
					case BAR -> bar(g, bx0, bx1);
					case FIRESIDE -> fireside(g, bx0, bx1);
					case VIEW -> viewLounge(g, bx0, bx1);
					case DINING -> diningBay(g, bx0, bx1);
					case CAFE -> cafe(g, bx0, bx1);
					case GAME -> games(g, bx0, bx1);
					case LIBRARY -> library(g, bx0, bx1);
				}
			}
			if (i < bays - 1) {
				put(g, bx1, g.z1, g.style.tallPlant(), N);
			}
			g.flush();
		}
		finish(g, true);
		nameSign(c, w, sign);
	}

	private static Direction inward(RoomGrid g, int[] e) {
		for (Direction side : new Direction[] {N, E, S, W}) {
			if (!g.in(e[0] + side.getStepX(), e[1] + side.getStepZ()) && g.edge(e[0], e[1], side) == RoomGrid.Edge.DOOR) {
				return side.getOpposite();
			}
		}
		return null;
	}

	/** Lounge chairs and side tables facing the glass, clear of the doors, under a chandelier. */
	private static void windowSeats(RoomGrid g, int bx0, int bx1, List<Integer> doors) {
		int z = g.z1 - 1;
		boolean chair = true;
		for (int x = bx0 + 1; x < bx1; x++) {
			int fx = x;
			if (doors.stream().anyMatch(dx -> Math.abs(dx - fx) <= 1)) {
				chair = true;
				continue;
			}
			if (chair) {
				put(g, x, z, ModBlocks.LOUNGE_CHAIR_COGNAC, S);
			} else if (put(g, x, z, ModBlocks.SIDE_TABLE, S)) {
				Furnish.tabletop(g, x, 2, z, InteriorStyle.pick(g.random, ModBlocks.TABLE_LAMP_BRASS, ModBlocks.FLOWER_VASE,
					ModBlocks.BOOK_STACK), S, ModBlocks.SIDE_TABLE);
			}
			chair = !chair;
		}
		int cx = (bx0 + bx1) / 2;
		int cz = g.z1 / 2;
		if (g.h >= 5) {
			int y = g.ceiling(cx, cz);
			g.write(() -> g.c.set(cx, y, cz, ModBlocks.CHANDELIER));
		}
	}

	/** Two armchairs and a side table looking out of the window. */
	private static void windowPair(RoomGrid g, int cx, int z) {
		if (put(g, cx, z, ModBlocks.SIDE_TABLE_WOOD, S)) {
			Furnish.tabletop(g, cx, 2, z, InteriorStyle.pick(g.random, ModBlocks.BOOK_STACK, ModBlocks.FLOWER_VASE, ModBlocks.CANDLE_SET),
				S, ModBlocks.SIDE_TABLE_WOOD);
			put(g, cx - 1, z, g.style.armchairBlock(), S);
			put(g, cx + 1, z, g.style.armchairBlock(), S);
		}
	}

	/** Back bar on the inner wall, a counter two blocks out with stools along it and pendants above. */
	private static void bar(RoomGrid g, int bx0, int bx1) {
		InteriorStyle st = g.style;
		int x0 = bx0 + 1;
		int x1 = bx1 - 1;
		if (x1 - x0 < 3 || g.z1 < 6) {
			cafe(g, bx0, bx1);
			return;
		}
		RoomGrid.Tx tx = g.begin();
		for (int x = x0; x <= x1; x++) {
			RoomGrid.Edge e = g.edge(x, 0, N);
			if (!g.free(x, 0) || !g.free(x, 1) || !g.free(x, 2) || (e != RoomGrid.Edge.WALL && e != RoomGrid.Edge.WINDOW)) {
				tx.rollback();
				cafe(g, bx0, bx1);
				return;
			}
			g.use(x, 0);
			g.keep(x, 1);
			g.use(x, 2);
		}
		g.keep(bx0, 1);
		g.keep(bx1, 1);
		List<int[]> stools = new java.util.ArrayList<>();
		for (int x = x0; x <= x1; x++) {
			if (g.free(x, 3)) {
				g.use(x, 3);
				g.keep(x, 4);
				stools.add(new int[] {x, 3});
			}
		}
		if (!g.commitIfConnected(tx)) {
			cafe(g, bx0, bx1);
			return;
		}
		int n = x1 - x0 + 1;
		Block counter = ModBlocks.kitchen(st.kitchen, ModBlocks.KitchenPart.DRAWERS);
		for (int i = 0; i < n; i++) {
			int x = x0 + i;
			Block back = i == 0 || i == n - 1 ? ModBlocks.MINI_FRIDGE
				: i == n / 2 ? ModBlocks.kitchen(st.kitchen, ModBlocks.KitchenPart.SINK)
				: ModBlocks.kitchen(st.kitchen, i % 2 == 0 ? ModBlocks.KitchenPart.CABINET : ModBlocks.KitchenPart.DRAWERS);
			g.write(() -> {
				g.c.put(x, 1, 0, back, S);
				g.c.put(x, 1, 2, counter, N);
			});
			if (back != ModBlocks.MINI_FRIDGE && i != n / 2 && g.random.nextInt(3) < 2) {
				Furnish.tabletop(g, x, 2, 0, InteriorStyle.pick(g.random, ModBlocks.ESPRESSO_MACHINE, ModBlocks.COFFEE_MAKER,
					ModBlocks.FRUIT_BOWL, ModBlocks.FLOWER_VASE), S, back);
			}
			if (g.edge(x, 0, N) == RoomGrid.Edge.WALL && g.ceiling(x, 0) >= 4) {
				g.useDecor(x, 0, N);
				Block upper = i % 2 == 0 ? ModBlocks.kitchen(st.kitchen, ModBlocks.KitchenPart.UPPER) : ModBlocks.WALL_SHELF;
				g.write(() -> g.c.put(x, 3, 0, upper, S));
			}
			if (i % 3 == 1) {
				Furnish.tabletop(g, x, 2, 2, InteriorStyle.pick(g.random, ModBlocks.CANDLE_SET, ModBlocks.FLOWER_VASE), N, counter);
			}
			int y = g.ceiling(x, 2);
			if (i % 2 == 0 && y >= 3) {
				g.write(() -> g.c.set(x, y, 2, st.pendant));
			}
		}
		for (int[] p : stools) {
			g.write(() -> g.c.put(p[0], 1, p[1], st.barStool, N));
		}
		if (g.z1 >= 9) {
			cafe(g, bx0, bx1, 6);
		}
	}

	/** Two-seat tables in a loose grid. */
	private static void cafe(RoomGrid g, int bx0, int bx1) {
		cafe(g, bx0, bx1, 1);
	}

	/** Tables in rows z0..z1-1, two rows when the room is deep enough. */
	private static void cafe(RoomGrid g, int bx0, int bx1, int z0) {
		int depth = g.z1 - z0;
		List<int[]> rows = new java.util.ArrayList<>();
		if (depth >= 8) {
			int mid = z0 + depth / 2;
			rows.add(new int[] {z0, mid - 1});
			rows.add(new int[] {mid + 1, g.z1 - 1});
		} else if (depth >= 3) {
			rows.add(new int[] {z0, g.z1 - 1});
		}
		for (int x = bx0 + 1; x + 2 <= bx1; x += 4) {
			for (int[] row : rows) {
				Furnish.dining(g, new Furnish.Zone(x, row[0], x + 2, row[1]), 1);
			}
		}
	}

	/** Fireplace with a TV above on the inner wall, bookcases either side and a sofa group facing it. */
	private static void fireside(RoomGrid g, int bx0, int bx1) {
		InteriorStyle st = g.style;
		int cx = (bx0 + bx1) / 2;
		if (!g.free(cx, 0) || g.edge(cx, 0, N) != RoomGrid.Edge.WALL) {
			viewLounge(g, bx0, bx1);
			return;
		}
		RoomGrid.Tx t = g.begin();
		g.use(cx, 0);
		g.keep(cx, 1);
		if (g.commitIfConnected(t)) {
			g.useDecor(cx, 0, N);
			g.write(() -> {
				g.c.set(cx, 1, 0, Canvas.facing(ModBlocks.ELECTRIC_FIREPLACE, S).setValue(com.modernapartments.block.ModProperties.ON, true));
				g.c.put(cx, 2, 0, ModBlocks.WALL_TV, S);
			});
		}
		tall(g, cx - 2, 0, st.bookcase, S);
		tall(g, cx + 2, 0, st.bookcase, S);
		int sz = Math.min(4, g.z1 - 3);
		if (lounge(g, cx, sz, N, st.sofaBlock(), st.armchairBlock(), st.coffeeTable, st.rug, st.rugBorder)) {
			put(g, cx - 2, sz, ModBlocks.FLOOR_LAMP, N);
			if (put(g, cx + 2, sz, ModBlocks.SIDE_TABLE_WOOD, N)) {
				Furnish.tabletop(g, cx + 2, 2, sz, ModBlocks.TABLE_LAMP_CERAMIC, N, ModBlocks.SIDE_TABLE_WOOD);
			}
		}
		if (g.z1 >= 10) {
			windowPair(g, cx, g.z1 - 1);
		}
	}

	/** Sofa group facing the windows, with a console and art on the wall behind it. */
	private static void viewLounge(RoomGrid g, int bx0, int bx1) {
		InteriorStyle st = g.style;
		int cx = (bx0 + bx1) / 2;
		int sz = Math.max(1, g.z1 - 6);
		if (lounge(g, cx, sz, S, st.sofaBlock(), st.armchairBlock(), ModBlocks.GLASS_COFFEE_TABLE, st.rug, st.rugBorder)) {
			put(g, cx - 2, sz, ModBlocks.FLOOR_LAMP_BLACK, S);
			put(g, cx + 2, sz, st.smallPlant(), S);
		}
		if (sz >= 3) {
			for (int x = cx - 1; x <= cx + 1; x += 2) {
				if (g.edge(x, 0, N) == RoomGrid.Edge.WALL && put(g, x, 0, ModBlocks.SIDE_TABLE_WOOD, S)) {
					Furnish.tabletop(g, x, 2, 0, ModBlocks.TABLE_LAMP_BRASS, S, ModBlocks.SIDE_TABLE_WOOD);
				}
			}
		}
		wall(g, cx, 0, N, Math.min(3, g.h - 1), ModBlocks.WIDE_ART.get(g.random.nextInt(ModBlocks.WIDE_ART.size())));
	}

	/** Dining table under a chandelier with a sideboard and art on the inner wall. */
	private static void diningBay(RoomGrid g, int bx0, int bx1) {
		Furnish.dining(g, new Furnish.Zone(bx0 + 1, 2, bx1 - 1, g.z1 - 2), 3);
		int cx = (bx0 + bx1) / 2;
		Block board = ModBlocks.MEDIA_CONSOLES.get(ModBlocks.Wood.WALNUT);
		if (g.edge(cx, 0, N) == RoomGrid.Edge.WALL && put(g, cx, 0, board, S)) {
			Furnish.tabletop(g, cx, 2, 0, InteriorStyle.pick(g.random, ModBlocks.FRUIT_BOWL, ModBlocks.CANDLE_SET, ModBlocks.VASE), S, board);
			if (g.h >= 4) {
				wall(g, cx, 0, N, 3, ModBlocks.WIDE_ART.get(g.random.nextInt(ModBlocks.WIDE_ART.size())));
			}
		}
	}

	/** Pool table with room to play, a dartboard and stools along the wall. */
	private static void games(RoomGrid g, int bx0, int bx1) {
		int cx = (bx0 + bx1) / 2;
		int z = Math.max(3, g.z1 / 2);
		if (two(g, cx - 1, z, ModBlocks.POOL_TABLE, E)) {
			for (int x = cx - 2; x <= cx + 1; x++) {
				g.keep(x, z - 1);
				g.keep(x, z + 1);
			}
			g.keep(cx - 2, z);
			g.keep(cx + 1, z);
		}
		wall(g, bx0 + 1, 0, N, 2, ModBlocks.DARTBOARD);
		for (int x = cx; x <= cx + 2; x++) {
			put(g, x, 0, g.style.barStool, S);
		}
		wall(g, cx + 1, 0, N, Math.min(3, g.h - 1), ModBlocks.WALL_CLOCK);
		tall(g, bx1 - 1, 0, ModBlocks.ARCADE_MACHINE, S);
	}

	/** Bookcases along the inner wall, reading chairs round a table under a floor lamp. */
	private static void library(RoomGrid g, int bx0, int bx1) {
		InteriorStyle st = g.style;
		for (int x = bx0 + 1; x < bx1; x++) {
			if (g.edge(x, 0, N) == RoomGrid.Edge.WALL) {
				tall(g, x, 0, st.bookcase, S);
			}
		}
		int cx = (bx0 + bx1) / 2;
		int z = Math.max(3, g.z1 / 2);
		if (put(g, cx, z, ModBlocks.COFFEE_TABLE_WALNUT, N)) {
			Furnish.tabletop(g, cx, 2, z, ModBlocks.BOOK_STACK, N, ModBlocks.COFFEE_TABLE_WALNUT);
			put(g, cx - 1, z, st.armchairBlock(), E);
			put(g, cx + 1, z, st.armchairBlock(), W);
			put(g, cx - 2, z, ModBlocks.FLOOR_LAMP, E);
		}
		if (g.z1 >= 10) {
			windowPair(g, cx, g.z1 - 1);
		}
	}

	public static void gameRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		two(g, w / 2 - 2, d / 2, ModBlocks.POOL_TABLE, N);
		if (w >= 10) {
			two(g, w / 2 + 2, d / 2, ModBlocks.PING_PONG_TABLE, N);
		}
		for (int x = 1; x < w - 1 && x < 6; x++) {
			tall(g, x, d - 1, ModBlocks.ARCADE_MACHINE, N);
		}
		wall(g, w - 1, 2, E, 2, ModBlocks.DARTBOARD);
		tall(g, 0, 1, ModBlocks.VENDING_MACHINE, E);
		put(g, 0, 2, ModBlocks.MINI_FRIDGE, E);
		// couch + console corner
		if (wall(g, w - 1, d - 3, E, 2, ModBlocks.WALL_TV)) {
			put(g, w - 4, d - 3, ModBlocks.SOFAS.get(ModBlocks.SofaColor.CHARCOAL), E);
			put(g, w - 4, d - 2, ModBlocks.SOFAS.get(ModBlocks.SofaColor.CHARCOAL), E);
			put(g, w - 1, d - 2, ModBlocks.MEDIA_CONSOLES.get(ModBlocks.Wood.CHARCOAL), W);
			g.flush();
			Furnish.tabletop(g, w - 1, 2, d - 2, ModBlocks.GAME_CONSOLE, W, ModBlocks.MEDIA_CONSOLES.get(ModBlocks.Wood.CHARCOAL));
			put(g, w - 3, 1, ModBlocks.BEAN_BAG, E);
		}
		finish(g, false);
		nameSign(c, w, "GAME ROOM", "Billiards, ping pong", "& arcade");
	}

	/** Co-working: desk rows with monitors, a glass-walled meeting table, printer and coffee bar. */
	public static void cowork(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		// meeting table at the back
		int mz = d - 3;
		for (int x = w / 2 - 1; x <= w / 2 + 1; x++) {
			put(g, x, mz, ModBlocks.CONFERENCE_TABLE, N);
		}
		for (int x = w / 2 - 1; x <= w / 2 + 1; x++) {
			put(g, x, mz - 1, ModBlocks.OFFICE_CHAIR, S);
			put(g, x, mz + 1, ModBlocks.OFFICE_CHAIR, N);
		}
		wall(g, w / 2, d - 1, S, 2, ModBlocks.WHITEBOARD);
		// desk rows along the side walls
		for (int z = 1; z < d - 4; z += 2) {
			for (int[] p : new int[][] {{0, z}, {w - 1, z}}) {
				Direction toWall = p[0] == 0 ? W : E;
				Block desk = p[0] == 0 ? ModBlocks.DESK_WALNUT : ModBlocks.DESK_WHITE;
				if (put(g, p[0], p[1], desk, toWall.getOpposite())) {
					int cx = p[0] - toWall.getStepX();
					put(g, cx, p[1], ModBlocks.OFFICE_CHAIR, toWall);
					g.flush();
					Furnish.tabletop(g, p[0], 2, p[1], z % 4 == 1 ? ModBlocks.DESKTOP_MONITOR : ModBlocks.LAPTOP, toWall.getOpposite(), desk);
				}
			}
		}
		// printer and coffee by the entrance
		if (put(g, 1, 0, ModBlocks.kitchen(ModBlocks.KitchenStyle.CHARCOAL, ModBlocks.KitchenPart.CABINET), S)) {
			Furnish.tabletop(g, 1, 2, 0, ModBlocks.ESPRESSO_MACHINE, S, ModBlocks.kitchen(ModBlocks.KitchenStyle.CHARCOAL, ModBlocks.KitchenPart.CABINET));
		}
		if (put(g, w - 2, 0, ModBlocks.SIDE_TABLE, S)) {
			Furnish.tabletop(g, w - 2, 2, 0, ModBlocks.PRINTER, S, ModBlocks.SIDE_TABLE);
		}
		put(g, w - 1, 0, ModBlocks.RECYCLING_BIN, S);
		finish(g, true);
		nameSign(c, w, "CO-WORKING", "Wi-Fi: Residents", "Quiet please");
	}

	public static void laundryRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.MODERN);
		boolean dryer = false;
		for (int[] p : g.side(S)) {
			if (g.edge(p[0], p[1], S) == RoomGrid.Edge.WALL) {
				put(g, p[0], p[1], dryer ? ModBlocks.DRYER : ModBlocks.WASHING_MACHINE, N);
				dryer = !dryer;
			}
		}
		for (int[] p : g.side(W)) {
			if (p[1] > 0 && p[1] < d - 1 && g.edge(p[0], p[1], W) == RoomGrid.Edge.WALL) {
				put(g, p[0], p[1], p[1] % 2 == 0 ? ModBlocks.DRYER : ModBlocks.WASHING_MACHINE, E);
			}
		}
		for (int x = w / 2 - 1; x <= w / 2; x++) {
			put(g, x, d / 2 - 1, ModBlocks.CONFERENCE_TABLE, N);
		}
		put(g, w / 2 + 1, d / 2 - 1, ModBlocks.LAUNDRY_BASKET, N);
		tall(g, w - 1, 1, ModBlocks.VENDING_MACHINE, W);
		put(g, w - 1, 2, ModBlocks.LAUNDRY_BASKET, W);
		wall(g, w - 1, d / 2, E, 2, ModBlocks.WALL_CLOCK);
		finish(g, false);
		nameSign(c, w, "LAUNDRY", "Open 6am - 11pm", "Card operated");
	}

	public static void bikeRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.INDUSTRIAL);
		for (int z = 1; z < d - 1; z += 3) {
			for (int x = 1; x < w - 1; x++) {
				put(g, x, z, ModBlocks.BIKE_RACK, E);
			}
		}
		wall(g, 0, d - 1, W, 2, ModBlocks.WHITEBOARD);
		finish(g, false);
		nameSign(c, w, "BIKE STORAGE", "Racks are first come,", "first served");
	}

	public static void storageRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.INDUSTRIAL);
		row(g, W, 0, d - 1, ModBlocks.LOCKER, true, 1);
		row(g, E, 0, d - 1, ModBlocks.LOCKER, true, 1);
		row(g, S, 0, w - 1, ModBlocks.LOCKER, true, 1);
		finish(g, false);
		nameSign(c, w, "RESIDENT STORAGE", "Lockers by unit", "number");
	}

	public static void leasing(Canvas c, int w, int d, int h, RandomSource r, InteriorStyle.Theme theme) {
		RoomGrid g = grid(c, w, d, h, r, theme);
		InteriorStyle st = g.style;
		for (int i = 0; i < Math.min(4, (w - 1) / 3); i++) {
			int x = 1 + i * 3;
			if (put(g, x, d - 2, st.desk, N)) {
				put(g, x, d - 1, ModBlocks.OFFICE_CHAIR, N);
				put(g, x, d - 3, st.chairBlock(), S);
				g.flush();
				Furnish.tabletop(g, x, 2, d - 2, ModBlocks.DESKTOP_MONITOR, S, st.desk);
			}
		}
		// waiting lounge beside the walkway from the door, and a table for signing leases in wide offices
		for (int[] a : new int[][] {{w / 2 + 4, 1}, {w / 2 - 4, 1}, {w / 2, d / 2 - 1}}) {
			if (lounge(g, a[0], a[1], S, st.sofaBlock(), st.armchairBlock(), st.coffeeTable, st.rug, st.rugBorder)) {
				break;
			}
		}
		if (w >= 16) {
			Furnish.dining(g, new Furnish.Zone(w / 2 + 2, d / 2 - 1, w - 2, d - 4), 2);
		}
		if (put(g, w - 1, 1, ModBlocks.kitchen(st.kitchen, ModBlocks.KitchenPart.CABINET), W)) {
			Furnish.tabletop(g, w - 1, 2, 1, ModBlocks.COFFEE_MAKER, W, ModBlocks.kitchen(st.kitchen, ModBlocks.KitchenPart.CABINET));
		}
		wall(g, 0, d / 2, W, 2, ModBlocks.WIDE_ART.get(r.nextInt(ModBlocks.WIDE_ART.size())));
		finish(g, true);
		nameSign(c, w, "LEASING OFFICE", "Tours daily", "9am - 6pm");
	}

	/** Kids' playroom: soft floor, bean bags, a slide, low tables, books and a TV. */
	public static void kidsRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.FAMILY);
		InteriorStyle st = g.style;
		Block[] carpets = {Blocks.LIGHT_BLUE_CARPET, Blocks.YELLOW_CARPET, Blocks.LIME_CARPET, Blocks.PINK_CARPET};
		for (int x = 1; x < w - 1; x++) {
			for (int z = 1; z < d - 1; z++) {
				if (g.free(x, z)) {
					c.set(x, 1, z, carpets[(x / 2 + z / 2) % carpets.length]);
				}
			}
		}
		put(g, 1, 1, ModBlocks.BEAN_BAG, S);
		put(g, 2, 1, ModBlocks.BEAN_BAG, S);
		put(g, w / 2, d / 2, ModBlocks.COFFEE_TABLE_OAK, N);
		put(g, w / 2 - 1, d / 2, ModBlocks.DINING_CHAIRS.get(ModBlocks.ChairStyle.WHITE), E);
		put(g, w / 2 + 1, d / 2, ModBlocks.DINING_CHAIRS.get(ModBlocks.ChairStyle.WHITE), W);
		tall(g, 0, d - 1, st.bookcase, E);
		tall(g, 0, d - 2, st.bookcase, E);
		wall(g, w / 2, d - 1, S, 2, ModBlocks.WALL_TV);
		wall(g, w - 1, 2, E, 2, ModBlocks.ART.get(r.nextInt(ModBlocks.ART.size())));
		finish(g, false);
		nameSign(c, w, "KIDS' CLUB", "Ages 2-10", "Adult supervision");
	}

	/** Media room: rows of sofas facing a big screen on the first solid wall (the back wall when it has no windows). */
	public static void mediaRoom(Canvas c, int w, int d, int h, RandomSource r) {
		RoomGrid g = grid(c, w, d, h, r, InteriorStyle.Theme.LUXURY);
		Direction screen = S;
		for (Direction side : new Direction[] {S, W, E, N}) {
			List<int[]> cells = g.side(side);
			int m = cells.size() / 2;
			boolean solid = cells.size() >= 5;
			for (int i = m - 1; i <= m + 1 && solid; i++) {
				solid = g.edge(cells.get(i)[0], cells.get(i)[1], side) == RoomGrid.Edge.WALL;
			}
			if (solid) {
				screen = side;
				break;
			}
		}
		List<int[]> wallCells = g.side(screen);
		int m = wallCells.size() / 2;
		for (int i = m - 1; i <= m + 1; i++) {
			wall(g, wallCells.get(i)[0], wallCells.get(i)[1], screen, 2, ModBlocks.WALL_TV);
		}
		// rows of sofas from three blocks out, every other row, with aisles along both side walls
		Direction back = screen.getOpposite();
		int depth = screen.getAxis() == Direction.Axis.Z ? d : w;
		Block sofa = ModBlocks.SOFAS.get(ModBlocks.SofaColor.CHARCOAL);
		for (int row = 3; row < depth - 1; row += 2) {
			for (int i = 1; i < wallCells.size() - 1; i++) {
				int[] p = wallCells.get(i);
				put(g, p[0] + back.getStepX() * row, p[1] + back.getStepZ() * row, sofa, screen);
			}
		}
		finish(g, false);
		nameSign(c, w, "SCREENING ROOM", "Movie night", "Fridays 8pm");
	}

	/** Leaves a reminder in the buffer that a room was intended (used for markers). */
	public static void marker(Canvas c, String type, int x, int z, String label) {
		c.marker(type, x, 1, z, label);
	}
}
