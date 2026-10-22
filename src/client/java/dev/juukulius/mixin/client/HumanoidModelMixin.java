package dev.juukulius.mixin.client;

import dev.juukulius.client.anim.PoseSnapshot;
import dev.juukulius.client.render.player.JuliusRenderInfo;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Applies Julius's animation pose after the vanilla pose. Because every humanoid model rendered for a player (body,
 * outfit, armor) runs this, all of them move together.
 */
@Mixin(HumanoidModel.class)
public abstract class HumanoidModelMixin {
	@Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/HumanoidRenderState;)V", at = @At("TAIL"))
	private void julius$applyPose(HumanoidRenderState state, CallbackInfo ci) {
		PoseSnapshot pose = state.getData(JuliusRenderInfo.POSE);
		if (pose != null) {
			pose.apply((HumanoidModel<?>) (Object) this);
		}
	}
}
