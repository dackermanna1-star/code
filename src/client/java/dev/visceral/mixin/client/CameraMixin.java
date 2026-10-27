package dev.visceral.mixin.client;

import dev.visceral.client.camera.CameraControl;
import dev.visceral.client.camera.ShoulderCamera;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin implements CameraControl {
	@Shadow
	protected abstract void setRotation(float yaw, float pitch);

	@Shadow
	protected abstract void setPosition(Vec3 pos);

	@Override
	public void visceral$setRotation(float yaw, float pitch) {
		setRotation(yaw, pitch);
	}

	@Override
	public void visceral$setPosition(Vec3 pos) {
		setPosition(pos);
	}

	@Inject(method = "setup", at = @At("TAIL"))
	private void visceral$shoulderCamera(Level level, Entity entity, boolean detached, boolean mirrored, float partialTick, CallbackInfo ci) {
		if (detached && !mirrored && ShoulderCamera.active()) ShoulderCamera.update(this, entity, partialTick);
	}
}
