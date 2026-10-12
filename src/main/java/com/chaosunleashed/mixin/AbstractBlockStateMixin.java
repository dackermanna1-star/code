package com.chaosunleashed.mixin;

import com.chaosunleashed.events.solarflare.RedstoneSuppression;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.BlockState;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.world.BlockView;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Solar Flare: redstone sources output 0 while the flare is active (see {@link RedstoneSuppression}). */
@Mixin(AbstractBlock.AbstractBlockState.class)
public abstract class AbstractBlockStateMixin {
	@Inject(method = "getWeakRedstonePower", at = @At("HEAD"), cancellable = true)
	private void chaosunleashed$suppressWeakPower(BlockView world, BlockPos pos, Direction direction, CallbackInfoReturnable<Integer> cir) {
		if (RedstoneSuppression.shouldSuppress(world, pos, (BlockState) (Object) this)) {
			cir.setReturnValue(0);
		}
	}

	@Inject(method = "getStrongRedstonePower", at = @At("HEAD"), cancellable = true)
	private void chaosunleashed$suppressStrongPower(BlockView world, BlockPos pos, Direction direction, CallbackInfoReturnable<Integer> cir) {
		if (RedstoneSuppression.shouldSuppress(world, pos, (BlockState) (Object) this)) {
			cir.setReturnValue(0);
		}
	}
}
