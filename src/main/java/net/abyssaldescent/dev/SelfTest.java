package net.abyssaldescent.dev;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.build.BlockSink;
import net.abyssaldescent.dungeon.build.ZoneStyle;
import net.abyssaldescent.dungeon.build.ZoneStyles;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Corridor;
import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.LayoutGenerator;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.world.DungeonDimension;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Development self-test, enabled with {@code -Dabyssal_descent.selftest=true}. Validates layout invariants across many
 * seeds, generates real chunks of several floors, reports timing and block statistics, then stops the server.
 */
public final class SelfTest {
	/** {seed, slot, floor} of layouts that once broke an invariant, validated on top of the world's own floors. */
	private static final long[][] REGRESSIONS = {{-6519408338692630574L, 4, 5}, {-2627029093267243214L, 1, 2}};

	private SelfTest() {
	}

	public static void init() {
		if (!Boolean.getBoolean("abyssal_descent.selftest")) {
			return;
		}
		ServerLifecycleEvents.SERVER_STARTED.register(SelfTest::run);
	}

	private static void run(MinecraftServer server) {
		long seed = server.getWorldData().worldGenOptions().seed();
		int failures = 0;
		int layouts = 0;
		for (int slot = 0; slot < 40; slot++) {
			for (int floor = 1; floor <= Zone.deepestImplementedFloor(); floor++) {
				FloorLayout layout = FloorLayouts.get(seed, slot, floor);
				layouts++;
				failures += validate(layout);
			}
		}
		for (long[] c : REGRESSIONS) {
			layouts++;
			failures += validate(LayoutGenerator.generate(c[0], (int) c[1], (int) c[2]));
		}
		AbyssalDescent.LOGGER.info("[selftest] validated {} layouts, {} problems", layouts, failures);
		print(FloorLayouts.get(seed, 0, 1));
		print(FloorLayouts.get(seed, 0, 5));

		ServerLevel level = DungeonDimension.level(server);
		if (level == null) {
			AbyssalDescent.LOGGER.error("[selftest] dungeon dimension missing!");
		} else {
			for (int floor : new int[] {1, 5}) {
				FloorLayout layout = FloorLayouts.get(seed, 0, floor);
				Box b = layout.bounds();
				long start = System.nanoTime();
				int chunks = 0;
				for (int cx = b.minX() >> 4; cx <= b.maxX() >> 4; cx++) {
					for (int cz = b.minZ() >> 4; cz <= b.maxZ() >> 4; cz++) {
						level.getChunk(cx, cz);
						chunks++;
					}
				}
				long ms = (System.nanoTime() - start) / 1_000_000;
				AbyssalDescent.LOGGER.info("[selftest] floor {}: generated {} chunks in {} ms ({} ms/chunk)", floor, chunks, ms, chunks == 0 ? 0 : ms / chunks);
				BlockPos spawn = layout.spawnPos();
				AbyssalDescent.LOGGER.info("[selftest] floor {} spawn {} : feet={} head={} floor={}", floor, spawn, level.getBlockState(spawn),
					level.getBlockState(spawn.above()), level.getBlockState(spawn.below()));
				Map<String, Integer> counts = new HashMap<>();
				Room start0 = layout.startRoom();
				Box in = start0.shell();
				for (int x = in.minX(); x <= in.maxX(); x++) {
					for (int y = in.minY(); y <= in.maxY(); y++) {
						for (int z = in.minZ(); z <= in.maxZ(); z++) {
							BlockState state = level.getBlockState(new BlockPos(x, y, z));
							counts.merge(BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath(), 1, Integer::sum);
						}
					}
				}
				AbyssalDescent.LOGGER.info("[selftest] floor {} start room blocks: {}", floor, counts);
				for (Room room : layout.rooms()) {
					for (Doorway door : room.doorways()) {
						BlockPos center = new BlockPos(door.x(), room.floorY(), door.z());
						BlockState s = level.getBlockState(center);
						if (!s.isAir() && !door.secret()) {
							AbyssalDescent.LOGGER.warn("[selftest] floor {} room {} {} doorway {} blocked by {}", floor, room.id(), room.type(), center, s);
						}
					}
				}
			}
		}
		if (!Boolean.getBoolean("abyssal_descent.selftest.keep")) {
			server.halt(false);
		}
	}

	private static int validate(FloorLayout layout) {
		int problems = 0;
		List<Room> rooms = layout.rooms();
		for (int i = 0; i < rooms.size(); i++) {
			for (int j = i + 1; j < rooms.size(); j++) {
				if (rooms.get(i).shell().intersects(rooms.get(j).shell())) {
					AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: rooms {} and {} overlap", layout.slot(), layout.floor(), i, j);
					problems++;
				}
			}
		}
		for (Corridor c : layout.corridors()) {
			for (Box seg : c.segments()) {
				for (Room room : rooms) {
					if (room.id() == c.roomA() || room.id() == c.roomB()) {
						continue;
					}
					if (seg.intersects(room.interior())) {
						AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: corridor {} cuts through room {}", layout.slot(), layout.floor(), c.id(),
							room.id());
						problems++;
					}
				}
			}
		}
		boolean hasExit = false;
		for (Room room : rooms) {
			if (room.type() == RoomType.EXIT || room.type() == RoomType.ANTECHAMBER) {
				hasExit = true;
			}
			if (room.doorways().isEmpty()) {
				AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: room {} {} has no doorway", layout.slot(), layout.floor(), room.id(), room.type());
				problems++;
			}
		}
		if (!hasExit) {
			problems++;
		}
		if (Zone.isBossFloor(layout.floor()) && layout.arenaRooms().isEmpty()) {
			problems++;
		}
		problems += validateTraps(layout);
		problems += validateClearance(layout);
		return problems;
	}

	/** Dart launchers must sit in a corridor wall block facing into their passage, never in walkable space or a room. */
	private static int validateTraps(FloorLayout layout) {
		int problems = 0;
		for (Corridor c : layout.corridors()) {
			int darts = 0;
			for (Fixture f : c.fixtures()) {
				if (f.type() != Fixture.Type.DART_TRAP) {
					continue;
				}
				darts++;
				BlockPos pos = f.pos();
				BlockPos front = pos.relative(f.facing());
				String fault = null;
				if (!c.containsInterior(front.getX(), front.getY(), front.getZ())) {
					fault = "does not face into its corridor";
				}
				for (Corridor other : layout.corridors()) {
					if (other.containsInterior(pos.getX(), pos.getY(), pos.getZ())) {
						fault = "stands inside corridor " + other.id();
					}
				}
				for (Room room : layout.rooms()) {
					if (room.shell().contains(pos)) {
						fault = "stands in room " + room.id() + (room.isDoorColumn(pos.getX(), pos.getZ(), 0) ? " doorway" : "");
					}
				}
				if (fault != null) {
					AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: corridor {} dart launcher {} {}", layout.slot(), layout.floor(), c.id(), pos,
						fault);
					problems++;
				}
			}
			if ((darts > 0) != (c.trap() == Corridor.Trap.DARTS)) {
				AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: corridor {} trap {} with {} dart launchers", layout.slot(), layout.floor(), c.id(),
					c.trap(), darts);
				problems++;
			}
		}
		return problems;
	}

	/**
	 * Paints rooms off-world and checks where players get teleported to: the start room's arrival ring and, in rooms that
	 * run encounters, the tile two blocks inside each doorway where party members are pulled in (RunManager.doorInside).
	 */
	private static int validateClearance(FloorLayout layout) {
		int problems = 0;
		ZoneStyle style = ZoneStyles.forZone(layout.zone());
		for (Room room : layout.rooms()) {
			boolean start = room == layout.startRoom();
			boolean pullsIn = room.type().countsForProgress() || room.type() == RoomType.SHRINE;
			if (!start && !pullsIn) {
				continue;
			}
			RecordingSink sink = new RecordingSink(room.shell());
			style.carveRoom(sink, room);
			style.decorateRoom(sink, room, layout);
			for (Fixture f : room.fixtures()) {
				style.placeFixture(sink, f, layout);
			}
			for (Corridor c : layout.corridors()) {
				for (Fixture f : c.fixtures()) {
					style.placeFixture(sink, f, layout);
				}
			}
			if (start) {
				Box arrival = layout.arrivalArea();
				for (int x = arrival.minX(); x <= arrival.maxX(); x++) {
					for (int y = arrival.minY(); y <= arrival.maxY(); y++) {
						for (int z = arrival.minZ(); z <= arrival.maxZ(); z++) {
							BlockPos pos = new BlockPos(x, y, z);
							if (blocksBody(sink.get(pos), pos, y == arrival.minY())) {
								AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: arrival area blocked at {} by {}", layout.slot(), layout.floor(), pos,
									sink.get(pos));
								problems++;
							}
						}
					}
				}
			}
			for (Doorway door : room.doorways()) {
				if (!pullsIn || door.secret()) {
					continue;
				}
				Direction in = door.facing().getOpposite();
				BlockPos feet = new BlockPos(door.x() + in.getStepX() * 2, room.floorY(), door.z() + in.getStepZ() * 2);
				if (blocksBody(sink.get(feet), feet, true) || blocksBody(sink.get(feet.above()), feet.above(), false)) {
					AbyssalDescent.LOGGER.warn("[selftest] slot {} floor {}: room {} {} doorway approach {} blocked by {} / {}", layout.slot(), layout.floor(),
						room.id(), room.type(), feet, sink.get(feet), sink.get(feet.above()));
					problems++;
				}
			}
		}
		return problems;
	}

	/** True if the block would trap part of a player's body; at the feet, carpet-thin coverings are fine to stand in. */
	private static boolean blocksBody(BlockState state, BlockPos pos, boolean feet) {
		VoxelShape shape = state.getCollisionShape(EmptyBlockGetter.INSTANCE, pos);
		return !shape.isEmpty() && (!feet || shape.max(Direction.Axis.Y) > 1.0 / 16.0 + 1.0E-6);
	}

	/** Collects what a painter writes so it can be inspected without a world; unwritten blocks read as air. */
	private static final class RecordingSink implements BlockSink {
		private final Box clip;
		private final Map<Long, BlockState> blocks = new HashMap<>();

		RecordingSink(Box clip) {
			this.clip = clip;
		}

		BlockState get(BlockPos pos) {
			return blocks.getOrDefault(pos.asLong(), BlockSink.AIR);
		}

		@Override
		public void set(int x, int y, int z, BlockState state) {
			if (clip.contains(x, y, z)) {
				blocks.put(BlockPos.asLong(x, y, z), state);
			}
		}

		@Override
		public void configure(int x, int y, int z, Consumer<BlockEntity> configurer) {
		}

		@Override
		public void scheduleTick(int x, int y, int z, int delay) {
		}

		@Override
		public Box clip() {
			return clip;
		}
	}

	private static void print(FloorLayout layout) {
		StringBuilder sb = new StringBuilder("[selftest] floor ").append(layout.floor()).append(" rooms:");
		for (Room room : layout.rooms()) {
			sb.append("\n  #").append(room.id()).append(' ').append(room.type()).append(" cell(").append(room.cellX()).append(',').append(room.cellZ())
				.append(") ").append(room.interior().sizeX()).append('x').append(room.interior().sizeZ()).append('x').append(room.interior().sizeY())
				.append(" doors=").append(room.doorways().size()).append(" fixtures=").append(room.fixtures().size());
		}
		sb.append("\n  corridors=").append(layout.corridors().size());
		AbyssalDescent.LOGGER.info(sb.toString());
	}
}
