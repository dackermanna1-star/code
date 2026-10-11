package net.earthscapes.mixin;

import net.earthscapes.block.SandLayerBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.NaturalSpawner;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Animals placed while chunks generate stand on top of the heightmap, which looks through the
 * Sahara's sand drifts (they are not solid, like snow layers); the spawn box then collides with
 * the drift and nothing would ever spawn on the dunes. Lift such positions onto the drift.
 */
@Mixin(NaturalSpawner.class)
public abstract class NaturalSpawnerMixin {
	@Inject(method = "getTopNonCollidingPos", at = @At("RETURN"), cancellable = true)
	private static void earthscapes$standOnSandDrifts(LevelReader level, EntityType<?> type, int x, int z, CallbackInfoReturnable<BlockPos> cir) {
		BlockPos pos = cir.getReturnValue();
		if (level.getBlockState(pos).getBlock() instanceof SandLayerBlock) {
			cir.setReturnValue(pos.above());
		}
	}
}
