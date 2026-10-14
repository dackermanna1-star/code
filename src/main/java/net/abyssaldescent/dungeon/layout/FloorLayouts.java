package net.abyssaldescent.dungeon.layout;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import java.util.concurrent.ExecutionException;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.world.DungeonCoords;
import org.jetbrains.annotations.Nullable;

/** Thread-safe cache of generated layouts shared by chunk generation workers and the server thread. */
public final class FloorLayouts {
	private record Key(long seed, int slot, int floor) {
	}

	private static final Cache<Key, FloorLayout> CACHE = CacheBuilder.newBuilder().maximumSize(64).build();

	private FloorLayouts() {
	}

	public static FloorLayout get(long worldSeed, int slot, int floor) {
		try {
			return CACHE.get(new Key(worldSeed, slot, floor), () -> LayoutGenerator.generate(worldSeed, slot, floor));
		} catch (ExecutionException e) {
			throw new IllegalStateException("Failed to generate floor " + floor + " of slot " + slot, e.getCause());
		}
	}

	/** True if the floor exists (inside the valid range and its zone is implemented). */
	public static boolean isGeneratedFloor(int slot, int floor) {
		return slot >= 0 && slot <= DungeonCoords.MAX_SLOT && floor >= 1 && floor <= Math.min(Zone.MAX_FLOOR, Zone.deepestImplementedFloor());
	}

	@Nullable
	public static FloorLayout forBlock(long worldSeed, int x, int z) {
		int slot = DungeonCoords.slotOf(x);
		int floor = DungeonCoords.floorOf(z);
		return isGeneratedFloor(slot, floor) ? get(worldSeed, slot, floor) : null;
	}
}
