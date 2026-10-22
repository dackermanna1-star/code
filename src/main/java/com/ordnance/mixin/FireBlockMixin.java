package com.ordnance.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.ordnance.fire.FireBehavior;
import net.minecraft.block.BlockState;
import net.minecraft.block.FireBlock;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Charred remains, burn-out scorching, ember jumps and configurable spread speed for vanilla fire. */
@Mixin(FireBlock.class)
public abstract class FireBlockMixin {
	@WrapOperation(
		method = "trySpreadingFire",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/world/World;removeBlock(Lnet/minecraft/util/math/BlockPos;Z)Z")
	)
	private boolean ordnance$leaveRemains(World world, BlockPos pos, boolean move, Operation<Boolean> original) {
		if (world instanceof ServerWorld serverWorld && FireBehavior.leaveRemains(serverWorld, pos, world.getBlockState(pos))) {
			return true;
		}

		return original.call(world, pos, move);
	}

	@WrapOperation(
		method = "scheduledTick",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/server/world/ServerWorld;removeBlock(Lnet/minecraft/util/math/BlockPos;Z)Z")
	)
	private boolean ordnance$burnOut(ServerWorld world, BlockPos pos, boolean move, Operation<Boolean> original) {
		boolean removed = original.call(world, pos, move);
		FireBehavior.afterBurnOut(world, pos);
		return removed;
	}

	@Inject(method = "scheduledTick", at = @At("TAIL"))
	private void ordnance$emberJump(BlockState state, ServerWorld world, BlockPos pos, Random random, CallbackInfo ci) {
		FireBehavior.emberJump(world, pos, random);
	}

	@ModifyReturnValue(method = "getFireTickDelay", at = @At("RETURN"))
	private static int ordnance$spreadSpeed(int delay) {
		return FireBehavior.adjustTickDelay(delay);
	}
}
