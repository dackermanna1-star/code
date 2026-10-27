package dev.visceral.mixin.client;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.visceral.client.render.RenderHooks;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
	@Inject(method = "extractRenderState(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;F)V",
		at = @At("TAIL"))
	private void visceral$extract(LivingEntity entity, LivingEntityRenderState state, float partialTick, CallbackInfo ci) {
		RenderHooks.onExtract((LivingEntityRenderer<?, ?, ?>) (Object) this, entity, state, partialTick);
	}

	@Inject(method = "submit(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/CameraRenderState;)V",
		at = @At("HEAD"))
	private void visceral$captureOrigin(LivingEntityRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera,
		CallbackInfo ci) {
		RenderHooks.captureOrigin(state, poseStack);
	}

	@WrapOperation(method = "submit(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/CameraRenderState;)V",
		at = @At(value = "INVOKE",
			target = "Lnet/minecraft/client/renderer/entity/LivingEntityRenderer;setupRotations(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;FF)V"))
	private void visceral$rootTransform(LivingEntityRenderer<?, ?, ?> self, LivingEntityRenderState state, PoseStack poseStack, float bodyRot, float scale,
		Operation<Void> original) {
		if (RenderHooks.overridesRootYaw(state)) {
			RenderHooks.applyRootYawOverride(state, poseStack);
		} else {
			original.call(self, state, poseStack, bodyRot, scale);
		}
		RenderHooks.applyRoot(state, poseStack);
	}

	@Inject(method = "submit(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/CameraRenderState;)V",
		at = @At(value = "INVOKE",
			target = "Lnet/minecraft/client/renderer/entity/LivingEntityRenderer;isBodyVisible(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;)Z"))
	private void visceral$captureModel(LivingEntityRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera,
		CallbackInfo ci) {
		RenderHooks.captureModelMatrix(state, poseStack);
	}

	@Inject(method = "submit(Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/CameraRenderState;)V",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/model/EntityModel;setupAnim(Ljava/lang/Object;)V", shift = At.Shift.AFTER))
	private void visceral$applyForLayers(LivingEntityRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera,
		CallbackInfo ci) {
		RenderHooks.afterSetupAnim(((LivingEntityRenderer<?, ?, ?>) (Object) this).getModel(), state);
	}
}
