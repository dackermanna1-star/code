package net.abyssaldescent.mixin;

import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.ServerExplosion;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Explosions inside the dungeon never destroy its architecture (they still damage and knock back entities). */
@Mixin(ServerExplosion.class)
public abstract class ServerExplosionMixin {
	@Shadow
	@Final
	private ServerLevel level;

	@Inject(method = "interactsWithBlocks", at = @At("HEAD"), cancellable = true)
	private void abyssal_descent$keepDungeonIntact(CallbackInfoReturnable<Boolean> cir) {
		if (DungeonDimension.isDungeon(level)) {
			cir.setReturnValue(false);
		}
	}
}
