package com.ordnance.test.mixin;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.world.ServerWorld;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Test-only. Vanilla runs queued chunk-loading tasks in the spare time left in each 50 ms tick. Client game tests
 * run the server in lockstep with the client, so when frames take longer than a tick (software rendering on CI)
 * there is never spare time and chunks never finish loading. Drain the queue every tick instead.
 */
@Mixin(MinecraftServer.class)
public abstract class MinecraftServerMixin {
	@Inject(method = "runTasksTillTickEnd", at = @At("HEAD"))
	private void ordnanceTest$drainChunkTasks(CallbackInfo ci) {
		for (ServerWorld world : ((MinecraftServer)(Object)this).getWorlds()) {
			while (world.getChunkManager().executeQueuedTasks()) {
				// Keep going until the chunk executor is empty.
			}
		}
	}
}
