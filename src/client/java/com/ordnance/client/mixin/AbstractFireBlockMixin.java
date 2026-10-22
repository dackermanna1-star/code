package com.ordnance.client.mixin;

import com.ordnance.client.fx.FireAmbience;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.BlockState;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Embers, flame licks and thick smoke for fire (vanilla fire, soul fire and burning fuel). */
@Mixin(AbstractFireBlock.class)
public abstract class AbstractFireBlockMixin {
	@Inject(method = "randomDisplayTick", at = @At("TAIL"))
	private void ordnance$fireAmbience(BlockState state, World world, BlockPos pos, Random random, CallbackInfo ci) {
		FireAmbience.fireTick(state, world, pos, random);
	}
}
