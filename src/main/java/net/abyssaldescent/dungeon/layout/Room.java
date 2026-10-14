package net.abyssaldescent.dungeon.layout;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.minecraft.core.BlockPos;

/**
 * A room on a floor. The interior box spans the walkable air volume; walls, floor and ceiling are the one-block shell
 * around it.
 */
public final class Room {
	private final int id;
	private RoomType type;
	private final int cellX;
	private final int cellZ;
	private Box interior;
	private final long seed;
	private final List<Doorway> doorways = new ArrayList<>();
	private final List<Fixture> fixtures = new ArrayList<>();
	private final List<Integer> neighbours = new ArrayList<>();

	Room(int id, RoomType type, int cellX, int cellZ, Box interior, long seed) {
		this.id = id;
		this.type = type;
		this.cellX = cellX;
		this.cellZ = cellZ;
		this.interior = interior;
		this.seed = seed;
	}

	public int id() {
		return id;
	}

	public RoomType type() {
		return type;
	}

	void setType(RoomType type) {
		this.type = type;
	}

	public int cellX() {
		return cellX;
	}

	public int cellZ() {
		return cellZ;
	}

	public Box interior() {
		return interior;
	}

	void setInterior(Box interior) {
		this.interior = interior;
	}

	/** Walls, floor and ceiling included. */
	public Box shell() {
		return interior.inflate(1);
	}

	public long seed() {
		return seed;
	}

	public int floorY() {
		return interior.minY();
	}

	public int height() {
		return interior.sizeY();
	}

	public List<Doorway> doorways() {
		return Collections.unmodifiableList(doorways);
	}

	void addDoorway(Doorway doorway) {
		doorways.add(doorway);
	}

	void replaceLastDoorway(Doorway doorway) {
		doorways.set(doorways.size() - 1, doorway);
	}

	public List<Fixture> fixtures() {
		return Collections.unmodifiableList(fixtures);
	}

	void addFixture(Fixture fixture) {
		fixtures.add(fixture);
	}

	public List<Integer> neighbours() {
		return Collections.unmodifiableList(neighbours);
	}

	void addNeighbour(int id) {
		if (!neighbours.contains(id)) {
			neighbours.add(id);
		}
	}

	public BlockPos center() {
		return new BlockPos(interior.centerX(), interior.minY(), interior.centerZ());
	}

	/** True if a fixture occupies the column. Decorators keep these free. */
	public boolean isReserved(int x, int z) {
		for (Fixture fixture : fixtures) {
			BlockPos p = fixture.pos();
			int r = fixture.type() == Fixture.Type.RIFT || fixture.type() == Fixture.Type.BOSS_REWARD ? 2 : 0;
			if (Math.abs(p.getX() - x) <= r && Math.abs(p.getZ() - z) <= r) {
				return true;
			}
		}
		return false;
	}

	/** True if (x, z) on the interior edge is directly in front of a doorway (keeps entrances clear). */
	public boolean isInFrontOfDoor(int x, int z, int depth) {
		for (Doorway door : doorways) {
			int dx = x - door.x();
			int dz = z - door.z();
			switch (door.facing()) {
				case NORTH -> {
					if (Math.abs(dx) <= door.width() / 2 + 1 && dz >= 1 && dz <= depth) {
						return true;
					}
				}
				case SOUTH -> {
					if (Math.abs(dx) <= door.width() / 2 + 1 && dz <= -1 && dz >= -depth) {
						return true;
					}
				}
				case WEST -> {
					if (Math.abs(dz) <= door.width() / 2 + 1 && dx >= 1 && dx <= depth) {
						return true;
					}
				}
				case EAST -> {
					if (Math.abs(dz) <= door.width() / 2 + 1 && dx <= -1 && dx >= -depth) {
						return true;
					}
				}
				default -> {
				}
			}
		}
		return false;
	}

	public boolean isDoorColumn(int wx, int wz, int margin) {
		for (Doorway door : doorways) {
			if (door.coversWallColumn(wx, wz, margin)) {
				return true;
			}
		}
		return false;
	}

	public Fixture firstFixture(Fixture.Type type) {
		for (Fixture fixture : fixtures) {
			if (fixture.type() == type) {
				return fixture;
			}
		}
		return null;
	}
}
