package net.abyssaldescent.dungeon.build.forgotten;

import net.abyssaldescent.dungeon.build.BlockSink;
import net.abyssaldescent.dungeon.build.Palette;
import net.abyssaldescent.dungeon.build.Shapes;
import net.abyssaldescent.dungeon.build.ZoneStyle;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Corridor;
import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.util.Seeds;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Floors 1–5. Ancient ruins: weathered stone brick halls with tuff masonry, dark deepslate vaults lost in fog, soul
 * lanterns and candlelight, bones and cobwebs.
 */
public final class ForgottenHallsStyle extends ZoneStyle {
	private static final long SALT = 0xF0A6_07E4L;

	private final Palette massPalette = Palette.of(SALT + 1).add(Blocks.TUFF, 55).add(Blocks.STONE, 30).add(Blocks.DEEPSLATE, 15);
	private final Palette wall = Palette.of(SALT + 2).add(Blocks.STONE_BRICKS, 56).add(Blocks.CRACKED_STONE_BRICKS, 18).add(Blocks.MOSSY_STONE_BRICKS, 20)
		.add(Blocks.TUFF_BRICKS, 6);
	private final Palette floorField = Palette.of(SALT + 3).add(Blocks.STONE_BRICKS, 44).add(Blocks.CRACKED_STONE_BRICKS, 22)
		.add(Blocks.MOSSY_STONE_BRICKS, 12).add(Blocks.POLISHED_ANDESITE, 10).add(Blocks.COBBLESTONE, 7).add(Blocks.MOSSY_COBBLESTONE, 5);
	private final Palette ceiling = Palette.of(SALT + 4).add(Blocks.DEEPSLATE_BRICKS, 55).add(Blocks.CRACKED_DEEPSLATE_BRICKS, 25)
		.add(Blocks.DEEPSLATE_TILES, 20);
	private final Palette corridorFloor = Palette.of(SALT + 5).add(Blocks.TUFF_BRICKS, 40).add(Blocks.STONE_BRICKS, 30).add(Blocks.CRACKED_STONE_BRICKS, 18)
		.add(Blocks.COBBLESTONE, 12);
	private final Palette rubble = Palette.of(SALT + 6).add(Blocks.COBBLESTONE, 40).add(Blocks.MOSSY_COBBLESTONE, 25).add(Blocks.GRAVEL, 15)
		.add(Blocks.CRACKED_STONE_BRICKS, 20);

	private enum Archetype {
		CRYPT_HALL,
		OSSUARY,
		CATACOMB,
		CHAPEL,
		BURIAL_PIT
	}

	@Override
	public BlockState mass(int x, int y, int z) {
		return massPalette.pick(x, y, z);
	}

	// ====================================================================== shells

	@Override
	public void paintRoomShell(BlockSink sink, Room room, FloorLayout layout) {
		Box in = room.interior();
		Box sh = room.shell();
		boolean arena = room.type() == RoomType.BOSS_ARENA;
		sink.forEach(sh, (x, y, z) -> {
			boolean isFloor = y == sh.minY();
			boolean isCeil = y == sh.maxY();
			boolean wallX = x == sh.minX() || x == sh.maxX();
			boolean wallZ = z == sh.minZ() || z == sh.maxZ();
			if (!isFloor && !isCeil && !wallX && !wallZ) {
				return;
			}
			BlockState state;
			if (isFloor) {
				state = arena ? arenaFloor(in, x, z) : roomFloor(room, x, z);
			} else if (isCeil) {
				state = ceiling.pick(x, y, z);
			} else {
				state = roomWall(in, x, y, z, wallX && wallZ, wallX);
			}
			sink.set(x, y, z, state);
		});
	}

	private BlockState roomFloor(Room room, int x, int z) {
		Box in = room.interior();
		if (!in.containsXZ(x, z)) {
			return Blocks.TUFF_BRICKS.defaultBlockState();
		}
		int edge = Math.min(Math.min(x - in.minX(), in.maxX() - x), Math.min(z - in.minZ(), in.maxZ() - z));
		if (edge == 0) {
			return Blocks.POLISHED_TUFF.defaultBlockState();
		}
		int gx = Math.floorMod(x - in.centerX(), 4);
		int gz = Math.floorMod(z - in.centerZ(), 4);
		if (gx == 0 && gz == 0) {
			return Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
		}
		if (gx == 0 || gz == 0) {
			return Seeds.hash01(SALT + 7, x, 0, z) < 0.2F ? Blocks.CRACKED_STONE_BRICKS.defaultBlockState() : Blocks.TUFF_BRICKS.defaultBlockState();
		}
		return floorField.pick(x, Y0 - 1, z);
	}

	/** Concentric rings radiating from the arena centre. */
	private BlockState arenaFloor(Box in, int x, int z) {
		if (!in.containsXZ(x, z)) {
			return Blocks.TUFF_BRICKS.defaultBlockState();
		}
		double dx = x - in.centerX();
		double dz = z - in.centerZ();
		int ring = (int) Math.round(Math.sqrt(dx * dx + dz * dz));
		if (ring <= 1) {
			return Blocks.CHISELED_TUFF.defaultBlockState();
		}
		if (ring == 3 || ring == 9 || ring == 15) {
			return Blocks.POLISHED_TUFF.defaultBlockState();
		}
		if (ring == 4 || ring == 10) {
			return Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
		}
		if (ring > 15) {
			return Blocks.POLISHED_DEEPSLATE.defaultBlockState();
		}
		// Radial spokes of tuff bricks every 45 degrees.
		double angle = Math.toDegrees(Math.atan2(dz, dx));
		double spoke = Math.abs(((angle % 45) + 45) % 45 - 22.5);
		if (spoke > 19 && ring > 4) {
			return Blocks.TUFF_BRICKS.defaultBlockState();
		}
		return floorField.pick(x, Y0 - 1, z);
	}

	private BlockState roomWall(Box in, int x, int y, int z, boolean corner, boolean wallX) {
		if (corner) {
			return y == in.maxY() ? Blocks.CHISELED_TUFF.defaultBlockState() : Blocks.POLISHED_TUFF.defaultBlockState();
		}
		if (y <= in.minY()) {
			return Blocks.TUFF_BRICKS.defaultBlockState();
		}
		int along = wallX ? z - in.centerZ() : x - in.centerX();
		boolean pilaster = Math.floorMod(along, 6) == 3;
		if (y == in.maxY()) {
			return pilaster ? Blocks.CHISELED_TUFF.defaultBlockState() : Blocks.CHISELED_TUFF_BRICKS.defaultBlockState();
		}
		if (pilaster) {
			return Blocks.POLISHED_TUFF.defaultBlockState();
		}
		return wall.pick(x, y, z);
	}

	@Override
	public void paintCorridorShell(BlockSink sink, Corridor corridor, FloorLayout layout) {
		for (Box seg : corridor.segments()) {
			Box sh = seg.inflate(1);
			sink.forEach(sh, (x, y, z) -> {
				if (corridor.containsInterior(x, y, z)) {
					return;
				}
				BlockState state;
				if (y == sh.minY()) {
					state = corridorFloor.pick(x, y, z);
				} else if (y == sh.maxY()) {
					state = ceiling.pick(x, y, z);
				} else if (y == Y0) {
					state = Blocks.TUFF_BRICKS.defaultBlockState();
				} else {
					state = wall.pick(x, y, z);
				}
				sink.set(x, y, z, state);
			});
		}
	}

	// ====================================================================== rooms

	@Override
	public void decorateRoom(BlockSink sink, Room room, FloorLayout layout) {
		RandomSource r = RandomSource.create(room.seed());
		switch (room.type()) {
			case START -> decorateStart(sink, room, layout, r);
			case EXIT -> decorateExit(sink, room, r);
			case TREASURE -> decorateVault(sink, room, r);
			case SECRET -> decorateSecret(sink, room, r);
			case MERCHANT -> decorateCamp(sink, room, r);
			case SHRINE -> decorateShrine(sink, room, r);
			case ANTECHAMBER -> decorateAntechamber(sink, room, r);
			case BOSS_ARENA -> new HollowWardenArena(this, sink, room, r).build();
			case ELITE -> {
				Archetype a = r.nextBoolean() ? Archetype.CRYPT_HALL : Archetype.CHAPEL;
				decorateArchetype(sink, room, r, a);
			}
			case COMBAT -> decorateArchetype(sink, room, r, pickArchetype(room, r));
			case PASSAGE -> decorateArchetype(sink, room, r, r.nextBoolean() ? Archetype.OSSUARY : Archetype.CRYPT_HALL);
			default -> {
			}
		}
		decorateDoorways(sink, room);
	}

	private Archetype pickArchetype(Room room, RandomSource r) {
		Box in = room.interior();
		boolean big = in.sizeX() >= 13 && in.sizeZ() >= 13;
		Archetype[] options = big
			? new Archetype[] {Archetype.CRYPT_HALL, Archetype.OSSUARY, Archetype.CATACOMB, Archetype.CHAPEL, Archetype.BURIAL_PIT}
			: new Archetype[] {Archetype.CRYPT_HALL, Archetype.OSSUARY, Archetype.CHAPEL};
		return options[r.nextInt(options.length)];
	}

	private void decorateArchetype(BlockSink sink, Room room, RandomSource r, Archetype archetype) {
		cornerColumns(sink, room);
		switch (archetype) {
			case CRYPT_HALL -> cryptHall(sink, room, r);
			case OSSUARY -> ossuary(sink, room, r);
			case CATACOMB -> catacomb(sink, room, r);
			case CHAPEL -> chapel(sink, room, r);
			case BURIAL_PIT -> burialPit(sink, room, r);
		}
		dressing(sink, room, r, archetype == Archetype.OSSUARY ? 1.6F : 1.0F);
	}

	/** Polished tuff columns in the four interior corners with a vaulting stair at the top. */
	void cornerColumns(BlockSink sink, Room room) {
		Box in = room.interior();
		int[][] corners = {{in.minX(), in.minZ()}, {in.maxX(), in.minZ()}, {in.minX(), in.maxZ()}, {in.maxX(), in.maxZ()}};
		for (int[] c : corners) {
			if (room.isInFrontOfDoor(c[0], c[1], 2)) {
				continue;
			}
			Shapes.pillar(sink, c[0], c[1], in.minY(), in.maxY(), Blocks.CHISELED_TUFF.defaultBlockState(), Blocks.POLISHED_TUFF.defaultBlockState(),
				Blocks.CHISELED_TUFF.defaultBlockState());
		}
		// Vaulted ceiling edge: upside-down stairs along the top of every wall.
		if (in.sizeY() >= 7) {
			int y = in.maxY();
			for (int x = in.minX() + 1; x < in.maxX(); x++) {
				if (!room.isInFrontOfDoor(x, in.minZ(), 1)) {
					sink.set(x, y, in.minZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.NORTH, true));
				}
				if (!room.isInFrontOfDoor(x, in.maxZ(), 1)) {
					sink.set(x, y, in.maxZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH, true));
				}
			}
			for (int z = in.minZ() + 1; z < in.maxZ(); z++) {
				if (!room.isInFrontOfDoor(in.minX(), z, 1)) {
					sink.set(in.minX(), y, z, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.WEST, true));
				}
				if (!room.isInFrontOfDoor(in.maxX(), z, 1)) {
					sink.set(in.maxX(), y, z, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.EAST, true));
				}
			}
		}
	}

	private void cryptHall(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		boolean alongX = in.sizeX() >= in.sizeZ();
		int length = alongX ? in.sizeX() : in.sizeZ();
		int width = alongX ? in.sizeZ() : in.sizeX();
		int rowOffset = width >= 13 ? 4 : 3;
		BlockState base = Blocks.CHISELED_STONE_BRICKS.defaultBlockState();
		BlockState body = Blocks.POLISHED_TUFF.defaultBlockState();
		BlockState cap = Blocks.CHISELED_TUFF_BRICKS.defaultBlockState();
		for (int i = 2; i < length - 2; i += 4) {
			for (int side = 0; side < 2; side++) {
				int a = (alongX ? in.minX() : in.minZ()) + i;
				int b = side == 0 ? (alongX ? in.minZ() : in.minX()) + rowOffset : (alongX ? in.maxZ() : in.maxX()) - rowOffset;
				int x = alongX ? a : b;
				int z = alongX ? b : a;
				if (room.isInFrontOfDoor(x, z, 3) || room.isReserved(x, z)) {
					continue;
				}
				Shapes.pillar(sink, x, z, in.minY(), in.maxY(), base, body, cap);
				// Flared base made from stairs on the aisle side.
				Direction toAisle = alongX ? (side == 0 ? Direction.SOUTH : Direction.NORTH) : (side == 0 ? Direction.EAST : Direction.WEST);
				sink.set(x + toAisle.getStepX(), in.minY(), z + toAisle.getStepZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, toAisle.getOpposite(), false));
				if (in.sizeY() >= 7 && r.nextFloat() < 0.6F) {
					Direction wallward = toAisle.getOpposite();
					sink.set(x + wallward.getStepX(), in.minY() + 3, z + wallward.getStepZ(),
						Shapes.wallTorch(Blocks.SOUL_WALL_TORCH, wallward));
				}
			}
		}
		// Sarcophagi between the pillars and the walls.
		for (int i = 4; i < length - 3; i += 4) {
			for (int side = 0; side < 2; side++) {
				if (r.nextFloat() < 0.25F) {
					continue;
				}
				int a = (alongX ? in.minX() : in.minZ()) + i - 1;
				int b = side == 0 ? (alongX ? in.minZ() : in.minX()) + 1 : (alongX ? in.maxZ() : in.maxX()) - 1;
				sarcophagus(sink, room, r, alongX ? a : b, alongX ? b : a, alongX ? Direction.EAST : Direction.SOUTH);
			}
		}
		// Worn runner down the aisle.
		int mid = alongX ? in.centerZ() : in.centerX();
		for (int i = 1; i < length - 1; i++) {
			int a = (alongX ? in.minX() : in.minZ()) + i;
			for (int w = -1; w <= 1; w++) {
				int x = alongX ? a : mid + w;
				int z = alongX ? mid + w : a;
				if (room.isReserved(x, z) || Seeds.hash01(room.seed(), x, 1, z) < 0.18F) {
					continue;
				}
				sink.set(x, in.minY(), z, (w == 0 ? Blocks.BLACK_CARPET : Blocks.GRAY_CARPET).defaultBlockState());
			}
		}
		// Chandeliers above the aisle.
		int ceilY = in.maxY() + 1;
		if (in.sizeY() >= 8) {
			for (int i = 3; i < length - 2; i += 6) {
				int a = (alongX ? in.minX() : in.minZ()) + i;
				Shapes.chandelier(sink, alongX ? a : mid, ceilY, alongX ? mid : a, 2, Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
			}
		} else {
			for (int i = 3; i < length - 2; i += 5) {
				int a = (alongX ? in.minX() : in.minZ()) + i;
				Shapes.hangLantern(sink, alongX ? a : mid, ceilY, alongX ? mid : a, 1, Blocks.SOUL_LANTERN);
			}
		}
	}

	/** 3x1 stone coffin with a lid, a skull and candles. */
	void sarcophagus(BlockSink sink, Room room, RandomSource r, int x, int z, Direction axis) {
		for (int i = 0; i < 3; i++) {
			int px = x + axis.getStepX() * i;
			int pz = z + axis.getStepZ() * i;
			if (room.isInFrontOfDoor(px, pz, 3) || room.isReserved(px, pz)) {
				return;
			}
		}
		int y = room.floorY();
		for (int i = 0; i < 3; i++) {
			int px = x + axis.getStepX() * i;
			int pz = z + axis.getStepZ() * i;
			sink.set(px, y, pz, (i == 1 ? Blocks.POLISHED_DEEPSLATE : Blocks.DEEPSLATE_TILES).defaultBlockState());
			sink.set(px, y + 1, pz, Shapes.slab(Blocks.STONE_BRICK_SLAB, false));
		}
		if (r.nextFloat() < 0.6F) {
			sink.set(x, y + 1, z, Shapes.candles(Blocks.CANDLE, 1 + r.nextInt(3)));
		}
		if (r.nextFloat() < 0.4F) {
			int px = x + axis.getStepX() * 2;
			int pz = z + axis.getStepZ() * 2;
			sink.set(px, y + 1, pz, Shapes.skull(r.nextInt(16)));
		}
	}

	private void ossuary(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		// Skull niches cut into the walls.
		int[] heights = in.sizeY() >= 7 ? new int[] {in.minY() + 1, in.minY() + 3} : new int[] {in.minY() + 1};
		for (int x = in.minX() + 1; x < in.maxX(); x++) {
			niche(sink, room, r, x, in.minZ() - 1, Direction.SOUTH, heights);
			niche(sink, room, r, x, in.maxZ() + 1, Direction.NORTH, heights);
		}
		for (int z = in.minZ() + 1; z < in.maxZ(); z++) {
			niche(sink, room, r, in.minX() - 1, z, Direction.EAST, heights);
			niche(sink, room, r, in.maxX() + 1, z, Direction.WEST, heights);
		}
		// Central bone column with skulls set into it.
		int cx = in.centerX();
		int cz = in.centerZ();
		if (!room.isReserved(cx, cz)) {
			for (int y = in.minY(); y <= in.maxY(); y++) {
				sink.set(cx, y, cz, Blocks.BONE_BLOCK.defaultBlockState());
			}
			for (Direction d : Direction.Plane.HORIZONTAL) {
				sink.set(cx + d.getStepX(), in.minY(), cz + d.getStepZ(), Shapes.stair(Blocks.TUFF_BRICK_STAIRS, d.getOpposite(), false));
				int sy = in.minY() + 2 + r.nextInt(Math.max(1, in.sizeY() - 3));
				sink.set(cx + d.getStepX(), sy, cz + d.getStepZ(), Shapes.wallSkull(d));
			}
		}
		// Bone heaps in the corners.
		int[][] heaps = {{in.minX() + 1, in.minZ() + 1}, {in.maxX() - 1, in.maxZ() - 1}, {in.maxX() - 1, in.minZ() + 1}};
		for (int[] h : heaps) {
			if (room.isInFrontOfDoor(h[0], h[1], 3) || room.isReserved(h[0], h[1]) || r.nextFloat() < 0.35F) {
				continue;
			}
			sink.set(h[0], in.minY(), h[1], Blocks.BONE_BLOCK.defaultBlockState());
			sink.set(h[0], in.minY() + 1, h[1], Shapes.skull(r.nextInt(16)));
		}
		Shapes.hangLantern(sink, cx + 3, in.maxY() + 1, cz + 3, 1, Blocks.SOUL_LANTERN);
		Shapes.hangLantern(sink, cx - 3, in.maxY() + 1, cz - 3, 1, Blocks.SOUL_LANTERN);
	}

	/** Cuts a niche into the wall block at (x, z) and fills it with a skull or candles. */
	private void niche(BlockSink sink, Room room, RandomSource r, int x, int z, Direction intoRoom, int[] heights) {
		if (room.isDoorColumn(x, z, 1)) {
			return;
		}
		Box in = room.interior();
		int along = intoRoom.getAxis() == Direction.Axis.Z ? x - in.centerX() : z - in.centerZ();
		if (Math.floorMod(along, 6) == 3 || Math.floorMod(along, 2) != 0) {
			return;
		}
		for (int y : heights) {
			float roll = r.nextFloat();
			if (roll < 0.15F) {
				continue;
			}
			sink.set(x, y, z, BlockSink.AIR);
			if (roll < 0.75F) {
				sink.set(x, y, z, Shapes.skull(Shapes.rotationFacing(intoRoom)));
			} else {
				sink.set(x, y, z, Shapes.candles(Blocks.CANDLE, 1 + r.nextInt(2)));
			}
		}
	}

	private void catacomb(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		boolean alongX = in.sizeX() >= in.sizeZ();
		int width = alongX ? in.sizeZ() : in.sizeX();
		int length = alongX ? in.sizeX() : in.sizeZ();
		boolean tall = r.nextBoolean();
		// Rows of burial walls parallel to the long axis, broken into segments with gaps.
		for (int row = 3; row < width - 3; row += 4) {
			int segmentStart = 3 + r.nextInt(2);
			while (segmentStart < length - 3) {
				int segLen = 2 + r.nextInt(3);
				for (int i = 0; i < segLen && segmentStart + i < length - 3; i++) {
					int a = (alongX ? in.minX() : in.minZ()) + segmentStart + i;
					int b = (alongX ? in.minZ() : in.minX()) + row;
					int x = alongX ? a : b;
					int z = alongX ? b : a;
					if (room.isInFrontOfDoor(x, z, 4) || room.isReserved(x, z)) {
						continue;
					}
					int top = tall ? in.maxY() : in.minY() + 2;
					for (int y = in.minY(); y <= top; y++) {
						boolean nicheRow = y == in.minY() + 1 && Seeds.hash01(room.seed(), x, y, z) < 0.45F;
						sink.set(x, y, z, nicheRow ? Shapes.skull(r.nextInt(16)) : wall.pick(x, y, z));
					}
					if (!tall) {
						sink.set(x, top + 1, z, Shapes.slab(Blocks.STONE_BRICK_SLAB, false));
						if (Seeds.hash01(room.seed(), x, 99, z) < 0.25F) {
							sink.set(x, top + 1, z, Shapes.candles(Blocks.CANDLE, 1 + r.nextInt(3)));
						}
					}
				}
				segmentStart += segLen + 2;
			}
		}
		for (int i = 2; i < length - 1; i += 5) {
			for (int row = 1; row < width - 1; row += 4) {
				int a = (alongX ? in.minX() : in.minZ()) + i;
				int b = (alongX ? in.minZ() : in.minX()) + row;
				Shapes.hangLantern(sink, alongX ? a : b, in.maxY() + 1, alongX ? b : a, r.nextInt(2), Blocks.SOUL_LANTERN);
			}
		}
	}

	private void chapel(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		Direction toAltar = altarDirection(room);
		// Dais along the altar wall.
		int depth = 2;
		for (int x = in.minX() + 1; x < in.maxX(); x++) {
			for (int z = in.minZ() + 1; z < in.maxZ(); z++) {
				int fromWall = distanceToWall(in, x, z, toAltar);
				if (fromWall >= depth || room.isInFrontOfDoor(x, z, 3) || room.isReserved(x, z)) {
					continue;
				}
				sink.set(x, in.minY(), z, fromWall == depth - 1 ? Shapes.stair(Blocks.TUFF_BRICK_STAIRS, toAltar, false) : Blocks.POLISHED_TUFF.defaultBlockState());
			}
		}
		// Altar and flanking statues. The altar wall can hold a doorway too, and this row is where a pulled-in party
		// member lands (two blocks inside the door), so every piece keeps off the approach like the dais does.
		int ax = in.centerX() + toAltar.getStepX() * (toAltar.getAxis() == Direction.Axis.X ? (in.sizeX() / 2 - 1) : 0);
		int az = in.centerZ() + toAltar.getStepZ() * (toAltar.getAxis() == Direction.Axis.Z ? (in.sizeZ() / 2 - 1) : 0);
		boolean altar = !room.isInFrontOfDoor(ax, az, 3) && !room.isReserved(ax, az);
		if (altar) {
			sink.set(ax, in.minY() + 1, az, Blocks.CHISELED_STONE_BRICKS.defaultBlockState());
			sink.set(ax, in.minY() + 2, az, Shapes.candles(Blocks.WHITE_CANDLE, 4));
		}
		Direction side = toAltar.getClockWise();
		for (int s = -1; s <= 1; s += 2) {
			int sx = ax + side.getStepX() * s;
			int sz = az + side.getStepZ() * s;
			if (altar && !room.isInFrontOfDoor(sx, sz, 3) && !room.isReserved(sx, sz)) {
				sink.set(sx, in.minY() + 1, sz, Shapes.candles(Blocks.CANDLE, 2));
			}
			int tx = ax + side.getStepX() * s * 3;
			int tz = az + side.getStepZ() * s * 3;
			if (!room.isInFrontOfDoor(tx, tz, 3) && !room.isReserved(tx, tz)) {
				statue(sink, tx, in.minY() + 1, tz, toAltar.getOpposite());
			}
		}
		// Pews facing the altar, aisle in the middle.
		Direction across = toAltar.getClockWise();
		int pewStart = 4;
		int roomDepth = toAltar.getAxis() == Direction.Axis.Z ? in.sizeZ() : in.sizeX();
		for (int row = pewStart; row < roomDepth - 2; row += 2) {
			for (int w = 2; w <= 4; w++) {
				for (int s = -1; s <= 1; s += 2) {
					int px = in.centerX() - toAltar.getStepX() * (roomDepth / 2 - row) + across.getStepX() * w * s;
					int pz = in.centerZ() - toAltar.getStepZ() * (roomDepth / 2 - row) + across.getStepZ() * w * s;
					if (!in.containsXZ(px, pz) || room.isInFrontOfDoor(px, pz, 3) || room.isReserved(px, pz)) {
						continue;
					}
					if (Seeds.hash01(room.seed(), px, 7, pz) < 0.2F) {
						sink.set(px, in.minY(), pz, rubble.pick(px, in.minY(), pz));
						continue;
					}
					sink.set(px, in.minY(), pz, Shapes.stair(Blocks.DARK_OAK_STAIRS, toAltar.getOpposite(), false));
				}
			}
		}
		// A partial collapse: rubble mound under a broken ceiling.
		int rx = in.minX() + 2 + r.nextInt(Math.max(1, in.sizeX() - 4));
		int rz = in.minZ() + 2 + r.nextInt(Math.max(1, in.sizeZ() - 4));
		rubbleMound(sink, room, r, rx, rz);
		Shapes.chandelier(sink, in.centerX(), in.maxY() + 1, in.centerZ(), Math.max(1, in.sizeY() - 7), Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN,
			Blocks.WHITE_CANDLE);
	}

	private void burialPit(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		Box pit = new Box(in.minX() + 3, in.minY() - 3, in.minZ() + 3, in.maxX() - 3, in.minY() - 1, in.maxZ() - 3);
		// Carve the pit and give it a bone-strewn soul soil floor.
		for (int x = pit.minX(); x <= pit.maxX(); x++) {
			for (int z = pit.minZ(); z <= pit.maxZ(); z++) {
				if (room.isReserved(x, z)) {
					continue;
				}
				sink.set(x, in.minY() - 1, z, BlockSink.AIR);
				sink.set(x, in.minY() - 2, z, BlockSink.AIR);
				float h = Seeds.hash01(room.seed(), x, 0, z);
				sink.set(x, in.minY() - 3, z, h < 0.18F ? Blocks.BONE_BLOCK.defaultBlockState() : Blocks.SOUL_SOIL.defaultBlockState());
				if (h > 0.93F) {
					sink.set(x, in.minY() - 2, z, Shapes.skull(Seeds.hashInt(room.seed(), x, 1, z, 16)));
				}
				boolean rim = x == pit.minX() || x == pit.maxX() || z == pit.minZ() || z == pit.maxZ();
				if (rim) {
					sink.set(x, in.minY() - 4, z, Blocks.TUFF.defaultBlockState());
				}
			}
		}
		// Stair ramps on two sides so nothing gets stuck down there.
		int cx = in.centerX();
		int cz = in.centerZ();
		for (int w = -1; w <= 1; w++) {
			sink.set(cx + w, in.minY() - 1, pit.minZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.NORTH, false));
			sink.set(cx + w, in.minY() - 2, pit.minZ() + 1, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.NORTH, false));
			sink.set(cx + w, in.minY() - 1, pit.maxZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH, false));
			sink.set(cx + w, in.minY() - 2, pit.maxZ() - 1, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH, false));
			sink.set(cx + w, in.minY() - 2, pit.minZ(), Blocks.STONE_BRICKS.defaultBlockState());
			sink.set(cx + w, in.minY() - 2, pit.maxZ(), Blocks.STONE_BRICKS.defaultBlockState());
		}
		// Soul fire smoulders at the centre of the pit: a hazard for anyone knocked in.
		sink.set(cx, in.minY() - 3, cz, Blocks.SOUL_SOIL.defaultBlockState());
		sink.set(cx, in.minY() - 2, cz, Blocks.SOUL_CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true));
		// Low walls around the rim.
		for (int x = pit.minX() - 1; x <= pit.maxX() + 1; x++) {
			for (int z = pit.minZ() - 1; z <= pit.maxZ() + 1; z++) {
				boolean ring = x == pit.minX() - 1 || x == pit.maxX() + 1 || z == pit.minZ() - 1 || z == pit.maxZ() + 1;
				boolean corner = (x == pit.minX() - 1 || x == pit.maxX() + 1) && (z == pit.minZ() - 1 || z == pit.maxZ() + 1);
				if (corner && !room.isInFrontOfDoor(x, z, 2)) {
					sink.set(x, in.minY(), z, Blocks.POLISHED_TUFF_WALL.defaultBlockState());
					sink.set(x, in.minY() + 1, z, Shapes.candles(Blocks.CANDLE, 3));
				} else if (ring && Math.abs(x - cx) > 1 && Math.abs(z - cz) > 1 && Seeds.hash01(room.seed(), x, 3, z) < 0.35F) {
					sink.set(x, in.minY(), z, Shapes.slab(Blocks.STONE_BRICK_SLAB, false));
				}
			}
		}
		Shapes.chandelier(sink, cx, in.maxY() + 1, cz, Math.max(1, in.sizeY() - 6), Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
	}

	/** Weathering pass: cobwebs, moss, hanging moss, skulls, candles and rubble along the edges. */
	void dressing(BlockSink sink, Room room, RandomSource r, float density) {
		Box in = room.interior();
		long s = room.seed();
		int top = in.maxY();
		// Cobwebs in upper corners.
		int[][] corners = {{in.minX(), in.minZ()}, {in.maxX(), in.minZ()}, {in.minX(), in.maxZ()}, {in.maxX(), in.maxZ()}};
		for (int[] c : corners) {
			int dx = c[0] == in.minX() ? 1 : -1;
			int dz = c[1] == in.minZ() ? 1 : -1;
			if (r.nextFloat() < 0.7F) {
				sink.set(c[0] + dx, top - 1, c[1] + dz, Blocks.COBWEB.defaultBlockState());
			}
			if (r.nextFloat() < 0.5F) {
				sink.set(c[0] + dx * 2, top - 1, c[1], Blocks.COBWEB.defaultBlockState());
			}
		}
		for (int x = in.minX() + 1; x < in.maxX(); x++) {
			for (int z = in.minZ() + 1; z < in.maxZ(); z++) {
				if (room.isReserved(x, z)) {
					continue;
				}
				int edge = Math.min(Math.min(x - in.minX(), in.maxX() - x), Math.min(z - in.minZ(), in.maxZ() - z));
				float h = Seeds.hash01(s, x, 5, z);
				// Hanging moss from the vault.
				if (h < 0.022F * density && edge > 1) {
					Shapes.hangingMoss(sink, x, top, z, 1 + Seeds.hashInt(s, x, 6, z, 3));
				}
				if (edge != 1 || room.isInFrontOfDoor(x, z, 3)) {
					continue;
				}
				float g = Seeds.hash01(s, x, 7, z);
				if (g < 0.045F * density) {
					sink.set(x, in.minY(), z, Shapes.skull(Seeds.hashInt(s, x, 8, z, 16)));
				} else if (g < 0.10F * density) {
					sink.set(x, in.minY(), z, Shapes.candles(Blocks.CANDLE, 1 + Seeds.hashInt(s, x, 9, z, 4)));
				} else if (g < 0.2F * density) {
					sink.set(x, in.minY(), z, Blocks.MOSS_CARPET.defaultBlockState());
				} else if (g < 0.235F * density) {
					sink.set(x, in.minY(), z, Shapes.slab(Blocks.COBBLESTONE_SLAB, false));
				} else if (g < 0.25F * density) {
					sink.set(x, in.minY(), z, Blocks.COBWEB.defaultBlockState());
				}
			}
		}
	}

	private void rubbleMound(BlockSink sink, Room room, RandomSource r, int cx, int cz) {
		Box in = room.interior();
		for (int dx = -2; dx <= 2; dx++) {
			for (int dz = -2; dz <= 2; dz++) {
				int x = cx + dx;
				int z = cz + dz;
				if (!in.containsXZ(x, z) || room.isInFrontOfDoor(x, z, 3) || room.isReserved(x, z)) {
					continue;
				}
				int d = Math.abs(dx) + Math.abs(dz);
				if (d <= 1) {
					sink.set(x, in.minY(), z, rubble.pick(x, in.minY(), z));
					if (d == 0) {
						sink.set(x, in.minY() + 1, z, Shapes.slab(Blocks.COBBLESTONE_SLAB, false));
					}
				} else if (d <= 3 && Seeds.hash01(room.seed(), x, 11, z) < 0.5F) {
					sink.set(x, in.minY(), z, Shapes.slab(Blocks.STONE_BRICK_SLAB, false));
				}
			}
		}
	}

	/** A weathered skeletal statue: chiseled plinth, wall-post body, skull head. */
	void statue(BlockSink sink, int x, int y, int z, Direction facing) {
		sink.set(x, y, z, Blocks.CHISELED_STONE_BRICKS.defaultBlockState());
		sink.set(x, y + 1, z, Blocks.STONE_BRICK_WALL.defaultBlockState());
		sink.set(x, y + 2, z, Blocks.STONE_BRICK_WALL.defaultBlockState());
		sink.set(x, y + 3, z, Shapes.skull(Shapes.rotationFacing(facing)));
	}

	private Direction altarDirection(Room room) {
		Direction entry = room.doorways().isEmpty() ? Direction.SOUTH : room.doorways().get(0).facing();
		return entry.getOpposite();
	}

	private static int distanceToWall(Box in, int x, int z, Direction wall) {
		return switch (wall) {
			case NORTH -> z - in.minZ();
			case SOUTH -> in.maxZ() - z;
			case WEST -> x - in.minX();
			default -> in.maxX() - x;
		};
	}

	// ---------------------------------------------------------------- special rooms

	private void decorateStart(BlockSink sink, Room room, FloorLayout layout, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		int cz = in.centerZ();
		// Rune circle where delvers arrive.
		for (int x = cx - 3; x <= cx + 3; x++) {
			for (int z = cz - 3; z <= cz + 3; z++) {
				double d = Math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
				if (d > 2.5 && d < 3.5) {
					sink.set(x, in.minY() - 1, z, Blocks.CHISELED_TUFF_BRICKS.defaultBlockState());
				} else if (d < 1.0) {
					sink.set(x, in.minY() - 1, z, ModBlocks.RUNE_STONE.defaultBlockState());
				}
			}
		}
		// The way back up has long since collapsed.
		Direction back = Direction.SOUTH;
		for (Doorway door : room.doorways()) {
			if (door.facing() == Direction.SOUTH) {
				back = Direction.EAST;
			}
		}
		collapsedStair(sink, room, back, layout.arrivalArea());
		for (int s = -1; s <= 1; s += 2) {
			Direction side = back.getClockWise();
			int bx = cx + side.getStepX() * 3 * s + back.getStepX() * (in.sizeX() / 2 - 2);
			int bz = cz + side.getStepZ() * 3 * s + back.getStepZ() * (in.sizeZ() / 2 - 2);
			if (!room.isInFrontOfDoor(bx, bz, 2)) {
				sink.set(bx, in.minY(), bz, ModBlocks.SOUL_BRAZIER.defaultBlockState());
			}
		}
		Shapes.chandelier(sink, cx, in.maxY() + 1, cz, 1, Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
		dressing(sink, room, r, 0.6F);
	}

	/** Three steps rising against {@code wall}; the lowest are left out where they would reach into the arrival area. */
	private void collapsedStair(BlockSink sink, Room room, Direction wall, Box arrival) {
		Box in = room.interior();
		int cx = in.centerX();
		int cz = in.centerZ();
		Direction up = wall;
		Direction across = wall.getClockWise();
		int baseX = cx + wall.getStepX() * (in.sizeX() / 2 - 2);
		int baseZ = cz + wall.getStepZ() * (in.sizeZ() / 2 - 2);
		for (int step = 0; step < 3; step++) {
			for (int w = -1; w <= 1; w++) {
				int x = baseX + up.getStepX() * step + across.getStepX() * w;
				int z = baseZ + up.getStepZ() * step + across.getStepZ() * w;
				if (!in.containsXZ(x, z) || room.isInFrontOfDoor(x, z, 2) || arrival.containsXZ(x, z)) {
					continue;
				}
				for (int y = in.minY(); y < in.minY() + step; y++) {
					sink.set(x, y, z, Blocks.STONE_BRICKS.defaultBlockState());
				}
				sink.set(x, in.minY() + step, z, Shapes.stair(Blocks.STONE_BRICK_STAIRS, up, false));
				if (step == 2) {
					sink.set(x, in.minY() + step + 1, z, rubble.pick(x, step, z));
					sink.set(x, in.minY() + step + 2, z, rubble.pick(x, step + 1, z));
				}
			}
		}
	}

	private void decorateExit(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		int cz = in.centerZ();
		// Polished ring around the rift and four rune obelisks.
		for (int x = cx - 2; x <= cx + 2; x++) {
			for (int z = cz - 2; z <= cz + 2; z++) {
				if (Math.abs(x - cx) == 2 || Math.abs(z - cz) == 2) {
					sink.set(x, in.minY() - 1, z, Blocks.POLISHED_DEEPSLATE.defaultBlockState());
				}
			}
		}
		int[][] obelisks = {{cx - 3, cz - 3}, {cx + 3, cz - 3}, {cx - 3, cz + 3}, {cx + 3, cz + 3}};
		for (int[] o : obelisks) {
			if (room.isInFrontOfDoor(o[0], o[1], 2)) {
				continue;
			}
			sink.set(o[0], in.minY(), o[1], Blocks.CHISELED_TUFF.defaultBlockState());
			sink.set(o[0], in.minY() + 1, o[1], ModBlocks.RUNE_STONE.defaultBlockState());
			sink.set(o[0], in.minY() + 2, o[1], Blocks.CHISELED_TUFF.defaultBlockState());
			sink.set(o[0], in.minY() + 3, o[1], Shapes.standingLantern(Blocks.SOUL_LANTERN));
		}
		dressing(sink, room, r, 0.7F);
	}

	private void decorateVault(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		// Gilded inlay: a dark runner cross flecked with gold, so the vault reads as rich without glaring in the gloom.
		for (int x = in.minX() + 1; x < in.maxX(); x++) {
			sink.set(x, in.minY() - 1, in.centerZ(), (x & 1) == 0 ? Blocks.GILDED_BLACKSTONE.defaultBlockState()
				: Blocks.POLISHED_BLACKSTONE_BRICKS.defaultBlockState());
		}
		for (int z = in.minZ() + 1; z < in.maxZ(); z++) {
			sink.set(in.centerX(), in.minY() - 1, z, (z & 1) == 0 ? Blocks.GILDED_BLACKSTONE.defaultBlockState()
				: Blocks.POLISHED_BLACKSTONE_BRICKS.defaultBlockState());
		}
		sink.set(in.centerX(), in.minY() - 1, in.centerZ(), Blocks.CHISELED_STONE_BRICKS.defaultBlockState());
		for (var fixture : room.fixtures()) {
			if (fixture.type() == Fixture.Type.RELIQUARY) {
				int x = fixture.pos().getX();
				int z = fixture.pos().getZ();
				for (Direction d : Direction.Plane.HORIZONTAL) {
					int px = x + d.getStepX();
					int pz = z + d.getStepZ();
					if (in.containsXZ(px, pz) && !room.isInFrontOfDoor(px, pz, 2) && !room.isReserved(px, pz)) {
						sink.set(px, in.minY(), pz, d == fixture.facing() ? Blocks.AIR.defaultBlockState() : Shapes.candles(Blocks.YELLOW_CANDLE, 2));
					}
				}
			}
		}
		Shapes.hangLantern(sink, in.centerX(), in.maxY() + 1, in.centerZ(), 1, Blocks.LANTERN);
		dressing(sink, room, r, 0.8F);
	}

	private void decorateSecret(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		int cz = in.centerZ();
		for (int x = cx - 1; x <= cx + 1; x++) {
			for (int z = cz - 1; z <= cz + 1; z++) {
				sink.set(x, in.minY() - 1, z, Blocks.CHISELED_TUFF_BRICKS.defaultBlockState());
			}
		}
		for (int x = in.minX(); x <= in.maxX(); x++) {
			for (int z = in.minZ(); z <= in.maxZ(); z++) {
				if (Seeds.hash01(room.seed(), x, 21, z) < 0.18F && !room.isReserved(x, z) && !room.isInFrontOfDoor(x, z, 2)) {
					sink.set(x, in.maxY(), z, Blocks.COBWEB.defaultBlockState());
				}
			}
		}
		Shapes.hangLantern(sink, cx, in.maxY() + 1, cz, 0, Blocks.SOUL_LANTERN);
		dressing(sink, room, r, 1.4F);
	}

	private void decorateCamp(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		int cz = in.centerZ();
		// Warm light marks the only safe place on the floor.
		int fx = cx + 2;
		int fz = cz + 2;
		sink.set(fx, in.minY(), fz, Blocks.CAMPFIRE.defaultBlockState().setValue(CampfireBlock.LIT, true).setValue(CampfireBlock.SIGNAL_FIRE, false));
		for (Direction d : Direction.Plane.HORIZONTAL) {
			sink.set(fx + d.getStepX(), in.minY(), fz + d.getStepZ(), Shapes.slab(Blocks.COBBLESTONE_SLAB, false));
		}
		for (int x = cx - 2; x <= cx + 2; x++) {
			for (int z = cz - 2; z <= cz; z++) {
				if (!room.isReserved(x, z)) {
					sink.set(x, in.minY(), z, ((x + z) & 1) == 0 ? Blocks.BROWN_CARPET.defaultBlockState() : Blocks.ORANGE_CARPET.defaultBlockState());
				}
			}
		}
		int[][] crates = {{in.minX() + 1, in.minZ() + 1}, {in.minX() + 2, in.minZ() + 1}, {in.minX() + 1, in.minZ() + 2}, {in.maxX() - 1, in.maxZ() - 1}};
		for (int[] c : crates) {
			if (!room.isInFrontOfDoor(c[0], c[1], 3) && !room.isReserved(c[0], c[1])) {
				sink.set(c[0], in.minY(), c[1], Blocks.BARREL.defaultBlockState());
			}
		}
		if (!room.isInFrontOfDoor(in.minX() + 1, in.minZ() + 1, 3)) {
			sink.set(in.minX() + 1, in.minY() + 1, in.minZ() + 1, Shapes.standingLantern(Blocks.LANTERN));
		}
		Shapes.hangLantern(sink, cx, in.maxY() + 1, cz, 2, Blocks.LANTERN);
		Shapes.hangLantern(sink, cx - 3, in.maxY() + 1, cz + 3, 1, Blocks.LANTERN);
		dressing(sink, room, r, 0.4F);
	}

	private void decorateShrine(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		int cz = in.centerZ();
		boolean trials = room.firstFixture(Fixture.Type.ALTAR_OF_TRIALS) != null;
		Block carpet = trials ? Blocks.RED_CARPET : Blocks.PURPLE_CARPET;
		Block candle = trials ? Blocks.RED_CANDLE : Blocks.PURPLE_CANDLE;
		for (int x = cx - 2; x <= cx + 2; x++) {
			for (int z = cz - 2; z <= cz + 2; z++) {
				int d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
				sink.set(x, in.minY() - 1, z, d == 2 ? Blocks.CHISELED_TUFF_BRICKS.defaultBlockState() : Blocks.POLISHED_TUFF.defaultBlockState());
			}
		}
		for (int i = 3; i < Math.max(in.sizeX(), in.sizeZ()) / 2; i++) {
			for (Direction d : Direction.Plane.HORIZONTAL) {
				int x = cx + d.getStepX() * i;
				int z = cz + d.getStepZ() * i;
				if (in.containsXZ(x, z) && !room.isReserved(x, z)) {
					sink.set(x, in.minY(), z, carpet.defaultBlockState());
				}
			}
		}
		int[][] stands = {{cx - 2, cz - 2}, {cx + 2, cz - 2}, {cx - 2, cz + 2}, {cx + 2, cz + 2}};
		for (int[] s : stands) {
			sink.set(s[0], in.minY(), s[1], Blocks.POLISHED_TUFF_WALL.defaultBlockState());
			sink.set(s[0], in.minY() + 1, s[1], Shapes.candles(candle, 3));
		}
		Shapes.chandelier(sink, cx, in.maxY() + 1, cz, Math.max(1, in.sizeY() - 6), Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, candle);
		dressing(sink, room, r, 0.6F);
	}

	private void decorateAntechamber(BlockSink sink, Room room, RandomSource r) {
		Box in = room.interior();
		cornerColumns(sink, room);
		int cx = in.centerX();
		// Statues line the approach to the arena door (north).
		for (int z = in.minZ() + 2; z <= in.maxZ() - 2; z += 3) {
			if (!room.isInFrontOfDoor(in.minX() + 1, z, 2)) {
				statue(sink, in.minX() + 1, in.minY(), z, Direction.EAST);
			}
			if (!room.isInFrontOfDoor(in.maxX() - 1, z, 2)) {
				statue(sink, in.maxX() - 1, in.minY(), z, Direction.WEST);
			}
		}
		for (int z = in.minZ(); z <= in.maxZ(); z++) {
			for (int w = -1; w <= 1; w++) {
				sink.set(cx + w, in.minY() - 1, z, w == 0 ? Blocks.CHISELED_TUFF_BRICKS.defaultBlockState() : Blocks.POLISHED_TUFF.defaultBlockState());
			}
		}
		sink.set(cx - 3, in.minY(), in.minZ() + 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		sink.set(cx + 3, in.minY(), in.minZ() + 1, ModBlocks.SOUL_BRAZIER.defaultBlockState());
		Shapes.chandelier(sink, cx, in.maxY() + 1, in.centerZ(), 3, Blocks.POLISHED_TUFF_WALL, Blocks.SOUL_LANTERN, Blocks.WHITE_CANDLE);
		dressing(sink, room, r, 0.8F);
	}

	/** Arch corners inside each doorway opening. */
	private void decorateDoorways(BlockSink sink, Room room) {
		for (Doorway door : room.doorways()) {
			if (door.secret()) {
				continue;
			}
			int half = door.width() / 2;
			int y = room.floorY() + door.height() - 1;
			for (int s = -1; s <= 1; s += 2) {
				int x = door.x();
				int z = door.z();
				Direction facing;
				if (door.facing().getAxis() == Direction.Axis.X) {
					z += half * s;
					facing = s < 0 ? Direction.NORTH : Direction.SOUTH;
				} else {
					x += half * s;
					facing = s < 0 ? Direction.WEST : Direction.EAST;
				}
				sink.set(x, y, z, Shapes.stair(Blocks.TUFF_BRICK_STAIRS, facing, true));
			}
		}
	}

	// ====================================================================== corridors

	@Override
	public void decorateCorridor(BlockSink sink, Corridor corridor, FloorLayout layout) {
		long s = corridor.seed();
		int top = Y0 + Doorway.HEIGHT - 1;
		for (Box seg : corridor.segments()) {
			boolean alongX = seg.sizeX() >= seg.sizeZ();
			if (seg.sizeX() > 3 && seg.sizeZ() > 3) {
				continue; // wide arena approach: handled by its rooms
			}
			int len = alongX ? seg.sizeX() : seg.sizeZ();
			for (int i = 0; i < len; i++) {
				int a = (alongX ? seg.minX() : seg.minZ()) + i;
				int cx = alongX ? a : seg.centerX();
				int cz = alongX ? seg.centerZ() : a;
				if (insideAnyRoomShell(layout, cx, cz)) {
					continue;
				}
				// Ribbed arches.
				if (Math.floorMod(a, 5) == 0) {
					if (alongX) {
						sink.set(cx, top, seg.minZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.NORTH, true));
						sink.set(cx, top, seg.maxZ(), Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.SOUTH, true));
						sink.set(cx, top + 1, seg.minZ() - 1, Blocks.POLISHED_TUFF.defaultBlockState());
					} else {
						sink.set(seg.minX(), top, cz, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.WEST, true));
						sink.set(seg.maxX(), top, cz, Shapes.stair(Blocks.STONE_BRICK_STAIRS, Direction.EAST, true));
					}
				} else if (Math.floorMod(a, 10) == 7) {
					sink.set(cx, top, cz, Shapes.hangingLantern(Blocks.SOUL_LANTERN));
				}
				for (int w = -1; w <= 1; w += 2) {
					int ex = alongX ? cx : cx + w;
					int ez = alongX ? cz + w : cz;
					float h = Seeds.hash01(s, ex, 3, ez);
					if (h < 0.05F) {
						sink.set(ex, Y0, ez, Blocks.MOSS_CARPET.defaultBlockState());
					} else if (h < 0.075F) {
						sink.set(ex, Y0, ez, Shapes.skull(Seeds.hashInt(s, ex, 4, ez, 16)));
					} else if (h < 0.1F) {
						sink.set(ex, Y0, ez, Shapes.candles(Blocks.CANDLE, 1 + Seeds.hashInt(s, ex, 5, ez, 2)));
					}
					if (Seeds.hash01(s, ex, 6, ez) < 0.07F && Math.floorMod(a, 5) != 0) {
						sink.set(ex, top, ez, Blocks.COBWEB.defaultBlockState());
					}
				}
			}
		}
	}

	private static boolean insideAnyRoomShell(FloorLayout layout, int x, int z) {
		for (Room room : layout.rooms()) {
			if (room.shell().containsXZ(x, z)) {
				return true;
			}
		}
		return false;
	}

	Palette wallPalette() {
		return wall;
	}

	Palette rubblePalette() {
		return rubble;
	}
}
