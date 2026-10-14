package net.abyssaldescent.dev;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Corridor;
import net.abyssaldescent.dungeon.layout.Doorway;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.FloorLayouts;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.dungeon.layout.RoomType;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.world.DungeonDimension;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Development self-test, enabled with {@code -Dabyssal_descent.selftest=true}. Validates layout invariants across many
 * seeds, generates real chunks of several floors, reports timing and block statistics, then stops the server.
 */
public final class SelfTest {
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
		return problems;
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
