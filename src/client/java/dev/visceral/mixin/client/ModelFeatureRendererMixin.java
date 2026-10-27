package dev.visceral.mixin.client;

import com.llamalad7.mixinextras.sugar.Local;
import dev.visceral.client.render.RenderHooks;
import net.minecraft.client.model.Model;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.OutlineBufferSource;
import net.minecraft.client.renderer.SubmitNodeStorage;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.rendertype.RenderType;
import com.mojang.blaze3d.vertex.VertexConsumer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Deferred model rendering calls setupAnim right before drawing: re-apply our pose there. */
@Mixin(ModelFeatureRenderer.class)
public abstract class ModelFeatureRendererMixin {
	@Inject(method = "renderModel", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/model/Model;setupAnim(Ljava/lang/Object;)V", shift = At.Shift.AFTER))
	private void visceral$afterSetupAnim(SubmitNodeStorage.ModelSubmit<?> submit, RenderType renderType, VertexConsumer consumer, OutlineBufferSource outline,
		MultiBufferSource.BufferSource buffers, CallbackInfo ci, @Local Model<?> model) {
		RenderHooks.afterSetupAnim(model, submit.state());
	}
}
