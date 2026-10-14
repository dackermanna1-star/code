package net.abyssaldescent.dungeon.layout;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import net.abyssaldescent.dungeon.loot.LootTier;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.util.Seeds;
import net.abyssaldescent.world.DungeonCoords;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;

/**
 * Deterministic floor planner. The same {@code (worldSeed, slot, floor)} always yields the same {@link FloorLayout}, on
 * any thread, which is what lets chunk generation and server logic share a plan without storing it.
 *
 * <ol>
 * <li>A main path walks from the bottom row of the grid to the top row (progress always heads north).</li>
 * <li>Branches grow off random cells until the target room count is met; a few extra edges form loops.</li>
 * <li>Rooms get roles (treasure in dead ends, elites far from the start, ...), sizes and doorways.</li>
 * <li>Boss floors attach arenas north of the exit; a secret room may hide behind a crumbling wall.</li>
 * </ol>
 */
public final class LayoutGenerator {
	public static final int CELL = 24;
	private static final int CELL_MARGIN = 3;
	private static final int CELL_SPAN = CELL - 2 * CELL_MARGIN - 1; // usable interior span inside a cell
	private static final int Y0 = DungeonCoords.FLOOR_Y;

	private LayoutGenerator() {
	}

	public static FloorLayout generate(long worldSeed, int slot, int floor) {
		return new Builder(Seeds.floorSeed(worldSeed, slot, floor), slot, floor).build();
	}

	private static final class Builder {
		private final long seed;
		private final int slot;
		private final int floor;
		private final Zone zone;
		private final int local;
		private final boolean bossFloor;
		private final RandomSource rng;
		private final int gridW;
		private final int gridH;
		private final int[][] grid;
		private final List<int[]> cells = new ArrayList<>();
		private final List<int[]> edges = new ArrayList<>();
		private final List<Room> rooms = new ArrayList<>();
		private final List<Corridor> corridors = new ArrayList<>();
		private final List<Integer> arenas = new ArrayList<>();

		Builder(long seed, int slot, int floor) {
			this.seed = seed;
			this.slot = slot;
			this.floor = floor;
			this.zone = Zone.forFloor(floor);
			this.local = zone.localFloor(floor);
			this.bossFloor = Zone.isBossFloor(floor);
			this.rng = RandomSource.create(seed);
			int zi = zone.ordinal();
			this.gridW = 5 + (zi >= 2 ? 1 : 0);
			this.gridH = 5 + (zi >= 4 ? 1 : 0);
			this.grid = new int[gridW][gridH];
			for (int[] col : grid) {
				Arrays.fill(col, -1);
			}
		}

		FloorLayout build() {
			int zi = zone.ordinal();
			int target = bossFloor ? 7 + zi : 8 + local + zi;
			target = Math.min(target, gridW * gridH - 6);

			int mainEnd = growMainPath();
			growBranches(target, bossFloor ? mainEnd : -1);
			addLoops(bossFloor ? mainEnd : -1);

			int[] dist = bfs(0);
			int exit = bossFloor ? mainEnd : farthest(dist);

			for (int i = 0; i < cells.size(); i++) {
				rooms.add(new Room(i, RoomType.COMBAT, cells.get(i)[0], cells.get(i)[1], null, Seeds.mix(seed, 1000 + i)));
			}
			assignRoles(dist, exit);
			int secretFrom = maybeAddSecretRoom();

			for (Room room : rooms) {
				room.setInterior(placeInterior(room));
			}
			for (int[] edge : edges) {
				connect(rooms.get(edge[0]), rooms.get(edge[1]), false);
			}
			if (secretFrom >= 0) {
				connect(rooms.get(secretFrom), rooms.get(rooms.size() - 1), true);
			}
			if (bossFloor) {
				buildArenas(rooms.get(exit));
			}
			for (Room room : rooms) {
				placeFixtures(room);
			}
			for (Corridor corridor : corridors) {
				placeTraps(corridor);
			}
			return new FloorLayout(slot, floor, zone, seed, rooms, corridors, 0, exit, arenas);
		}

		// ------------------------------------------------------------------ graph

		private int addCell(int cx, int cz) {
			int index = cells.size();
			cells.add(new int[] {cx, cz});
			grid[cx][cz] = index;
			return index;
		}

		private void addEdge(int a, int b) {
			edges.add(new int[] {a, b});
		}

		private boolean hasEdge(int a, int b) {
			for (int[] e : edges) {
				if (e[0] == a && e[1] == b || e[0] == b && e[1] == a) {
					return true;
				}
			}
			return false;
		}

		private int growMainPath() {
			int cx = rng.nextInt(gridW);
			int cz = gridH - 1;
			int current = addCell(cx, cz);
			int sideways = 0;
			while (cz > 0) {
				boolean goUp = sideways >= 2 || rng.nextFloat() < 0.5F;
				if (!goUp) {
					int dir = rng.nextBoolean() ? 1 : -1;
					int moved = -1;
					for (int attempt = 0; attempt < 2 && moved < 0; attempt++, dir = -dir) {
						int nx = cx + dir;
						if (nx >= 0 && nx < gridW && grid[nx][cz] < 0) {
							moved = nx;
						}
					}
					if (moved >= 0) {
						int next = addCell(moved, cz);
						addEdge(current, next);
						current = next;
						cx = moved;
						sideways++;
						continue;
					}
				}
				cz--;
				int next = addCell(cx, cz);
				addEdge(current, next);
				current = next;
				sideways = 0;
			}
			return current;
		}

		private void growBranches(int target, int excluded) {
			int attempts = 0;
			while (cells.size() < target && attempts++ < 600) {
				int from = rng.nextInt(cells.size());
				if (from == excluded) {
					continue;
				}
				int[] c = cells.get(from);
				Direction dir = Direction.Plane.HORIZONTAL.getRandomDirection(rng);
				int nx = c[0] + dir.getStepX();
				int nz = c[1] + dir.getStepZ();
				if (nx < 0 || nz < 0 || nx >= gridW || nz >= gridH || grid[nx][nz] >= 0) {
					continue;
				}
				// Keep the boss antechamber's row clear around it so the arena corridor stays isolated.
				if (excluded >= 0 && nz == 0 && Math.abs(nx - cells.get(excluded)[0]) <= 1) {
					continue;
				}
				int next = addCell(nx, nz);
				addEdge(from, next);
			}
		}

		private void addLoops(int excluded) {
			for (int i = 0; i < cells.size(); i++) {
				if (i == excluded) {
					continue;
				}
				int[] c = cells.get(i);
				for (Direction dir : new Direction[] {Direction.EAST, Direction.SOUTH}) {
					int nx = c[0] + dir.getStepX();
					int nz = c[1] + dir.getStepZ();
					if (nx >= gridW || nz >= gridH) {
						continue;
					}
					int j = grid[nx][nz];
					if (j >= 0 && j != excluded && !hasEdge(i, j) && rng.nextFloat() < 0.16F) {
						addEdge(i, j);
					}
				}
			}
		}

		private int[] bfs(int from) {
			int[] dist = new int[cells.size()];
			Arrays.fill(dist, -1);
			ArrayDeque<Integer> queue = new ArrayDeque<>();
			dist[from] = 0;
			queue.add(from);
			while (!queue.isEmpty()) {
				int cur = queue.poll();
				for (int[] e : edges) {
					int other = e[0] == cur ? e[1] : e[1] == cur ? e[0] : -1;
					if (other >= 0 && dist[other] < 0) {
						dist[other] = dist[cur] + 1;
						queue.add(other);
					}
				}
			}
			return dist;
		}

		private int farthest(int[] dist) {
			int best = 0;
			for (int i = 1; i < dist.length; i++) {
				int[] c = cells.get(i);
				int[] b = cells.get(best);
				if (dist[i] > dist[best] || dist[i] == dist[best] && c[1] < b[1]) {
					best = i;
				}
			}
			return best;
		}

		private int degree(int i) {
			int d = 0;
			for (int[] e : edges) {
				if (e[0] == i || e[1] == i) {
					d++;
				}
			}
			return d;
		}

		// ------------------------------------------------------------------ roles

		private void assignRoles(int[] dist, int exit) {
			rooms.get(0).setType(RoomType.START);
			rooms.get(exit).setType(bossFloor ? RoomType.ANTECHAMBER : RoomType.EXIT);

			List<Integer> free = new ArrayList<>();
			for (int i = 1; i < rooms.size(); i++) {
				if (i != exit) {
					free.add(i);
				}
			}
			shuffle(free);

			pick(free, RoomType.TREASURE, true, dist, false);
			if (rng.nextFloat() < 0.3F) {
				pick(free, RoomType.TREASURE, true, dist, false);
			}
			if (local == 2 || local == 4 || bossFloor || rng.nextFloat() < 0.3F) {
				pick(free, RoomType.MERCHANT, false, dist, false);
			}
			if (rng.nextFloat() < 0.45F) {
				pick(free, RoomType.SHRINE, false, dist, false);
			}
			if (floor >= 2 && rng.nextFloat() < 0.35F + 0.1F * local) {
				pick(free, RoomType.ELITE, false, dist, true);
			}
			int combat = 0;
			for (int i : free) {
				// Rooms adjacent to the start stay calm so the player can get their bearings.
				boolean nearStart = dist[i] <= 1;
				if (!nearStart && rng.nextFloat() < 0.78F) {
					rooms.get(i).setType(RoomType.COMBAT);
					combat++;
				} else {
					rooms.get(i).setType(RoomType.PASSAGE);
				}
			}
			if (combat < 2) {
				for (int i : free) {
					if (combat >= 2) {
						break;
					}
					if (rooms.get(i).type() == RoomType.PASSAGE) {
						rooms.get(i).setType(RoomType.COMBAT);
						combat++;
					}
				}
			}
		}

		private void pick(List<Integer> free, RoomType type, boolean preferDeadEnd, int[] dist, boolean preferFar) {
			if (free.isEmpty()) {
				return;
			}
			int chosen = -1;
			if (preferDeadEnd) {
				for (int i : free) {
					if (degree(i) == 1) {
						chosen = i;
						break;
					}
				}
			}
			if (chosen < 0 && preferFar) {
				for (int i : free) {
					if (chosen < 0 || dist[i] > dist[chosen]) {
						chosen = i;
					}
				}
			}
			if (chosen < 0) {
				chosen = free.get(0);
			}
			free.remove(Integer.valueOf(chosen));
			rooms.get(chosen).setType(type);
		}

		private int maybeAddSecretRoom() {
			if (rng.nextFloat() > 0.72F) {
				return -1;
			}
			List<int[]> candidates = new ArrayList<>();
			for (int cx = 0; cx < gridW; cx++) {
				for (int cz = 0; cz < gridH; cz++) {
					if (grid[cx][cz] >= 0) {
						continue;
					}
					for (Direction dir : Direction.Plane.HORIZONTAL) {
						int nx = cx + dir.getStepX();
						int nz = cz + dir.getStepZ();
						if (nx < 0 || nz < 0 || nx >= gridW || nz >= gridH) {
							continue;
						}
						int n = grid[nx][nz];
						if (n < 0) {
							continue;
						}
						RoomType t = rooms.get(n).type();
						if (t == RoomType.COMBAT || t == RoomType.PASSAGE || t == RoomType.TREASURE || t == RoomType.SHRINE) {
							candidates.add(new int[] {cx, cz, n});
						}
					}
				}
			}
			if (candidates.isEmpty()) {
				return -1;
			}
			int[] c = candidates.get(rng.nextInt(candidates.size()));
			int index = addCell(c[0], c[1]);
			rooms.add(new Room(index, RoomType.SECRET, c[0], c[1], null, Seeds.mix(seed, 1000 + index)));
			return c[2];
		}

		// ------------------------------------------------------------------ geometry

		private Box placeInterior(Room room) {
			int w;
			int d;
			int h;
			switch (room.type()) {
				case START -> {
					w = odd(11, 13);
					d = odd(11, 13);
					h = 7;
				}
				case COMBAT -> {
					w = odd(13, 17);
					d = odd(13, 17);
					h = 7 + rng.nextInt(3);
				}
				case ELITE -> {
					w = odd(15, 17);
					d = odd(15, 17);
					h = 9;
				}
				case TREASURE -> {
					w = odd(9, 11);
					d = odd(9, 11);
					h = 6;
				}
				case MERCHANT -> {
					w = odd(11, 13);
					d = odd(11, 13);
					h = 7;
				}
				case SHRINE -> {
					w = odd(11, 13);
					d = odd(11, 13);
					h = 9;
				}
				case SECRET -> {
					w = odd(7, 9);
					d = odd(7, 9);
					h = 5;
				}
				case EXIT -> {
					w = odd(11, 13);
					d = odd(11, 13);
					h = 8;
				}
				case ANTECHAMBER -> {
					w = 13;
					d = odd(11, 13);
					h = 10;
				}
				default -> {
					w = odd(9, 13);
					d = odd(9, 13);
					h = 6;
				}
			}
			int ox = DungeonCoords.gridOriginX(slot) + room.cellX() * CELL;
			int oz = DungeonCoords.gridOriginZ(floor) + room.cellZ() * CELL;
			int minX = ox + CELL_MARGIN + rng.nextInt(CELL_SPAN - w + 1);
			int minZ = oz + CELL_MARGIN + rng.nextInt(CELL_SPAN - d + 1);
			return new Box(minX, Y0, minZ, minX + w - 1, Y0 + h - 1, minZ + d - 1);
		}

		private int odd(int min, int max) {
			int v = min + rng.nextInt(max - min + 1);
			return (v & 1) == 0 ? v + (v + 1 <= max ? 1 : -1) : v;
		}

		private void connect(Room a, Room b, boolean secret) {
			boolean horizontal = a.cellZ() == b.cellZ();
			Room first = horizontal ? (a.cellX() < b.cellX() ? a : b) : (a.cellZ() < b.cellZ() ? a : b);
			Room second = first == a ? b : a;
			Box fi = first.interior();
			Box si = second.interior();
			int y1 = Y0 + Doorway.HEIGHT - 1;
			List<Box> segments = new ArrayList<>();
			int doorFirst;
			int doorSecond;
			if (horizontal) {
				int wallF = fi.maxX() + 1;
				int wallS = si.minX() - 1;
				int lo = Math.max(fi.minZ(), si.minZ()) + 2;
				int hi = Math.min(fi.maxZ(), si.maxZ()) - 2;
				if (lo <= hi && rng.nextFloat() < 0.7F) {
					int z = (lo + hi) / 2 + (hi > lo ? rng.nextInt(hi - lo + 1) - (hi - lo) / 2 : 0);
					segments.add(Box.of(wallF, Y0, z - 1, wallS, y1, z + 1));
					doorFirst = z;
					doorSecond = z;
				} else {
					doorFirst = fi.minZ() + 2 + rng.nextInt(fi.sizeZ() - 4);
					doorSecond = si.minZ() + 2 + rng.nextInt(si.sizeZ() - 4);
					int mid = wallF + 2 + rng.nextInt(Math.max(1, wallS - wallF - 3));
					segments.add(Box.of(wallF, Y0, doorFirst - 1, mid + 1, y1, doorFirst + 1));
					segments.add(Box.of(mid - 1, Y0, Math.min(doorFirst, doorSecond) - 1, mid + 1, y1, Math.max(doorFirst, doorSecond) + 1));
					segments.add(Box.of(mid - 1, Y0, doorSecond - 1, wallS, y1, doorSecond + 1));
				}
				first.addDoorway(new Doorway(wallF, doorFirst, Direction.EAST, Doorway.WIDTH, Doorway.HEIGHT, second.id(), false));
				second.addDoorway(new Doorway(wallS, doorSecond, Direction.WEST, Doorway.WIDTH, Doorway.HEIGHT, first.id(), false));
			} else {
				int wallF = fi.maxZ() + 1;
				int wallS = si.minZ() - 1;
				int lo = Math.max(fi.minX(), si.minX()) + 2;
				int hi = Math.min(fi.maxX(), si.maxX()) - 2;
				if (lo <= hi && rng.nextFloat() < 0.7F) {
					int x = (lo + hi) / 2 + (hi > lo ? rng.nextInt(hi - lo + 1) - (hi - lo) / 2 : 0);
					segments.add(Box.of(x - 1, Y0, wallF, x + 1, y1, wallS));
					doorFirst = x;
					doorSecond = x;
				} else {
					doorFirst = fi.minX() + 2 + rng.nextInt(fi.sizeX() - 4);
					doorSecond = si.minX() + 2 + rng.nextInt(si.sizeX() - 4);
					int mid = wallF + 2 + rng.nextInt(Math.max(1, wallS - wallF - 3));
					segments.add(Box.of(doorFirst - 1, Y0, wallF, doorFirst + 1, y1, mid + 1));
					segments.add(Box.of(Math.min(doorFirst, doorSecond) - 1, Y0, mid - 1, Math.max(doorFirst, doorSecond) + 1, y1, mid + 1));
					segments.add(Box.of(doorSecond - 1, Y0, mid - 1, doorSecond + 1, y1, wallS));
				}
				first.addDoorway(new Doorway(doorFirst, wallF, Direction.SOUTH, Doorway.WIDTH, Doorway.HEIGHT, second.id(), false));
				second.addDoorway(new Doorway(doorSecond, wallS, Direction.NORTH, Doorway.WIDTH, Doorway.HEIGHT, first.id(), false));
			}
			if (secret) {
				// Replace the doorway on the visible side with a secret one (crumbling wall).
				Room visible = first.type() == RoomType.SECRET ? second : first;
				Doorway plain = visible.doorways().get(visible.doorways().size() - 1);
				Doorway hidden = new Doorway(plain.x(), plain.z(), plain.facing(), plain.width(), plain.height(), plain.targetRoom(), true);
				visible.replaceLastDoorway(hidden);
				hidden.forEachOpeningBlock(Y0, pos -> visible.addFixture(Fixture.of(Fixture.Type.CRUMBLING_WALL, pos, hidden.facing())));
			}
			a.addNeighbour(b.id());
			b.addNeighbour(a.id());
			corridors.add(new Corridor(corridors.size(), a.id(), b.id(), segments, secret, Seeds.mix(seed, 5000 + corridors.size())));
		}

		private void buildArenas(Room antechamber) {
			Box ante = antechamber.interior();
			int ax = ante.centerX();
			Room previous = antechamber;
			int northWall = ante.minZ() - 1;
			int stages = Zone.isMajorBossFloor(floor) ? 2 : 1;
			for (int stage = 0; stage < stages; stage++) {
				boolean major = stage == 1;
				int half = major ? 20 : 16;
				int height = major ? 20 : 16;
				int maxZ = northWall - 10;
				Box interior = new Box(ax - half, Y0, maxZ - 2 * half, ax + half, Y0 + height - 1, maxZ);
				int index = cells.size();
				cells.add(new int[] {-1, -1});
				Room arena = new Room(index, RoomType.BOSS_ARENA, -1, -1 - stage, interior, Seeds.mix(seed, 9000 + stage));
				rooms.add(arena);
				arenas.add(index);
				int width = 5;
				int doorHeight = 6;
				segments(ax, interior.maxZ() + 1, northWall, width, doorHeight, previous, arena);
				previous = arena;
				northWall = interior.minZ() - 1;
			}
		}

		private void segments(int x, int zArenaWall, int zPrevWall, int width, int height, Room previous, Room arena) {
			int half = width / 2;
			List<Box> segs = List.of(Box.of(x - half, Y0, zArenaWall, x + half, Y0 + height - 1, zPrevWall));
			previous.addDoorway(new Doorway(x, zPrevWall, Direction.NORTH, width, height, arena.id(), false));
			arena.addDoorway(new Doorway(x, zArenaWall, Direction.SOUTH, width, height, previous.id(), false));
			previous.addNeighbour(arena.id());
			arena.addNeighbour(previous.id());
			corridors.add(new Corridor(corridors.size(), previous.id(), arena.id(), segs, false, Seeds.mix(seed, 5000 + corridors.size())));
		}

		// ------------------------------------------------------------------ fixtures

		private void placeFixtures(Room room) {
			Box in = room.interior();
			RandomSource r = RandomSource.create(room.seed() ^ 0x5F1A7E5L);
			int cx = in.centerX();
			int cz = in.centerZ();
			switch (room.type()) {
				case EXIT -> room.addFixture(Fixture.of(Fixture.Type.RIFT, new BlockPos(cx, Y0 - 1, cz)));
				case TREASURE -> {
					int count = 1 + (r.nextFloat() < 0.45F ? 1 : 0);
					BlockPos back = farWallCenter(room);
					if (count == 1) {
						room.addFixture(new Fixture(Fixture.Type.RELIQUARY, back, facingInto(room, back), LootTier.TREASURE.ordinal()));
					} else {
						Direction side = facingInto(room, back).getClockWise();
						room.addFixture(new Fixture(Fixture.Type.RELIQUARY, back.relative(side, 2), facingInto(room, back), LootTier.TREASURE.ordinal()));
						room.addFixture(new Fixture(Fixture.Type.RELIQUARY, back.relative(side, -2), facingInto(room, back), LootTier.TREASURE.ordinal()));
					}
					addUrns(room, r, 2 + r.nextInt(3));
				}
				case SECRET -> {
					room.addFixture(new Fixture(Fixture.Type.RELIQUARY, new BlockPos(cx, Y0, cz), Direction.SOUTH, LootTier.SECRET.ordinal()));
					addUrns(room, r, 2 + r.nextInt(2));
				}
				case MERCHANT -> room.addFixture(Fixture.of(Fixture.Type.MERCHANT, new BlockPos(cx, Y0, cz)));
				case SHRINE -> {
					Fixture.Type t = r.nextFloat() < 0.55F ? Fixture.Type.ALTAR_OF_TRIALS : Fixture.Type.CURSED_IDOL;
					room.addFixture(Fixture.of(t, new BlockPos(cx, Y0, cz)));
				}
				case PASSAGE -> addUrns(room, r, 1 + r.nextInt(3));
				case COMBAT, ELITE -> {
					if (r.nextFloat() < 0.6F) {
						addUrns(room, r, 1 + r.nextInt(2));
					}
				}
				case BOSS_ARENA -> {
					room.addFixture(Fixture.of(Fixture.Type.BOSS_SPAWN, new BlockPos(cx, Y0, in.minZ() + 7), Direction.SOUTH));
					room.addFixture(Fixture.of(Fixture.Type.BOSS_REWARD, new BlockPos(cx, Y0 - 1, cz - 3)));
					for (int i = -1; i <= 1; i++) {
						int z = cz + i * 8;
						room.addFixture(Fixture.of(Fixture.Type.MINION_SPAWN, new BlockPos(in.minX() + 2, Y0, z), Direction.EAST));
						room.addFixture(Fixture.of(Fixture.Type.MINION_SPAWN, new BlockPos(in.maxX() - 2, Y0, z), Direction.WEST));
					}
				}
				default -> {
				}
			}
		}

		/** Centre of the interior edge opposite to the first doorway. */
		private BlockPos farWallCenter(Room room) {
			Box in = room.interior();
			Direction entry = room.doorways().isEmpty() ? Direction.SOUTH : room.doorways().get(0).facing();
			return switch (entry) {
				case NORTH -> new BlockPos(in.centerX(), Y0, in.maxZ() - 1);
				case SOUTH -> new BlockPos(in.centerX(), Y0, in.minZ() + 1);
				case WEST -> new BlockPos(in.maxX() - 1, Y0, in.centerZ());
				default -> new BlockPos(in.minX() + 1, Y0, in.centerZ());
			};
		}

		private Direction facingInto(Room room, BlockPos pos) {
			Box in = room.interior();
			int dx = in.centerX() - pos.getX();
			int dz = in.centerZ() - pos.getZ();
			if (Math.abs(dx) > Math.abs(dz)) {
				return dx > 0 ? Direction.EAST : Direction.WEST;
			}
			return dz >= 0 ? Direction.SOUTH : Direction.NORTH;
		}

		private void addUrns(Room room, RandomSource r, int count) {
			Box in = room.interior();
			int[][] corners = {
				{in.minX() + 1, in.minZ() + 1}, {in.maxX() - 1, in.minZ() + 1}, {in.minX() + 1, in.maxZ() - 1}, {in.maxX() - 1, in.maxZ() - 1},
				{in.minX() + 1, in.centerZ() + 2}, {in.maxX() - 1, in.centerZ() - 2}
			};
			int placed = 0;
			int start = r.nextInt(corners.length);
			for (int i = 0; i < corners.length && placed < count; i++) {
				int[] c = corners[(start + i) % corners.length];
				if (room.isInFrontOfDoor(c[0], c[1], 3) || room.isReserved(c[0], c[1])) {
					continue;
				}
				room.addFixture(Fixture.of(Fixture.Type.URN, new BlockPos(c[0], Y0, c[1])));
				placed++;
			}
		}

		private void placeTraps(Corridor corridor) {
			if (corridor.secret()) {
				return;
			}
			RoomType a = rooms.get(corridor.roomA()).type();
			RoomType b = rooms.get(corridor.roomB()).type();
			if (a == RoomType.START || b == RoomType.START || a == RoomType.BOSS_ARENA || b == RoomType.BOSS_ARENA) {
				return;
			}
			RandomSource r = RandomSource.create(corridor.seed() ^ 0x7A9EL);
			float chance = 0.16F + 0.06F * local + 0.03F * zone.ordinal();
			if (r.nextFloat() > chance) {
				return;
			}
			Box seg = corridor.segments().get(0);
			for (Box s : corridor.segments()) {
				if (Math.max(s.sizeX(), s.sizeZ()) > Math.max(seg.sizeX(), seg.sizeZ())) {
					seg = s;
				}
			}
			boolean alongX = seg.sizeX() > seg.sizeZ();
			int length = alongX ? seg.sizeX() : seg.sizeZ();
			if (length < 7) {
				return;
			}
			boolean darts = floor >= 2 && r.nextFloat() < 0.45F;
			int mid = alongX ? seg.centerX() : seg.centerZ();
			if (darts && placeDarts(corridor, seg, alongX, mid, r)) {
				corridor.setTrap(Corridor.Trap.DARTS);
			} else {
				// Also the fallback when no wall block could take a launcher; spikes sit in the floor anywhere.
				corridor.setTrap(Corridor.Trap.SPIKES);
				int rows = 2 + (zone.ordinal() + local >= 4 ? 1 : 0);
				int startRow = mid - rows / 2;
				for (int row = 0; row < rows; row++) {
					for (int w = -1; w <= 1; w++) {
						BlockPos pos = alongX ? new BlockPos(startRow + row, Y0, seg.centerZ() + w) : new BlockPos(seg.centerX() + w, Y0, startRow + row);
						corridor.addFixture(Fixture.of(Fixture.Type.SPIKE_TRAP, pos));
					}
				}
			}
		}

		/** Two wall-mounted dart launchers on opposite walls of {@code seg}, staggered. False if neither found a wall. */
		private boolean placeDarts(Corridor corridor, Box seg, boolean alongX, int mid, RandomSource r) {
			int segMin = alongX ? seg.minX() : seg.minZ();
			int segMax = alongX ? seg.maxX() : seg.maxZ();
			int length = segMax - segMin + 1;
			int first = Integer.MIN_VALUE;
			boolean placed = false;
			for (int i = 0; i < 2; i++) {
				int dir = i == 0 ? -1 : 1;
				int target = mid + dir * (1 + r.nextInt(2));
				// The other legs of a bent corridor open the side walls at the bends and the ends meet the room walls (with
				// their doorways), so slide to the nearest block of this wall that is solid corridor wall, outward first.
				for (int step = 0; step <= 2 * length; step++) {
					int along = target + dir * ((step & 1) == 1 ? (step + 1) / 2 : -step / 2);
					if (along < segMin || along > segMax || along == first) {
						continue;
					}
					BlockPos pos;
					Direction facing;
					if (alongX) {
						boolean north = i == 0;
						pos = new BlockPos(along, Y0 + 1, north ? seg.minZ() - 1 : seg.maxZ() + 1);
						facing = north ? Direction.SOUTH : Direction.NORTH;
					} else {
						boolean west = i == 0;
						pos = new BlockPos(west ? seg.minX() - 1 : seg.maxX() + 1, Y0 + 1, along);
						facing = west ? Direction.EAST : Direction.WEST;
					}
					if (isCorridorWall(corridor, pos, facing)) {
						corridor.addFixture(Fixture.of(Fixture.Type.DART_TRAP, pos, facing));
						first = along;
						placed = true;
						break;
					}
				}
			}
			return placed;
		}

		/** A block of corridor wall: outside every passage and room shell, facing into {@code corridor}. */
		private boolean isCorridorWall(Corridor corridor, BlockPos pos, Direction facing) {
			BlockPos front = pos.relative(facing);
			if (!corridor.containsInterior(front.getX(), front.getY(), front.getZ())) {
				return false;
			}
			for (Corridor c : corridors) {
				if (c.containsInterior(pos.getX(), pos.getY(), pos.getZ())) {
					return false;
				}
			}
			for (Room room : rooms) {
				if (room.shell().contains(pos)) {
					return false;
				}
			}
			return true;
		}

		private void shuffle(List<Integer> list) {
			for (int i = list.size() - 1; i > 0; i--) {
				int j = rng.nextInt(i + 1);
				Integer tmp = list.get(i);
				list.set(i, list.get(j));
				list.set(j, tmp);
			}
		}
	}
}
