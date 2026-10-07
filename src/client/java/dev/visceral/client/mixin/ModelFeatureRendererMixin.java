package dev.visceral.client.mixin;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.visceral.client.VisceralRenderHooks;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.OutlineBufferSource;
import net.minecraft.client.renderer.SubmitNodeStorage;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.rendertype.RenderType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Deferred model rendering re-poses every model; ragdoll overrides have to be re-applied after that. */
@Mixin(ModelFeatureRenderer.class)
abstract class ModelFeatureRendererMixin {
	@Inject(
		method = "renderModel",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/model/Model;setupAnim(Ljava/lang/Object;)V", shift = At.Shift.AFTER)
	)
	private void visceral$afterPose(SubmitNodeStorage.ModelSubmit<?> submit, RenderType renderType, VertexConsumer consumer,
		OutlineBufferSource outlines, MultiBufferSource.BufferSource crumbling, CallbackInfo ci) {
		VisceralRenderHooks.afterFlushPose(submit.model(), submit.state(), submit.pose());
	}
}
