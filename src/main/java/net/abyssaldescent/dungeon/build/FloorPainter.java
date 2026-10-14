package net.abyssaldescent.dungeon.build;

import net.abyssaldescent.dungeon.layout.Box;
import net.abyssaldescent.dungeon.layout.Corridor;
import net.abyssaldescent.dungeon.layout.Fixture;
import net.abyssaldescent.dungeon.layout.FloorLayout;
import net.abyssaldescent.dungeon.layout.Room;
import net.abyssaldescent.world.DungeonCoords;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.WorldGenLevel;

/**
 * Paints the part of a floor that falls inside one chunk. Every step is a pure function of the layout, so each chunk
 * paints its slice independently and the seams line up.
 */
public final class FloorPainter {
	/** How far decoration may reach outside a room's shell (wall niches, chandelier arms are inside). */
	private static final int DECORATION_MARGIN = 2;

	private FloorPainter() {
	}

	public static void paintChunk(WorldGenLevel level, ChunkPos chunkPos, FloorLayout layout) {
		Box bounds = layout.bounds();
		Box chunkBox = new Box(chunkPos.getMinBlockX(), level.getMinY(), chunkPos.getMinBlockZ(), chunkPos.getMaxBlockX(), level.getMaxY(),
			chunkPos.getMaxBlockZ());
		Box mass = new Box(bounds.minX() - 3, DungeonCoords.FLOOR_Y - 4, bounds.minZ() - 3, bounds.maxX() + 3, bounds.maxY() + 3, bounds.maxZ() + 3);
		if (!mass.intersectsXZ(chunkBox)) {
			return;
		}
		ZoneStyle style = ZoneStyles.forZone(layout.zone());
		BlockSink sink = new ClippedSink(level, chunkBox);

		sink.forEach(mass, (x, y, z) -> sink.set(x, y, z, style.mass(x, y, z)));

		for (Room room : layout.rooms()) {
			if (room.shell().intersectsXZ(chunkBox)) {
				style.paintRoomShell(sink, room, layout);
			}
		}
		for (Corridor corridor : layout.corridors()) {
			if (corridor.bounds().inflate(1).intersectsXZ(chunkBox)) {
				style.paintCorridorShell(sink, corridor, layout);
			}
		}
		for (Room room : layout.rooms()) {
			if (room.interior().intersectsXZ(chunkBox)) {
				style.carveRoom(sink, room);
			}
		}
		for (Corridor corridor : layout.corridors()) {
			if (corridor.bounds().intersectsXZ(chunkBox)) {
				style.carveCorridor(sink, corridor);
			}
		}
		for (Room room : layout.rooms()) {
			if (room.shell().inflateXZ(DECORATION_MARGIN).intersectsXZ(chunkBox)) {
				style.decorateRoom(sink, room, layout);
			}
		}
		for (Corridor corridor : layout.corridors()) {
			if (corridor.bounds().inflate(DECORATION_MARGIN).intersectsXZ(chunkBox)) {
				style.decorateCorridor(sink, corridor, layout);
			}
		}
		for (Room room : layout.rooms()) {
			for (Fixture fixture : room.fixtures()) {
				if (chunkBox.inflateXZ(1).containsXZ(fixture.pos().getX(), fixture.pos().getZ())) {
					style.placeFixture(sink, fixture, layout);
				}
			}
		}
		for (Corridor corridor : layout.corridors()) {
			for (Fixture fixture : corridor.fixtures()) {
				if (chunkBox.containsXZ(fixture.pos().getX(), fixture.pos().getZ())) {
					style.placeFixture(sink, fixture, layout);
				}
			}
		}
	}
}
