package com.blademode.client.mixin;

import com.blademode.client.gore.CorpseManager;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** No puff of smoke where a cut-up creature disappears: its pieces are still lying there. */
@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin {
	@Inject(method = "makePoofParticles", at = @At("HEAD"), cancellable = true)
	private void blademode$noPoof(CallbackInfo ci) {
		if (CorpseManager.isSliced((LivingEntity) (Object) this)) {
			ci.cancel();
		}
	}
}
