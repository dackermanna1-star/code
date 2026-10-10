package com.blademode.test.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * Test environment only. The client gametest harness runs client and server in lock-step; with
 * software rendering each step takes longer than a server tick, so the server is always "behind"
 * and vanilla never gives chunk loading any idle time. Let chunk tasks run regardless.
 */
@Mixin(MinecraftServer.class)
public abstract class MinecraftServerTestMixin {
	@ModifyExpressionValue(method = "pollTaskInternal", at = @At(value = "INVOKE", target = "Lnet/minecraft/server/MinecraftServer;haveTime()Z"))
	private boolean blademodeTest$alwaysPollChunks(boolean original) {
		return true;
	}
}
