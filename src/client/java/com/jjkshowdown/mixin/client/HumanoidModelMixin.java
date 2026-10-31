package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.render.JjkRenderKeys;
import com.jjkshowdown.client.render.model.PoseAnimator;
import net.fabricmc.fabric.api.client.rendering.v1.FabricRenderState;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(HumanoidModel.class)
public abstract class HumanoidModelMixin {
	/** Hand signs, casting stances and guards for players and rivals alike. */
	@Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/HumanoidRenderState;)V", at = @At("TAIL"))
	private void jjk$pose(HumanoidRenderState state, CallbackInfo ci) {
		JjkRenderKeys.VisualData data = ((FabricRenderState) state).getData(JjkRenderKeys.VISUAL);
		if (data != null) PoseAnimator.apply((HumanoidModel<?>) (Object) this, data);
	}
}
