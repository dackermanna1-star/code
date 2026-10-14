package net.abyssaldescent.world;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.zone.Zone;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

public final class DungeonDimension {
	public static final ResourceKey<Level> LEVEL = ResourceKey.create(Registries.DIMENSION, AbyssalDescent.id("the_depths"));

	private DungeonDimension() {
	}

	public static boolean isDungeon(@Nullable Level level) {
		return level != null && level.dimension() == LEVEL;
	}

	@Nullable
	public static ServerLevel level(MinecraftServer server) {
		return server.getLevel(LEVEL);
	}

	/** Floor number for a position in the dungeon, clamped to 1..30 (0 outside the dungeon). */
	public static int floorAt(Level level, BlockPos pos) {
		if (!isDungeon(level)) {
			return 0;
		}
		return Math.max(1, Math.min(Zone.MAX_FLOOR, DungeonCoords.floorOf(pos.getZ())));
	}
}
