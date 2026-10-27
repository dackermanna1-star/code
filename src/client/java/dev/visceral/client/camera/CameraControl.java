package dev.visceral.client.camera;

import net.minecraft.world.phys.Vec3;

/** Implemented by {@code Camera} via mixin. */
public interface CameraControl {
	void visceral$setRotation(float yaw, float pitch);

	void visceral$setPosition(Vec3 pos);
}
