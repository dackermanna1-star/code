package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.ScreenFx;
import com.jjkshowdown.client.cinematic.CameraDirector;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.util.Mth;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
	private void jjk$fov(Camera camera, float partial, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
		if (CameraDirector.isActive()) {
			cir.setReturnValue(CameraDirector.fov());
			return;
		}
		float fov = cir.getReturnValueF();
		float slow = ScreenFx.slowMo(partial);
		if (slow > 0) fov *= 1f - 0.12f * slow;
		if (ClientState.isOverloaded()) fov *= 1f + 0.06f * Mth.sin((camera.entity().tickCount + partial) * 0.4f);
		cir.setReturnValue(fov);
	}
}
