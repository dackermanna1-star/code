package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.render.JjkRenderKeys;
import com.jjkshowdown.sorcerer.CastPose;
import net.fabricmc.fabric.api.client.rendering.v1.FabricRenderState;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {
	/** Carry sorcerer visual state (poses, auras) into the render state. */
	@Inject(method = "extractRenderState(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;F)V",
			at = @At("TAIL"))
	private void jjk$extract(LivingEntity entity, LivingEntityRenderState state, float partial, CallbackInfo ci) {
		ClientState.Visual v = ClientState.visual(entity);
		FabricRenderState fs = (FabricRenderState) state;
		if (v == null || (v.pose == CastPose.NONE && v.flags == 0 && v.chargeSlot < 0 && !v.character.isSorcerer())) {
			fs.setData(JjkRenderKeys.VISUAL, null);
			return;
		}
		fs.setData(JjkRenderKeys.VISUAL, new JjkRenderKeys.VisualData(v, v.poseTicks(partial), v.poseProgress(partial), state.ageInTicks));
	}
}
