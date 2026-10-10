package dev.overkill.gametest.mixin;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Test-only: on a slow (software-rendered) machine the gametest-synchronised server is always "behind
 * schedule", so vanilla never finds spare time to process chunk loading before the player joins and
 * world creation stalls. Always let the server's task loop drain chunk work.
 */
@Mixin(MinecraftServer.class)
public abstract class MinecraftServerMixin {
	@Inject(method = "pollTaskInternal", at = @At("RETURN"), cancellable = true)
	private void overkillTest$alwaysPollChunks(CallbackInfoReturnable<Boolean> cir) {
		if (!cir.getReturnValueZ()) {
			for (ServerLevel level : ((MinecraftServer) (Object) this).getAllLevels()) {
				if (level.getChunkSource().pollTask()) {
					cir.setReturnValue(true);
					return;
				}
			}
		}
	}
}
