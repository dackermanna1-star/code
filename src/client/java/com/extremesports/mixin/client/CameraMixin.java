package com.extremesports.mixin.client;

import com.extremesports.client.camera.CameraEffects;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
	@Shadow
	protected abstract void move(float forward, float up, float left);

	@Inject(method = "setup", at = @At("TAIL"))
	private void extremesports$crouchDip(Level level, Entity entity, boolean detached, boolean mirrored, float partialTick, CallbackInfo ci) {
		if (!detached) {
			float offset = CameraEffects.eyeOffset(partialTick);
			if (offset != 0.0F) {
				move(0.0F, offset, 0.0F);
			}
		}
	}
}
