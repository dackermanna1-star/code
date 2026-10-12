package com.extremesports.mixin.client;

import com.extremesports.client.render.RiderRenderHooks;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(PlayerModel.class)
public abstract class PlayerModelMixin {
	@Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;)V", at = @At("TAIL"))
	private void extremesports$riderPose(AvatarRenderState state, CallbackInfo ci) {
		RiderRenderHooks.applyPose((PlayerModel) (Object) this, state);
	}
}
