package com.ordnance.client.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.ordnance.client.fx.FireAmbience;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.BlockState;
import net.minecraft.particle.ParticleEffect;
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

	/** The ambience brings its own smoke; vanilla's pixel-art puffs on top of it read as flecks of soot. */
	@WrapOperation(
		method = "randomDisplayTick",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/world/World;addParticleClient(Lnet/minecraft/particle/ParticleEffect;DDDDDD)V")
	)
	private void ordnance$replaceVanillaSmoke(
		World world, ParticleEffect effect, double x, double y, double z, double vx, double vy, double vz, Operation<Void> original
	) {
		if (!FireAmbience.isActive()) {
			original.call(world, effect, x, y, z, vx, vy, vz);
		}
	}
}
