package dev.visceral.mixin.client;

import dev.visceral.client.anim.EntityAnimator;
import dev.visceral.client.config.ClientConfig;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LivingEntity.class)
public abstract class LivingEntityClientMixin {
	/** No death "poof" for bodies that stay behind as ragdoll corpses. */
	@Inject(method = "handleEntityEvent", at = @At("HEAD"), cancellable = true)
	private void visceral$noPoof(byte event, CallbackInfo ci) {
		if (event != 60) return;
		LivingEntity self = (LivingEntity) (Object) this;
		if (!self.level().isClientSide()) return;
		EntityAnimator anim = EntityAnimator.get(self);
		if (anim != null && anim.ragdoll != null && ClientConfig.get().corpseSeconds > 0) ci.cancel();
	}
}
