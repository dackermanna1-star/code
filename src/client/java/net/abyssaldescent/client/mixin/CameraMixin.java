package net.abyssaldescent.client.mixin;

import net.abyssaldescent.client.fx.CameraShake;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Applies {@link CameraShake} after vanilla has positioned the camera; only the view rotates, never the player. */
@Mixin(Camera.class)
public abstract class CameraMixin {
	@Shadow
	private float xRot;
	@Shadow
	private float yRot;

	@Shadow
	protected abstract void setRotation(float yRot, float xRot);

	@Inject(method = "setup", at = @At("TAIL"))
	private void abyssal_descent$shake(Level level, Entity entity, boolean detached, boolean mirror, float partialTick, CallbackInfo ci) {
		float yaw = CameraShake.yawOffset(partialTick);
		float pitch = CameraShake.pitchOffset(partialTick);
		if (yaw != 0.0F || pitch != 0.0F) {
			setRotation(yRot + yaw, xRot + pitch);
		}
	}
}
