package com.blademode.client.mixin;

import com.blademode.block.CutBlockEntity;
import com.blademode.registry.ModBlocks;
import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Mining particles on a cut block come from the block it used to be. */
@Mixin(ClientLevel.class)
public abstract class ClientLevelMixin {
	@ModifyExpressionValue(method = "addBreakingBlockEffect", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/multiplayer/ClientLevel;getBlockState(Lnet/minecraft/core/BlockPos;)Lnet/minecraft/world/level/block/state/BlockState;"))
	private BlockState blademode$originalState(BlockState state, BlockPos pos, Direction direction) {
		if (state.is(ModBlocks.CUT_BLOCK) && ((ClientLevel) (Object) this).getBlockEntity(pos) instanceof CutBlockEntity be) {
			return be.getOriginal();
		}
		return state;
	}
}
