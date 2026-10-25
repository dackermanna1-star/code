package com.godforge.mixin;

import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(MinecraftServer.class)
public interface MinecraftServerAccessor {
	/** Ticks the server has been without players; it pauses once this reaches pause-when-empty-seconds. */
	@Accessor("emptyTicks")
	void godforge$setEmptyTicks(int ticks);
}
