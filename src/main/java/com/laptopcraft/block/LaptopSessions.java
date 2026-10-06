package com.laptopcraft.block;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Remembers which laptop each player opened last (server side). Packets that carry no position
 * (e.g. Emerald Bank deposits) use it to check the player is actually sitting at a CubeBook.
 */
public final class LaptopSessions {
	private static final Map<UUID, Session> SESSIONS = new HashMap<>();

	private LaptopSessions() {
	}

	public record Session(ResourceKey<Level> dimension, BlockPos pos) {
	}

	public static void open(ServerPlayer player, BlockPos pos) {
		SESSIONS.put(player.getUUID(), new Session(player.level().dimension(), pos.immutable()));
	}

	public static void forget(UUID player) {
		SESSIONS.remove(player);
	}

	public static void clear() {
		SESSIONS.clear();
	}

	/** The laptop the player opened last, if it is still a laptop within {@code range} blocks in their dimension. */
	public static @Nullable BlockPos activeLaptop(ServerPlayer player, double range) {
		Session session = SESSIONS.get(player.getUUID());
		if (session == null || !session.dimension().equals(player.level().dimension())) {
			return null;
		}
		return isLaptopInRange(player, session.pos(), range) ? session.pos() : null;
	}

	/** True if the block at {@code pos} (player's level) is a loaded laptop within {@code range} blocks of the player. */
	public static boolean isLaptopInRange(ServerPlayer player, BlockPos pos, double range) {
		Level level = player.level();
		if (!level.isLoaded(pos) || !(level.getBlockState(pos).getBlock() instanceof LaptopBlock)) {
			return false;
		}
		return player.position().distanceToSqr(Vec3.atCenterOf(pos)) <= range * range;
	}
}
