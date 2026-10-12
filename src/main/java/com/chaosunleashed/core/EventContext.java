package com.chaosunleashed.core;

import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import org.jetbrains.annotations.Nullable;

/**
 * Everything an event needs to know when it is created.
 *
 * @param origin  the point the event is centered on (usually the target player's position)
 * @param target  the player the event is aimed at, if any
 * @param manual  true if started by a command or the Control Panel, false if triggered randomly
 */
public record EventContext(ChaosEventType type, ServerWorld world, BlockPos origin, @Nullable ServerPlayerEntity target,
						   int intensity, boolean manual) {
}
