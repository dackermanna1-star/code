package dev.visceral.client.mixin;

import dev.visceral.client.VisceralRenderHooks;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(EntityRenderer.class)
abstract class EntityRendererMixin<T extends Entity, S extends EntityRenderState> {
	@Inject(
		method = "createRenderState(Lnet/minecraft/world/entity/Entity;F)Lnet/minecraft/client/renderer/entity/state/EntityRenderState;",
		at = @At("RETURN")
	)
	private void visceral$afterExtract(T entity, float partialTick, CallbackInfoReturnable<S> cir) {
		VisceralRenderHooks.afterExtract(entity, cir.getReturnValue(), partialTick);
	}
}
