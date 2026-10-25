package com.modernapartments.build.interior;

import com.modernapartments.block.ModProperties;
import com.modernapartments.block.Tabletop;
import com.modernapartments.build.Canvas;
import com.modernapartments.build.Inits;
import com.modernapartments.build.interior.RoomGrid.Edge;
import com.modernapartments.registry.ModBlocks;
import com.modernapartments.registry.ModBlocks.KitchenPart;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;

/**
 * Room furnishers. Every piece is placed through the {@link RoomGrid}: pieces go against real walls,
 * keep the cells needed to use them walkable, and are rolled back if they would cut off access.
 * Most choices (which wall, which end, optional pieces, colours) are randomised per unit.
 */
public final class Furnish {
	private static final Direction[] HORIZONTAL = {Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST};

	private Furnish() {
	}

	/** A rectangular zone inside a (possibly larger) room. */
	public record Zone(int x0, int z0, int x1, int z1) {
		public static Zone of(RoomGrid g) {
			return new Zone(g.x0, g.z0, g.x1, g.z1);
		}

		public boolean contains(int x, int z) {
			return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);
		}

		public int w() {
			return Math.abs(x1 - x0) + 1;
		}

		public int d() {
			return Math.abs(z1 - z0) + 1;
		}
	}

	// ============================================================================ helpers
	static Direction dirOf(int dx, int dz) {
		if (Math.abs(dx) >= Math.abs(dz)) {
			return dx >= 0 ? Direction.EAST : Direction.WEST;
		}
		return dz >= 0 ? Direction.SOUTH : Direction.NORTH;
	}

	static int[] step(int[] p, Direction d, int n) {
		return new int[] {p[0] + d.getStepX() * n, p[1] + d.getStepZ() * n};
	}

	static void put(RoomGrid g, int x, int z, Block block, Direction facing) {
		g.use(x, z);
		g.write(() -> g.c.put(x, 1, z, block, facing));
	}

	static void putTall(RoomGrid g, int x, int z, Block block, Direction facing) {
		g.use(x, z);
		for (Direction d : HORIZONTAL) {
			g.useDecor(x, z, d);
		}
		g.write(() -> g.c.tall(x, 1, z, block, facing));
	}

	/** Small item resting on top of the block planned at (x, y-1, z). */
	public static void tabletop(RoomGrid g, int x, int y, int z, Block item, Direction facing, Block under) {
		int drop = Tabletop.dropOnto(Canvas.facing(under, facing));
		BlockState s = Tabletop.withDrop(Canvas.facing(item, facing), drop);
		g.write(() -> g.c.set(x, y, z, s));
	}

	/** Wall-mounted piece at height y on the wall beyond {@code side}. */
	public static boolean wallItem(RoomGrid g, int x, int z, Direction side, int y, Block block) {
		if (!g.in(x, z) || g.edge(x, z, side) != Edge.WALL || !g.decorFree(x, z, side)) {
			return false;
		}
		g.useDecor(x, z, side);
		g.write(() -> g.c.put(x, y, z, block, side.getOpposite()));
		return true;
	}

	static List<Direction> shuffledSides(RandomSource r) {
		List<Direction> list = new ArrayList<>(List.of(HORIZONTAL));
		Collections.shuffle(list, new java.util.Random(r.nextLong()));
		return list;
	}

	/** Boundary cells along a side ordered from the middle outwards. */
	static List<int[]> middleOut(RoomGrid g, Direction side, Zone zone) {
		List<int[]> cells = new ArrayList<>();
		for (int[] p : g.side(side)) {
			if (zone == null || zone.contains(p[0], p[1])) {
				cells.add(p);
			}
		}
		List<int[]> out = new ArrayList<>();
		int mid = cells.size() / 2;
		for (int i = 0; i < cells.size(); i++) {
			int k = i % 2 == 0 ? mid + i / 2 : mid - (i + 1) / 2;
			if (k >= 0 && k < cells.size()) {
				out.add(cells.get(k));
			}
		}
		return out;
	}

	/** Side of the room containing most entrances (the "door wall"). */
	static Direction doorSide(RoomGrid g) {
		int[] counts = new int[4];
		for (int[] e : g.entrances()) {
			for (Direction d : HORIZONTAL) {
				if (!g.in(e[0] + d.getStepX(), e[1] + d.getStepZ())) {
					counts[d.get2DDataValue()]++;
				}
			}
		}
		Direction best = Direction.NORTH;
		for (Direction d : HORIZONTAL) {
			if (counts[d.get2DDataValue()] > counts[best.get2DDataValue()]) {
				best = d;
			}
		}
		return best;
	}

	static boolean isCorner(RoomGrid g, int x, int z) {
		int walls = 0;
		for (Direction d : HORIZONTAL) {
			if (!g.in(x + d.getStepX(), z + d.getStepZ())) {
				walls++;
			}
		}
		return walls >= 2;
	}

	/** First boundary side of the cell whose edge is a solid wall. */
	static Direction wallSideOf(RoomGrid g, int x, int z, boolean allowWindow) {
		for (Direction d : HORIZONTAL) {
			if (!g.in(x + d.getStepX(), z + d.getStepZ())) {
				Edge e = g.edge(x, z, d);
				if (e == Edge.WALL || (allowWindow && e == Edge.WINDOW)) {
					return d;
				}
			}
		}
		return null;
	}

	/** Places a single piece against a wall somewhere free (corners first if requested). */
	public static boolean againstWall(RoomGrid g, Zone zone, Block block, boolean tall, boolean needsFront, boolean cornersFirst,
			boolean allowWindow) {
		List<int[]> candidates = new ArrayList<>();
		for (int x = g.x0; x <= g.x1; x++) {
			for (int z = g.z0; z <= g.z1; z++) {
				if (g.free(x, z) && (zone == null || zone.contains(x, z)) && wallSideOf(g, x, z, allowWindow && !tall) != null) {
					candidates.add(new int[] {x, z});
				}
			}
		}
		Collections.shuffle(candidates, new java.util.Random(g.random.nextLong()));
		if (cornersFirst) {
			candidates.sort((a, b) -> Boolean.compare(!isCorner(g, a[0], a[1]), !isCorner(g, b[0], b[1])));
		}
		for (int[] p : candidates) {
			Direction side = wallSideOf(g, p[0], p[1], allowWindow && !tall);
			Direction facing = side.getOpposite();
			int[] front = step(p, facing, 1);
			if (needsFront && !g.walkable(front[0], front[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			if (tall) {
				putTall(g, p[0], p[1], block, facing);
			} else {
				put(g, p[0], p[1], block, facing);
			}
			if (needsFront) {
				g.keep(front[0], front[1]);
			}
			if (g.commitIfConnected(tx)) {
				return true;
			}
		}
		return false;
	}

	// ============================================================================ bedroom
	public static void bedroom(RoomGrid g, boolean primary, boolean kids) {
		bedroom(g, null, primary, kids);
	}

	/** Bedroom furniture, optionally restricted to a zone (studio sleeping corner). */
	public static void bedroom(RoomGrid g, Zone zone, boolean primary, boolean kids) {
		InteriorStyle s = g.style;
		Direction door = doorSide(g);
		List<Direction> order = new ArrayList<>();
		order.add(door.getOpposite());
		for (Direction d : shuffledSides(g.random)) {
			if (!order.contains(d) && d != door) {
				order.add(d);
			}
		}
		order.add(door);
		boolean bedPlaced = false;
		for (Direction side : order) {
			for (int[] head : middleOut(g, side, zone)) {
				if (placeBed(g, head, side, kids ? s.kidBed : s.bed, kids)) {
					bedPlaced = true;
					break;
				}
			}
			if (bedPlaced) {
				break;
			}
		}
		int area = zone == null ? g.area() : zone.w() * zone.d();
		againstWall(g, zone, s.wardrobe, true, true, true, false);
		if (area >= 14) {
			placeDresser(g, zone);
		}
		if (!kids && area >= 20 && (primary || g.random.nextBoolean())) {
			placeDesk(g, zone);
		}
		if (kids) {
			againstWall(g, zone, s.desk, false, true, false, true);
			againstWall(g, zone, ModBlocks.LAUNDRY_BASKET, false, false, true, false);
			againstWall(g, zone, ModBlocks.BEAN_BAG, false, false, true, false);
		} else {
			if (g.random.nextBoolean()) {
				againstWall(g, zone, ModBlocks.LAUNDRY_BASKET, false, false, true, false);
			}
			if (g.random.nextInt(3) > 0) {
				againstWall(g, zone, s.tallPlant(), false, false, true, true);
			}
			if (primary && area >= 16 && g.random.nextBoolean()) {
				againstWall(g, zone, s.armchairBlock(), false, true, true, true);
			}
		}
		g.flush();
	}

	private static boolean placeBed(RoomGrid g, int[] head, Direction side, Block bed, boolean bunk) {
		if (!g.free(head[0], head[1]) || g.edge(head[0], head[1], side) != Edge.WALL) {
			return false;
		}
		Direction into = side.getOpposite();
		int[] foot = step(head, into, 1);
		if (!g.free(foot[0], foot[1])) {
			return false;
		}
		Direction across = side.getClockWise();
		RoomGrid.Tx tx = g.begin();
		g.use(head[0], head[1]);
		g.use(foot[0], foot[1]);
		int[] beyondFoot = step(foot, into, 1);
		g.keep(beyondFoot[0], beyondFoot[1]);
		int[] sideA = step(foot, across, 1);
		int[] sideB = step(foot, across.getOpposite(), 1);
		boolean sideAccess = g.walkable(sideA[0], sideA[1]) || g.walkable(sideB[0], sideB[1]);
		if (!sideAccess && !g.walkable(beyondFoot[0], beyondFoot[1])) {
			tx.rollback();
			return false;
		}
		if (g.walkable(sideA[0], sideA[1])) {
			g.keep(sideA[0], sideA[1]);
		} else if (g.walkable(sideB[0], sideB[1])) {
			g.keep(sideB[0], sideB[1]);
		}
		if (!g.connected()) {
			tx.rollback();
			return false;
		}
		InteriorStyle s = g.style;
		g.write(() -> g.c.bed(head[0], 1, head[1], bed, into));
		if (bunk) {
			g.write(() -> g.c.bed(head[0], 2, head[1], bed, into));
		}
		// nightstands with lamps on both sides of the headboard
		for (Direction d : new Direction[] {across, across.getOpposite()}) {
			int[] n = step(head, d, 1);
			if (g.free(n[0], n[1]) && g.edge(n[0], n[1], side) == Edge.WALL) {
				RoomGrid.Tx t2 = g.begin();
				put(g, n[0], n[1], s.nightstand, into);
				if (g.commitIfConnected(t2)) {
					tabletop(g, n[0], 2, n[1], bunk ? ModBlocks.BOOK_STACK : s.tableLamp, into, s.nightstand);
					g.write(() -> g.c.init(n[0], 1, n[1], Inits.loot("nightstand")));
				}
			}
		}
		if (!bunk && g.decorFree(head[0], head[1], side)) {
			g.useDecor(head[0], head[1], side);
			Block art = g.random.nextInt(3) == 0 ? s.wideArt() : s.art();
			g.write(() -> g.c.put(head[0], 2, head[1], art, into));
		}
		// rug on free cells beside the bed
		Block rug = s.rug;
		for (int[] p : new int[][] {step(head, across, 1), step(head, across.getOpposite(), 1), sideA, sideB}) {
			if (g.free(p[0], p[1])) {
				g.write(() -> {
					if (g.c.isAirOrUnset(p[0], 1, p[1])) {
						g.c.set(p[0], 1, p[1], rug);
					}
				});
			}
		}
		return true;
	}

	private static void placeDresser(RoomGrid g, Zone zone) {
		InteriorStyle s = g.style;
		List<int[]> candidates = wallCells(g, zone, false);
		for (int[] p : candidates) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			Direction facing = side.getOpposite();
			int[] front = step(p, facing, 1);
			if (!g.walkable(front[0], front[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			put(g, p[0], p[1], s.dresser, facing);
			g.keep(front[0], front[1]);
			if (g.commitIfConnected(tx)) {
				g.write(() -> g.c.init(p[0], 1, p[1], Inits.loot("dresser")));
				Block top = InteriorStyle.pick(g.random, ModBlocks.VASE, ModBlocks.SUCCULENT_POT, s.tableLamp, ModBlocks.CANDLE_SET,
					ModBlocks.BOOK_STACK);
				tabletop(g, p[0], 2, p[1], top, facing, s.dresser);
				if (g.decorFree(p[0], p[1], side)) {
					g.useDecor(p[0], p[1], side);
					Block above = g.random.nextBoolean() ? ModBlocks.WALL_MIRROR : s.art();
					g.write(() -> g.c.put(p[0], 3, p[1], above, facing));
				}
				return;
			}
		}
	}

	/** Desk with chair (and a laptop or monitor), preferably under a window. */
	static boolean placeDesk(RoomGrid g, Zone zone) {
		InteriorStyle s = g.style;
		List<int[]> candidates = new ArrayList<>();
		for (int x = g.x0; x <= g.x1; x++) {
			for (int z = g.z0; z <= g.z1; z++) {
				if (g.free(x, z) && (zone == null || zone.contains(x, z)) && wallSideOf(g, x, z, true) != null) {
					candidates.add(new int[] {x, z});
				}
			}
		}
		Collections.shuffle(candidates, new java.util.Random(g.random.nextLong()));
		candidates.sort((a, b) -> Boolean.compare(windowSideOf(g, a) == null, windowSideOf(g, b) == null));
		for (int[] p : candidates) {
			Direction side = windowSideOf(g, p) != null ? windowSideOf(g, p) : wallSideOf(g, p[0], p[1], false);
			if (side == null) {
				continue;
			}
			Direction facing = side.getOpposite();
			int[] chair = step(p, facing, 1);
			int[] behind = step(chair, facing, 1);
			if (!g.free(chair[0], chair[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			put(g, p[0], p[1], s.desk, facing);
			put(g, chair[0], chair[1], ModBlocks.OFFICE_CHAIR, side);
			Direction across = side.getClockWise();
			int[] a = step(chair, across, 1);
			int[] b = step(chair, across.getOpposite(), 1);
			if (g.walkable(behind[0], behind[1])) {
				g.keep(behind[0], behind[1]);
			} else if (g.walkable(a[0], a[1])) {
				g.keep(a[0], a[1]);
			} else if (g.walkable(b[0], b[1])) {
				g.keep(b[0], b[1]);
			} else {
				tx.rollback();
				continue;
			}
			if (g.commitIfConnected(tx)) {
				Block gadget = g.random.nextBoolean() ? ModBlocks.LAPTOP : ModBlocks.DESKTOP_MONITOR;
				tabletop(g, p[0], 2, p[1], gadget, facing, s.desk);
				return true;
			}
		}
		return false;
	}

	static Direction windowSideOf(RoomGrid g, int[] p) {
		for (Direction d : HORIZONTAL) {
			if (!g.in(p[0] + d.getStepX(), p[1] + d.getStepZ()) && g.edge(p[0], p[1], d) == Edge.WINDOW) {
				return d;
			}
		}
		return null;
	}

	static List<int[]> wallCells(RoomGrid g, Zone zone, boolean allowWindow) {
		List<int[]> candidates = new ArrayList<>();
		for (int x = g.x0; x <= g.x1; x++) {
			for (int z = g.z0; z <= g.z1; z++) {
				if (g.free(x, z) && (zone == null || zone.contains(x, z)) && wallSideOf(g, x, z, allowWindow) != null) {
					candidates.add(new int[] {x, z});
				}
			}
		}
		Collections.shuffle(candidates, new java.util.Random(g.random.nextLong()));
		return candidates;
	}

	// ============================================================================ bathroom
	public static void bathroom(RoomGrid g, boolean master, boolean laundry) {
		InteriorStyle s = g.style;
		Direction door = doorSide(g);
		Direction back = door.getOpposite();
		boolean tubPlaced = false;
		boolean wantTub = master || g.random.nextInt(3) > 0;
		if (wantTub) {
			tubPlaced = placeTub(g, back) || placeTub(g, back.getClockWise()) || placeTub(g, back.getCounterClockWise());
		}
		if (!tubPlaced || (master && g.area() >= 16)) {
			placeShower(g, tubPlaced ? door : back);
		}
		placeToilet(g, back);
		placeVanity(g, master);
		if (laundry) {
			placeLaundryStack(g);
		}
		for (int[] p : wallCells(g, null, false)) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			if (wallItem(g, p[0], p[1], side, 2, ModBlocks.TOWEL_RACK)) {
				break;
			}
		}
		if (g.area() >= 12 && g.random.nextBoolean()) {
			againstWall(g, null, InteriorStyle.pick(g.random, POTTED_SNAKE_PLANT(), ModBlocks.TOWEL_STACK), false, false, true, false);
		}
		g.flush();
	}

	private static boolean placeTub(RoomGrid g, Direction wallSide) {
		List<int[]> cells = g.side(wallSide);
		Direction along = wallSide.getClockWise();
		for (int i = 0; i + 1 < cells.size(); i++) {
			int[] a = cells.get(i);
			int[] b = cells.get(i + 1);
			if (!g.free(a[0], a[1]) || !g.free(b[0], b[1]) || g.edge(a[0], a[1], wallSide) != Edge.WALL
				|| g.edge(b[0], b[1], wallSide) != Edge.WALL) {
				continue;
			}
			// b - a points along +x or +z; orient the tub so its head (faucet) sits in the corner
			Direction ab = dirOf(b[0] - a[0], b[1] - a[1]);
			boolean bInCorner = !g.in(b[0] + ab.getStepX(), b[1] + ab.getStepZ());
			int[] foot = bInCorner ? a : b;
			Direction facing = bInCorner ? ab : ab.getOpposite();
			Direction into = wallSide.getOpposite();
			RoomGrid.Tx tx = g.begin();
			g.use(a[0], a[1]);
			g.use(b[0], b[1]);
			int[] fa = step(a, into, 1);
			int[] fb = step(b, into, 1);
			if (g.walkable(fa[0], fa[1])) {
				g.keep(fa[0], fa[1]);
			} else if (g.walkable(fb[0], fb[1])) {
				g.keep(fb[0], fb[1]);
			} else {
				tx.rollback();
				continue;
			}
			if (!g.commitIfConnected(tx)) {
				continue;
			}
			g.write(() -> g.c.twoPart(foot[0], 1, foot[1], ModBlocks.BATHTUB, facing));
			int[] mat = g.walkable(fa[0], fa[1]) ? fa : fb;
			g.write(() -> {
				if (g.c.isAirOrUnset(mat[0], 1, mat[1])) {
					g.c.put(mat[0], 1, mat[1], ModBlocks.BATH_MAT, along);
				}
			});
			return true;
		}
		return false;
	}

	private static void placeShower(RoomGrid g, Direction preferred) {
		List<int[]> corners = new ArrayList<>();
		for (int x = g.x0; x <= g.x1; x++) {
			for (int z = g.z0; z <= g.z1; z++) {
				if (g.free(x, z) && isCorner(g, x, z)) {
					corners.add(new int[] {x, z});
				}
			}
		}
		Collections.shuffle(corners, new java.util.Random(g.random.nextLong()));
		for (int[] p : corners) {
			Direction wallSide = null;
			for (Direction d : HORIZONTAL) {
				if (!g.in(p[0] + d.getStepX(), p[1] + d.getStepZ()) && g.edge(p[0], p[1], d) == Edge.WALL) {
					wallSide = d;
					if (d == preferred) {
						break;
					}
				}
			}
			if (wallSide == null) {
				continue;
			}
			// screen on one open side, entry from the other open side
			Direction screenDir = null;
			Direction entryDir = null;
			for (Direction d : HORIZONTAL) {
				if (g.in(p[0] + d.getStepX(), p[1] + d.getStepZ())) {
					if (screenDir == null) {
						screenDir = d;
					} else {
						entryDir = d;
					}
				}
			}
			if (screenDir == null || entryDir == null) {
				continue;
			}
			int[] screen = step(p, screenDir, 1);
			int[] entry = step(p, entryDir, 1);
			if (!g.free(screen[0], screen[1]) || !g.walkable(entry[0], entry[1])) {
				int[] tmp = screen;
				screen = entry;
				entry = tmp;
				if (!g.free(screen[0], screen[1]) || !g.walkable(entry[0], entry[1])) {
					continue;
				}
			}
			RoomGrid.Tx tx = g.begin();
			g.use(p[0], p[1]);
			g.use(screen[0], screen[1]);
			g.keep(entry[0], entry[1]);
			if (!g.commitIfConnected(tx)) {
				continue;
			}
			Direction head = wallSide;
			int[] sc = screen;
			g.write(() -> {
				g.c.set(p[0], 0, p[1], ModBlocks.get("shower_floor"));
				g.c.set(p[0], 1, p[1], Canvas.AIR);
				g.c.put(p[0], 2, p[1], ModBlocks.SHOWER_HEAD, head.getOpposite());
				g.c.set(sc[0], 1, sc[1], ModBlocks.GLASS_PARTITION);
				g.c.set(sc[0], 2, sc[1], ModBlocks.GLASS_PARTITION);
			});
			g.useDecor(p[0], p[1], head);
			return;
		}
	}

	private static void placeToilet(RoomGrid g, Direction back) {
		for (Direction side : new Direction[] {back.getClockWise(), back.getCounterClockWise(), back, back.getOpposite()}) {
			for (int[] p : middleOut(g, side, null)) {
				if (!g.free(p[0], p[1]) || g.edge(p[0], p[1], side) != Edge.WALL) {
					continue;
				}
				Direction facing = side.getOpposite();
				int[] front = step(p, facing, 1);
				if (!g.walkable(front[0], front[1])) {
					continue;
				}
				RoomGrid.Tx tx = g.begin();
				put(g, p[0], p[1], ModBlocks.TOILET, facing);
				g.keep(front[0], front[1]);
				if (g.commitIfConnected(tx)) {
					return;
				}
			}
		}
	}

	private static void placeVanity(RoomGrid g, boolean master) {
		InteriorStyle s = g.style;
		for (int[] p : wallCells(g, null, false)) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			Direction facing = side.getOpposite();
			int[] front = step(p, facing, 1);
			if (!g.walkable(front[0], front[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			put(g, p[0], p[1], s.vanity, facing);
			g.keep(front[0], front[1]);
			int[] twin = step(p, side.getClockWise(), 1);
			boolean twinOk = master && g.free(twin[0], twin[1]) && g.edge(twin[0], twin[1], side) == Edge.WALL
				&& g.walkable(step(twin, facing, 1)[0], step(twin, facing, 1)[1]);
			if (twinOk) {
				put(g, twin[0], twin[1], s.vanity, facing);
			}
			if (g.commitIfConnected(tx)) {
				Block mirror = g.w() >= 4 && g.d() >= 4 ? ModBlocks.VANITY_MIRROR : ModBlocks.MEDICINE_CABINET;
				if (g.decorFree(p[0], p[1], side)) {
					g.useDecor(p[0], p[1], side);
					g.write(() -> g.c.put(p[0], 2, p[1], mirror, facing));
				}
				if (twinOk && g.decorFree(twin[0], twin[1], side)) {
					g.useDecor(twin[0], twin[1], side);
					g.write(() -> g.c.put(twin[0], 2, twin[1], ModBlocks.WALL_MIRROR, facing));
				}
				return;
			}
		}
	}

	/** Stacked washer + dryer against a wall. */
	private static void placeLaundryStack(RoomGrid g) {
		for (int[] p : wallCells(g, null, false)) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			Direction facing = side.getOpposite();
			int[] front = step(p, facing, 1);
			if (!g.walkable(front[0], front[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			g.use(p[0], p[1]);
			g.keep(front[0], front[1]);
			if (g.commitIfConnected(tx)) {
				for (Direction d : HORIZONTAL) {
					g.useDecor(p[0], p[1], d);
				}
				g.write(() -> {
					g.c.put(p[0], 1, p[1], ModBlocks.WASHING_MACHINE, facing);
					g.c.put(p[0], 2, p[1], ModBlocks.DRYER, facing);
				});
				return;
			}
		}
	}

	// ============================================================================ kitchen
	public enum K { FRIDGE, COUNTER, DRAWERS, SINK, DISHWASHER, STOVE }

	static List<K> kitchenSequence(int length, RandomSource r) {
		List<K> seq = new ArrayList<>();
		switch (length) {
			case 1 -> seq.add(K.SINK);
			case 2 -> {
				seq.add(K.SINK);
				seq.add(K.STOVE);
			}
			case 3 -> {
				seq.add(K.FRIDGE);
				seq.add(K.SINK);
				seq.add(K.STOVE);
			}
			case 4 -> seq.addAll(List.of(K.FRIDGE, r.nextBoolean() ? K.DRAWERS : K.DISHWASHER, K.SINK, K.STOVE));
			case 5 -> seq.addAll(List.of(K.FRIDGE, K.DRAWERS, K.SINK, K.DISHWASHER, K.STOVE));
			case 6 -> seq.addAll(List.of(K.FRIDGE, K.COUNTER, K.SINK, K.DISHWASHER, K.STOVE, K.DRAWERS));
			default -> {
				seq.addAll(List.of(K.FRIDGE, K.DRAWERS, K.SINK, K.DISHWASHER, K.COUNTER, K.STOVE));
				while (seq.size() < length) {
					seq.add(seq.size() % 2 == 0 ? K.COUNTER : K.DRAWERS);
				}
			}
		}
		if (r.nextBoolean()) {
			Collections.reverse(seq);
		}
		return seq;
	}

	/**
	 * Kitchen run along {@code wallSide} over the given boundary cells (in order). Returns the cells used.
	 */
	public static List<int[]> kitchenRun(RoomGrid g, Direction wallSide, List<int[]> cells) {
		InteriorStyle s = g.style;
		List<int[]> usable = new ArrayList<>();
		for (int[] p : cells) {
			Edge e = g.edge(p[0], p[1], wallSide);
			if (g.free(p[0], p[1]) && (e == Edge.WALL || e == Edge.WINDOW)) {
				usable.add(p);
			} else if (!usable.isEmpty()) {
				break;
			}
		}
		if (usable.isEmpty()) {
			return usable;
		}
		List<K> seq = kitchenSequence(usable.size(), g.random);
		// put the sink under a window when there is one, and keep the fridge away from windows
		for (int i = 0; i < usable.size(); i++) {
			int[] p = usable.get(i);
			if (g.edge(p[0], p[1], wallSide) == Edge.WINDOW && seq.get(i) != K.SINK) {
				int sink = seq.indexOf(K.SINK);
				if (sink >= 0) {
					Collections.swap(seq, sink, i);
				}
			}
		}
		for (int i = 0; i < usable.size(); i++) {
			int[] p = usable.get(i);
			if (seq.get(i) == K.FRIDGE && g.edge(p[0], p[1], wallSide) == Edge.WINDOW) {
				seq.set(i, K.COUNTER);
			}
		}
		Direction facing = wallSide.getOpposite();
		RoomGrid.Tx tx = g.begin();
		for (int i = 0; i < usable.size(); i++) {
			int[] p = usable.get(i);
			g.use(p[0], p[1]);
			int[] front = step(p, facing, 1);
			g.keep(front[0], front[1]);
		}
		if (!g.commitIfConnected(tx)) {
			return new ArrayList<>();
		}
		for (int i = 0; i < usable.size(); i++) {
			int[] p = usable.get(i);
			K k = seq.get(i);
			boolean windowHere = g.edge(p[0], p[1], wallSide) == Edge.WINDOW;
			Block block = switch (k) {
				case FRIDGE -> ModBlocks.REFRIGERATOR;
				case SINK -> ModBlocks.kitchen(s.kitchen, KitchenPart.SINK);
				case DISHWASHER -> ModBlocks.kitchen(s.kitchen, KitchenPart.DISHWASHER);
				case STOVE -> ModBlocks.OVEN_RANGE;
				case DRAWERS -> ModBlocks.kitchen(s.kitchen, KitchenPart.DRAWERS);
				default -> ModBlocks.kitchen(s.kitchen, KitchenPart.CABINET);
			};
			if (k == K.FRIDGE) {
				g.write(() -> {
					g.c.tall(p[0], 1, p[1], block, facing);
					g.c.init(p[0], 1, p[1], Inits.loot("fridge"));
				});
			} else {
				g.write(() -> g.c.put(p[0], 1, p[1], block, facing));
				if (k == K.COUNTER || k == K.DRAWERS) {
					g.write(() -> g.c.init(p[0], 1, p[1], Inits.loot("pantry")));
				}
			}
			int ceiling = g.ceiling(p[0], p[1]);
			int upperY = Math.min(3, ceiling);
			if (!windowHere && ceiling >= 3) {
				if (k == K.STOVE) {
					g.useDecor(p[0], p[1], wallSide);
					g.write(() -> g.c.put(p[0], upperY, p[1], ModBlocks.RANGE_HOOD, facing));
				} else {
					g.useDecor(p[0], p[1], wallSide);
					Block upper = ModBlocks.kitchen(s.kitchen, KitchenPart.UPPER);
					g.write(() -> g.c.put(p[0], k == K.FRIDGE ? 3 : upperY, p[1], upper, facing));
				}
			}
			if ((k == K.COUNTER || k == K.DRAWERS) && g.random.nextInt(5) < 3) {
				Block item = InteriorStyle.pick(g.random, ModBlocks.COFFEE_MAKER, ModBlocks.TOASTER, ModBlocks.KITCHEN_UTENSILS,
					ModBlocks.FRUIT_BOWL, ModBlocks.MICROWAVE, ModBlocks.ESPRESSO_MACHINE, ModBlocks.SUCCULENT_POT);
				tabletop(g, p[0], 2, p[1], item, facing, block);
			}
		}
		g.flush();
		return usable;
	}

	/** Island two cells off a kitchen run, with bar stools on the far side. */
	public static boolean island(RoomGrid g, Direction wallSide, List<int[]> run, int length) {
		InteriorStyle s = g.style;
		if (run.size() < 3) {
			return false;
		}
		Direction into = wallSide.getOpposite();
		int start = (run.size() - length) / 2;
		List<int[]> cells = new ArrayList<>();
		List<int[]> stools = new ArrayList<>();
		for (int i = start; i < start + length && i < run.size(); i++) {
			cells.add(step(run.get(i), into, 2));
			stools.add(step(run.get(i), into, 3));
		}
		for (int[] p : cells) {
			if (!g.free(p[0], p[1])) {
				return false;
			}
		}
		RoomGrid.Tx tx = g.begin();
		for (int[] p : cells) {
			g.use(p[0], p[1]);
		}
		List<int[]> placedStools = new ArrayList<>();
		for (int[] p : stools) {
			if (g.free(p[0], p[1])) {
				g.use(p[0], p[1]);
				placedStools.add(p);
				int[] beyond = step(p, into, 1);
				g.keep(beyond[0], beyond[1]);
			}
		}
		// both ends of the island must stay passable
		Direction along = cells.size() > 1 ? dirOf(cells.get(1)[0] - cells.get(0)[0], cells.get(1)[1] - cells.get(0)[1])
			: wallSide.getClockWise();
		for (int[] end : new int[][] {step(cells.get(0), along.getOpposite(), 1), step(cells.get(cells.size() - 1), along, 1)}) {
			g.keep(end[0], end[1]);
		}
		if (!g.commitIfConnected(tx)) {
			return false;
		}
		Block counter = ModBlocks.kitchen(s.kitchen, KitchenPart.DRAWERS);
		for (int[] p : cells) {
			g.write(() -> g.c.put(p[0], 1, p[1], counter, wallSide));
		}
		for (int[] p : placedStools) {
			g.write(() -> g.c.put(p[0], 1, p[1], s.barStool, wallSide));
		}
		for (int i = 0; i < cells.size(); i += 2) {
			int[] p = cells.get(i);
			int y = g.ceiling(p[0], p[1]);
			if (y >= 3) {
				g.write(() -> g.c.set(p[0], y, p[1], s.pendant));
			}
		}
		int[] decor = cells.get(cells.size() / 2);
		tabletop(g, decor[0], 2, decor[1], g.random.nextBoolean() ? ModBlocks.FRUIT_BOWL : ModBlocks.FLOWER_VASE, wallSide, counter);
		g.flush();
		return true;
	}

	// ============================================================================ living
	public static void living(RoomGrid g, Zone zone) {
		InteriorStyle s = g.style;
		List<Direction> sides = shuffledSides(g.random);
		boolean done = false;
		for (Direction tvSide : sides) {
			if (tryLiving(g, zone, tvSide)) {
				done = true;
				break;
			}
		}
		if (!done) {
			// fall back to a sofa against any wall plus a coffee table
			for (int[] p : wallCells(g, zone, true)) {
				Direction side = wallSideOf(g, p[0], p[1], true);
				int[] front = step(p, side.getOpposite(), 1);
				if (!g.walkable(front[0], front[1])) {
					continue;
				}
				RoomGrid.Tx tx = g.begin();
				put(g, p[0], p[1], s.sofaBlock(), side.getOpposite());
				g.keep(front[0], front[1]);
				if (g.commitIfConnected(tx)) {
					break;
				}
			}
		}
		againstWall(g, zone, s.bookcase, true, true, true, false);
		againstWall(g, zone, s.tallPlant(), false, false, true, true);
		if (g.random.nextBoolean()) {
			againstWall(g, zone, s.smallPlant(), false, false, true, true);
		}
		if (zone.w() * zone.d() >= 24 && g.random.nextBoolean()) {
			againstWall(g, zone, ModBlocks.SPEAKER, false, false, true, false);
		}
		g.flush();
	}

	private static boolean tryLiving(RoomGrid g, Zone zone, Direction tvSide) {
		InteriorStyle s = g.style;
		Direction toSofa = tvSide.getOpposite();
		// TV wall cells inside the zone that are real walls
		List<int[]> tvCells = new ArrayList<>();
		for (int[] p : middleOut(g, tvSide, zone)) {
			if (g.edge(p[0], p[1], tvSide) == Edge.WALL) {
				tvCells.add(p);
			}
		}
		for (int[] tv : tvCells) {
			int depth = 0;
			int[] q = tv;
			while (g.in(q[0], q[1]) && zone.contains(q[0], q[1])) {
				depth++;
				q = step(q, toSofa, 1);
			}
			if (depth < 4) {
				continue;
			}
			int sofaDist = Math.min(depth - 1, 4);
			int[] sofaCentre = step(tv, toSofa, sofaDist);
			Direction across = tvSide.getClockWise();
			int pieces = g.random.nextInt(3) == 0 ? 2 : 3;
			for (int attempt = 0; attempt < 2; attempt++) {
				int n = attempt == 0 ? pieces : 2;
				List<int[]> sofa = new ArrayList<>();
				int startOffset = -(n / 2);
				for (int i = 0; i < n; i++) {
					sofa.add(step(sofaCentre, across, startOffset + i));
				}
				boolean ok = true;
				for (int[] p : sofa) {
					if (!g.free(p[0], p[1]) || !zone.contains(p[0], p[1])) {
						ok = false;
					}
				}
				if (!g.free(tv[0], tv[1])) {
					ok = false;
				}
				if (!ok) {
					continue;
				}
				RoomGrid.Tx tx = g.begin();
				for (int[] p : sofa) {
					g.use(p[0], p[1]);
				}
				g.use(tv[0], tv[1]);
				int[] table = step(sofa.get(n / 2), tvSide, 1);
				boolean tableOk = sofaDist >= 3 && g.free(table[0], table[1]);
				if (tableOk) {
					g.use(table[0], table[1]);
				}
				for (int[] p : sofa) {
					int[] f = step(p, tvSide, 1);
					if (!(tableOk && f[0] == table[0] && f[1] == table[1])) {
						g.keep(f[0], f[1]);
					}
				}
				int[] tvFront = step(tv, toSofa, 1);
				g.keep(tvFront[0], tvFront[1]);
				// optional L-shaped sectional leg towards the TV on one side
				int[] leg = null;
				Direction legFacing = null;
				if (n == 3 && g.random.nextBoolean()) {
					boolean left = g.random.nextBoolean();
					int[] end = left ? sofa.get(0) : sofa.get(n - 1);
					int[] candidate = step(end, tvSide, 1);
					Direction f = left ? across : across.getOpposite();
					if (g.free(candidate[0], candidate[1]) && zone.contains(candidate[0], candidate[1])) {
						g.use(candidate[0], candidate[1]);
						leg = candidate;
						legFacing = f;
					}
				}
				if (!g.commitIfConnected(tx)) {
					continue;
				}
				Block sofaBlock = s.sofaBlock();
				for (int[] p : sofa) {
					g.write(() -> g.c.put(p[0], 1, p[1], sofaBlock, tvSide));
				}
				if (leg != null) {
					int[] lp = leg;
					Direction lf = legFacing;
					g.write(() -> g.c.put(lp[0], 1, lp[1], sofaBlock, lf));
				}
				// TV wall: console or fireplace under a wall-mounted TV
				Block under = s.fireplace ? ModBlocks.ELECTRIC_FIREPLACE : s.mediaConsole();
				g.write(() -> {
					g.c.put(tv[0], 1, tv[1], under, toSofa);
					if (under == ModBlocks.ELECTRIC_FIREPLACE) {
						g.c.set(tv[0], 1, tv[1], Canvas.facing(under, toSofa).setValue(ModProperties.ON, true));
					}
					g.c.put(tv[0], 2, tv[1], ModBlocks.WALL_TV, toSofa);
				});
				g.useDecor(tv[0], tv[1], tvSide);
				if (tableOk) {
					g.write(() -> g.c.put(table[0], 1, table[1], s.coffeeTable, tvSide));
					if (g.random.nextBoolean()) {
						tabletop(g, table[0], 2, table[1], InteriorStyle.pick(g.random, ModBlocks.BOOK_STACK, ModBlocks.CANDLE_SET,
							ModBlocks.FLOWER_VASE, ModBlocks.VASE), tvSide, s.coffeeTable);
					}
				}
				// rug between sofa and TV
				int[] a = step(sofa.get(0), tvSide, 1);
				int[] b = step(sofa.get(n - 1), tvSide, Math.max(1, sofaDist - 1));
				int rx0 = Math.min(a[0], b[0]);
				int rx1 = Math.max(a[0], b[0]);
				int rz0 = Math.min(a[1], b[1]);
				int rz1 = Math.max(a[1], b[1]);
				for (int x = rx0; x <= rx1; x++) {
					for (int z = rz0; z <= rz1; z++) {
						if (g.walkable(x, z)) {
							boolean edge = x == rx0 || x == rx1 || z == rz0 || z == rz1;
							int fx = x;
							int fz = z;
							Block rug = edge ? s.rugBorder : s.rug;
							g.write(() -> {
								if (g.c.isAirOrUnset(fx, 1, fz)) {
									g.c.set(fx, 1, fz, rug);
								}
							});
						}
					}
				}
				// lamps and side table at the sofa ends
				int[] endA = step(sofa.get(0), across, -1);
				int[] endB = step(sofa.get(n - 1), across, 1);
				if (leg == null || g.random.nextBoolean()) {
					placeIfFree(g, endA, s.floorLamp, tvSide);
				}
				if (g.free(endB[0], endB[1])) {
					RoomGrid.Tx t2 = g.begin();
					Block side = g.random.nextBoolean() ? ModBlocks.SIDE_TABLE : ModBlocks.SIDE_TABLE_WOOD;
					put(g, endB[0], endB[1], side, tvSide);
					if (g.commitIfConnected(t2)) {
						tabletop(g, endB[0], 2, endB[1], s.tableLamp, tvSide, side);
					}
				}
				// accent chair beside the coffee table
				if (tableOk && g.random.nextBoolean()) {
					int[] chair = step(table, across, (g.random.nextBoolean() ? 2 : -2));
					if (g.free(chair[0], chair[1]) && zone.contains(chair[0], chair[1])) {
						Direction toward = chair[0] == table[0] ? (chair[1] < table[1] ? Direction.SOUTH : Direction.NORTH)
							: (chair[0] < table[0] ? Direction.EAST : Direction.WEST);
						placeIfFree(g, chair, s.armchairBlock(), toward);
					}
				}
				// art on the wall behind the sofa
				int[] back = sofa.get(n / 2);
				Direction behind = toSofa;
				if (!g.in(back[0] + behind.getStepX(), back[1] + behind.getStepZ()) && g.edge(back[0], back[1], behind) == Edge.WALL
					&& g.decorFree(back[0], back[1], behind)) {
					g.useDecor(back[0], back[1], behind);
					Block art = s.wideArt();
					g.write(() -> g.c.put(back[0], 2, back[1], art, tvSide));
				}
				return true;
			}
		}
		return false;
	}

	public static boolean placeIfFree(RoomGrid g, int[] p, Block block, Direction facing) {
		if (!g.free(p[0], p[1])) {
			return false;
		}
		RoomGrid.Tx tx = g.begin();
		put(g, p[0], p[1], block, facing);
		return g.commitIfConnected(tx);
	}

	// ============================================================================ dining
	public static void dining(RoomGrid g, Zone zone, int maxLength) {
		boolean alongX = zone.w() >= zone.d();
		Direction axis = alongX ? Direction.EAST : Direction.SOUTH;
		int cx = (zone.x0() + zone.x1()) / 2;
		int cz = (zone.z0() + zone.z1()) / 2;
		int[] shifts = {0, -1, 1};
		search:
		for (int len = Math.min(maxLength, 3); len >= 1; len--) {
			for (int shift : shifts) {
				int ox = alongX ? cx - len / 2 + shift : cx + shift;
				int oz = alongX ? cz + shift : cz - len / 2 + shift;
				if (tryDining(g, zone, axis, ox, oz, len)) {
					break search;
				}
			}
		}
		g.flush();
	}

	private static boolean tryDining(RoomGrid g, Zone zone, Direction axis, int ox, int oz, int len) {
		InteriorStyle s = g.style;
		Direction side = axis.getClockWise();
		List<int[]> table = new ArrayList<>();
		for (int i = 0; i < len; i++) {
			int[] p = {ox + axis.getStepX() * i, oz + axis.getStepZ() * i};
			if (!g.free(p[0], p[1]) || !zone.contains(p[0], p[1])) {
				return false;
			}
			table.add(p);
		}
		RoomGrid.Tx tx = g.begin();
		for (int[] p : table) {
			g.use(p[0], p[1]);
		}
		List<int[]> chairs = new ArrayList<>();
		List<Direction> chairFacing = new ArrayList<>();
		for (int[] p : table) {
			for (Direction d : new Direction[] {side, side.getOpposite()}) {
				int[] c = step(p, d, 1);
				if (g.free(c[0], c[1]) && zone.contains(c[0], c[1])) {
					chairs.add(c);
					chairFacing.add(d.getOpposite());
				}
			}
		}
		if (len >= 2) {
			for (Direction d : new Direction[] {axis, axis.getOpposite()}) {
				int[] endCell = step(d == axis ? table.get(len - 1) : table.get(0), d, 1);
				int[] beyond = step(endCell, d, 1);
				if (g.free(endCell[0], endCell[1]) && g.walkable(beyond[0], beyond[1]) && zone.contains(endCell[0], endCell[1])) {
					chairs.add(endCell);
					chairFacing.add(d.getOpposite());
				}
			}
		}
		if (chairs.size() < 2) {
			tx.rollback();
			return false;
		}
		for (int[] c : chairs) {
			g.use(c[0], c[1]);
		}
		// every chair needs a walkable cell next to it
		for (int[] c : chairs) {
			boolean access = false;
			for (Direction d : HORIZONTAL) {
				int[] n = step(c, d, 1);
				if (g.walkable(n[0], n[1])) {
					g.keep(n[0], n[1]);
					access = true;
					break;
				}
			}
			if (!access) {
				tx.rollback();
				return false;
			}
		}
		if (!g.commitIfConnected(tx)) {
			return false;
		}
		Block tableBlock = s.tableBlock();
		for (int[] p : table) {
			g.write(() -> g.c.set(p[0], 1, p[1], tableBlock));
		}
		Block chair = s.chairBlock();
		for (int i = 0; i < chairs.size(); i++) {
			int[] c = chairs.get(i);
			Direction f = chairFacing.get(i);
			g.write(() -> g.c.put(c[0], 1, c[1], chair, f));
		}
		int[] mid = table.get(len / 2);
		int lightY = g.ceiling(mid[0], mid[1]);
		if (lightY >= 3) {
			Block light = len == 3 && s.theme != InteriorStyle.Theme.INDUSTRIAL ? ModBlocks.CHANDELIER : s.pendant;
			g.write(() -> g.c.set(mid[0], lightY, mid[1], light));
		}
		Block centrepiece = InteriorStyle.pick(g.random, ModBlocks.FLOWER_VASE, ModBlocks.CANDLE_SET, ModBlocks.FRUIT_BOWL);
		tabletop(g, mid[0], 2, mid[1], centrepiece, axis, tableBlock);
		return true;
	}

	// ============================================================================ office, closets, entry
	public static void office(RoomGrid g) {
		InteriorStyle s = g.style;
		placeDesk(g, null);
		againstWall(g, null, s.bookcase, true, true, true, false);
		againstWall(g, null, s.bookcase, true, true, true, false);
		againstWall(g, null, s.armchairBlock(), false, true, true, true);
		againstWall(g, null, s.tallPlant(), false, false, true, true);
		g.flush();
	}

	public static void closet(RoomGrid g) {
		Direction door = doorSide(g);
		for (Direction side : new Direction[] {door.getOpposite(), door.getClockWise(), door.getCounterClockWise()}) {
			for (int[] p : g.side(side)) {
				if (!g.free(p[0], p[1]) || g.edge(p[0], p[1], side) != Edge.WALL) {
					continue;
				}
				int[] front = step(p, side.getOpposite(), 1);
				if (!g.walkable(front[0], front[1])) {
					continue;
				}
				RoomGrid.Tx tx = g.begin();
				put(g, p[0], p[1], g.random.nextInt(4) == 0 ? ModBlocks.SHOE_RACK : ModBlocks.CLOTHING_RACK, side.getOpposite());
				g.keep(front[0], front[1]);
				if (!g.commitIfConnected(tx)) {
					continue;
				}
				if (g.random.nextBoolean() && g.decorFree(p[0], p[1], side)) {
					g.useDecor(p[0], p[1], side);
					g.write(() -> g.c.put(p[0], 3, p[1], ModBlocks.WALL_SHELF, side.getOpposite()));
				}
			}
		}
		g.flush();
	}

	/** Entry details: shoe rack, mirror, thermostat. */
	public static void entry(RoomGrid g, Zone zone) {
		InteriorStyle s = g.style;
		againstWall(g, zone, g.random.nextBoolean() ? ModBlocks.SHOE_RACK : s.smallPlant(), false, false, false, false);
		for (int[] p : wallCells(g, zone, false)) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			if (wallItem(g, p[0], p[1], side, 2, g.random.nextBoolean() ? ModBlocks.WALL_MIRROR_BRASS : ModBlocks.THERMOSTAT)) {
				break;
			}
		}
		g.flush();
	}

	/** Laundry closet: washer and dryer side by side (or stacked), basket and a shelf. */
	public static void laundry(RoomGrid g) {
		boolean pair = false;
		for (int[] p : wallCells(g, null, false)) {
			Direction side = wallSideOf(g, p[0], p[1], false);
			Direction facing = side.getOpposite();
			int[] next = step(p, side.getClockWise(), 1);
			int[] front = step(p, facing, 1);
			int[] nextFront = step(next, facing, 1);
			if (!g.free(next[0], next[1]) || g.edge(next[0], next[1], side) != Edge.WALL || !g.walkable(front[0], front[1])) {
				continue;
			}
			RoomGrid.Tx tx = g.begin();
			put(g, p[0], p[1], ModBlocks.WASHING_MACHINE, facing);
			put(g, next[0], next[1], ModBlocks.DRYER, facing);
			g.keep(front[0], front[1]);
			g.keep(nextFront[0], nextFront[1]);
			if (g.commitIfConnected(tx)) {
				pair = true;
				wallItem(g, p[0], p[1], side, Math.min(3, g.h), ModBlocks.WALL_SHELF);
				break;
			}
		}
		if (!pair) {
			placeLaundryStack(g);
		}
		againstWall(g, null, ModBlocks.LAUNDRY_BASKET, false, false, true, false);
		g.flush();
	}

	/** Half bath: toilet and vanity only. */
	public static void powder(RoomGrid g) {
		placeToilet(g, doorSide(g).getOpposite());
		placeVanity(g, false);
		for (int[] p : wallCells(g, null, false)) {
			if (wallItem(g, p[0], p[1], wallSideOf(g, p[0], p[1], false), 2, ModBlocks.TOILET_PAPER_HOLDER)) {
				break;
			}
		}
		g.flush();
	}

	/**
	 * Balcony furniture. x0..x1 / z0..z1 is the usable floor (inclusive, canvas coordinates, furniture at y=1)
	 * and {@code out} points away from the building.
	 */
	public static void balcony(Canvas c, RandomSource r, int x0, int z0, int x1, int z1, Direction out, boolean large) {
		int along = out.getAxis() == Direction.Axis.Z ? Math.abs(x1 - x0) + 1 : Math.abs(z1 - z0) + 1;
		int depth = out.getAxis() == Direction.Axis.Z ? Math.abs(z1 - z0) + 1 : Math.abs(x1 - x0) + 1;
		// local frame: z = 0 against the building, increasing outwards; x along the wall
		Canvas b = c.frame(Math.min(x0, x1), 0, Math.min(z0, z1), along, depth, out.getOpposite(), false);
		int outer = depth - 1;
		if (large && depth >= 3 && along >= 5) {
			int mid = along / 2;
			for (int i = mid - 1; i <= mid + 1; i++) {
				b.put(i, 1, outer, ModBlocks.SOFAS.get(ModBlocks.SofaColor.OUTDOOR), Direction.NORTH);
			}
			b.put(mid, 1, outer - 1, ModBlocks.GLASS_COFFEE_TABLE, Direction.NORTH);
			b.put(0, 1, outer, ModBlocks.BBQ_GRILL, Direction.EAST);
			b.put(along - 1, 1, outer, ModBlocks.PLANTER_BOX, Direction.NORTH);
			if (along >= 7) {
				b.put(along - 1, 1, 0, ModBlocks.TALL_PLANTS.get(r.nextInt(ModBlocks.TALL_PLANTS.size())), Direction.NORTH);
				b.put(0, 1, 0, ModBlocks.SMALL_PLANTS.get(r.nextInt(ModBlocks.SMALL_PLANTS.size())), Direction.NORTH);
			}
			return;
		}
		switch (r.nextInt(3)) {
			case 0 -> {
				b.put(0, 1, outer, ModBlocks.ADIRONDACK_CHAIR, Direction.EAST);
				if (along >= 2) {
					b.put(1, 1, outer, ModBlocks.SIDE_TABLE, Direction.NORTH);
				}
				if (along >= 3) {
					b.put(2, 1, outer, ModBlocks.ADIRONDACK_CHAIR, Direction.WEST);
				}
			}
			case 1 -> {
				b.put(along - 1, 1, outer, ModBlocks.LOUNGE_CHAIR, Direction.NORTH);
				if (along >= 2) {
					b.put(along - 2, 1, outer, ModBlocks.SIDE_TABLE_WOOD, Direction.NORTH);
				}
			}
			default -> {
				b.put(0, 1, outer, ModBlocks.ADIRONDACK_CHAIR, Direction.NORTH);
				if (along >= 2) {
					b.put(along - 1, 1, outer, ModBlocks.SMALL_PLANTS.get(r.nextInt(ModBlocks.SMALL_PLANTS.size())), Direction.NORTH);
				}
			}
		}
		if (along >= 4 && depth >= 2 && r.nextBoolean()) {
			b.put(along - 1, 1, 0, ModBlocks.TALL_PLANTS.get(r.nextInt(ModBlocks.TALL_PLANTS.size())), Direction.NORTH);
		}
	}

	// ============================================================================ finishing passes (after flush)
	/** Curtains framing windows (or blinds on every pane) and a light switch by each door. */
	public static void windowsAndSwitches(RoomGrid g) {
		InteriorStyle s = g.style;
		Block treatment = s.curtainBlock();
		boolean blinds = s.blinds;
		for (Direction side : HORIZONTAL) {
			List<int[]> cells = g.side(side);
			for (int i = 0; i < cells.size(); i++) {
				int[] p = cells.get(i);
				if (!g.in(p[0], p[1]) || g.edge(p[0], p[1], side) != Edge.WINDOW) {
					continue;
				}
				boolean first = i == 0 || g.edge(cells.get(i - 1)[0], cells.get(i - 1)[1], side) != Edge.WINDOW;
				boolean last = i == cells.size() - 1 || g.edge(cells.get(i + 1)[0], cells.get(i + 1)[1], side) != Edge.WINDOW;
				Direction facing = side.getOpposite();
				int top = g.ceiling(p[0], p[1]);
				if (blinds) {
					if (g.c.isAirOrUnset(p[0], top, p[1]) || isCeilingFinish(g, p[0], top, p[1])) {
						g.c.set(p[0], top, p[1], Canvas.facing(treatment, facing).setValue(BlockStateProperties.OPEN, true));
					}
				} else if (first || last) {
					for (int y = 2; y <= top; y++) {
						if (g.c.isAirOrUnset(p[0], y, p[1]) || (y == top && isCeilingFinish(g, p[0], y, p[1]))) {
							g.c.set(p[0], y, p[1], Canvas.facing(treatment, facing).setValue(BlockStateProperties.OPEN, true));
						}
					}
				}
			}
		}
		for (int[] e : g.entrances()) {
			for (Direction side : HORIZONTAL) {
				if (g.in(e[0] + side.getStepX(), e[1] + side.getStepZ()) || g.edge(e[0], e[1], side) != Edge.DOOR) {
					continue;
				}
				for (Direction along : new Direction[] {side.getClockWise(), side.getCounterClockWise()}) {
					int[] q = step(e, along, 1);
					if (g.in(q[0], q[1]) && g.edge(q[0], q[1], side) == Edge.WALL && g.c.isAirOrUnset(q[0], 2, q[1])) {
						g.c.put(q[0], 2, q[1], ModBlocks.LIGHT_SWITCH, side.getOpposite());
						break;
					}
				}
			}
		}
	}

	static boolean isCeilingFinish(RoomGrid g, int x, int y, int z) {
		return g.c.is(x, y, z, ModBlocks.CEILING_FINISH) || g.c.is(x, y, z, ModBlocks.CEILING_FINISH_WOOD) || isTileCeiling(g, x, y, z);
	}

	/** Full-block ceilings (acoustic tiles, plain ceiling panels) take LED panels instead of downlights. */
	static boolean isTileCeiling(RoomGrid g, int x, int y, int z) {
		return g.c.is(x, y, z, ModBlocks.get("acoustic_ceiling")) || g.c.is(x, y, z, ModBlocks.get("ceiling"));
	}

	/** Recessed downlights (and an optional fan) on a 4-block grid wherever the ceiling finish is free. */
	public static void ceilingLights(RoomGrid g, boolean fan) {
		int cx = (g.x0 + g.x1) / 2;
		int cz = (g.z0 + g.z1) / 2;
		boolean fanPlaced = !fan;
		for (int x = g.x0 + (g.w() <= 4 ? (g.w() - 1) / 2 : 1); x <= g.x1; x += 4) {
			for (int z = g.z0 + (g.d() <= 4 ? (g.d() - 1) / 2 : 1); z <= g.z1; z += 4) {
				if (!g.in(x, z)) {
					continue;
				}
				int y = g.ceiling(x, z);
				if (!isCeilingFinish(g, x, y, z) || !g.c.isAirOrUnset(x, y - 1, z)) {
					continue;
				}
				if (!fanPlaced && Math.abs(x - cx) <= 2 && Math.abs(z - cz) <= 2 && y <= 5) {
					g.c.set(x, y, z, ModBlocks.CEILING_FAN);
					fanPlaced = true;
				} else {
					g.c.set(x, y, z, isTileCeiling(g, x, y, z) ? ModBlocks.CEILING_LED_PANEL : ModBlocks.CEILING_DOWNLIGHT);
				}
			}
		}
		if (g.area() >= 9) {
			int[] p = g.centre();
			int y = g.ceiling(p[0], p[1]);
			if (isCeilingFinish(g, p[0], y, p[1])) {
				g.c.set(p[0], y, p[1], ModBlocks.SMOKE_DETECTOR);
			}
		}
	}

	/** Snake plant shortcut (kept as a method so palette changes stay in one place). */
	static Block POTTED_SNAKE_PLANT() {
		return ModBlocks.get("potted_snake");
	}
}
