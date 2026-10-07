package dev.visceral.client.mixin;

import dev.visceral.client.ragdoll.Ragdoll;
import dev.visceral.client.ragdoll.RagdollManager;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** A ragdoll can tumble far outside its entity's bounding box: cull against the bodies instead. */
@Mixin(EntityRenderDispatcher.class)
abstract class EntityRenderDispatcherMixin {
	@Inject(method = "shouldRender", at = @At("HEAD"), cancellable = true, require = 0)
	private <E extends Entity> void visceral$cullRagdoll(E entity, Frustum frustum, double x, double y, double z, CallbackInfoReturnable<Boolean> cir) {
		Ragdoll ragdoll = RagdollManager.get().get(entity);
		if (ragdoll != null && ragdoll.isBuilt()) {
			cir.setReturnValue(frustum.isVisible(ragdoll.bounds()));
		}
	}
}
