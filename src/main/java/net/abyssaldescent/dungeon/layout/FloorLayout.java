package net.abyssaldescent.dungeon.layout;

import java.util.List;
import net.abyssaldescent.dungeon.zone.Zone;
import net.minecraft.core.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * The complete, immutable plan of one floor. Generated deterministically by {@link LayoutGenerator}, consumed by the
 * chunk generator (to paint blocks) and by server logic (to know where rooms, doors and fixtures are).
 */
public final class FloorLayout {
	private final int slot;
	private final int floor;
	private final Zone zone;
	private final long seed;
	private final List<Room> rooms;
	private final List<Corridor> corridors;
	private final int startRoom;
	private final int exitRoom;
	private final List<Integer> arenaRooms;
	private final Box bounds;

	FloorLayout(int slot, int floor, Zone zone, long seed, List<Room> rooms, List<Corridor> corridors, int startRoom, int exitRoom,
		List<Integer> arenaRooms) {
		this.slot = slot;
		this.floor = floor;
		this.zone = zone;
		this.seed = seed;
		this.rooms = List.copyOf(rooms);
		this.corridors = List.copyOf(corridors);
		this.startRoom = startRoom;
		this.exitRoom = exitRoom;
		this.arenaRooms = List.copyOf(arenaRooms);
		Box b = null;
		for (Room room : rooms) {
			b = b == null ? room.shell() : b.encapsulate(room.shell());
		}
		for (Corridor corridor : corridors) {
			b = b.encapsulate(corridor.bounds().inflate(1));
		}
		this.bounds = b;
	}

	public int slot() {
		return slot;
	}

	public int floor() {
		return floor;
	}

	public Zone zone() {
		return zone;
	}

	public long seed() {
		return seed;
	}

	public List<Room> rooms() {
		return rooms;
	}

	public List<Corridor> corridors() {
		return corridors;
	}

	public Room room(int id) {
		return rooms.get(id);
	}

	public Room startRoom() {
		return rooms.get(startRoom);
	}

	public Room exitRoom() {
		return rooms.get(exitRoom);
	}

	public List<Integer> arenaRooms() {
		return arenaRooms;
	}

	public boolean isBossFloor() {
		return !arenaRooms.isEmpty();
	}

	/** Union of every shell; everything outside is untouched void. */
	public Box bounds() {
		return bounds;
	}

	/** Where players arrive: centre of the start room, facing north (the direction of progress). */
	public BlockPos spawnPos() {
		Room start = startRoom();
		return new BlockPos(start.interior().centerX(), start.floorY(), start.interior().centerZ() + 1);
	}

	@Nullable
	public Room roomAt(BlockPos pos) {
		for (Room room : rooms) {
			if (room.interior().contains(pos)) {
				return room;
			}
		}
		return null;
	}

	@Nullable
	public Room roomContainingXZ(double x, double z) {
		int bx = (int) Math.floor(x);
		int bz = (int) Math.floor(z);
		for (Room room : rooms) {
			if (room.interior().containsXZ(bx, bz)) {
				return room;
			}
		}
		return null;
	}

	public int encounterRoomCount() {
		int n = 0;
		for (Room room : rooms) {
			if (room.type().countsForProgress()) {
				n++;
			}
		}
		return n;
	}
}
