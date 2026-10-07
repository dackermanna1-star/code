package dev.visceral.client.mixin;

import dev.visceral.client.ragdoll.RagdollManager;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** No vanilla "poof" cloud when a ragdolled creature is removed: the corpse stays. */
@Mixin(LivingEntity.class)
abstract class LivingEntityClientMixin {
	@Inject(method = "makePoofParticles", at = @At("HEAD"), cancellable = true, require = 0)
	private void visceral$keepCorpse(CallbackInfo ci) {
		LivingEntity self = (LivingEntity) (Object) this;
		if (self.level().isClientSide() && RagdollManager.get().get(self) != null) {
			ci.cancel();
		}
	}
}
