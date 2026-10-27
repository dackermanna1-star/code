package dev.visceral.mixin.client;

import dev.visceral.client.camera.ShoulderCamera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Over the shoulder, pick what is under the crosshair (from the camera), within real reach. */
@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
	@Shadow
	@Final
	private Minecraft minecraft;

	@Inject(method = "pick(F)V", at = @At("TAIL"))
	private void visceral$shoulderPick(float partialTick, CallbackInfo ci) {
		if (minecraft.player == null || minecraft.getCameraEntity() != minecraft.player) return;
		HitResult hit = ShoulderCamera.pick(minecraft.player, partialTick);
		if (hit == null) return;
		minecraft.hitResult = hit;
		minecraft.crosshairPickEntity = hit instanceof EntityHitResult ehr ? ehr.getEntity() : null;
	}
}
