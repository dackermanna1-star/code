package com.jjkshowdown.mixin.client;

import net.minecraft.client.Camera;
import net.minecraft.world.phys.Vec3;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(Camera.class)
public interface CameraAccessor {
	@Accessor("detached")
	void jjk$setDetached(boolean detached);

	@Invoker("setPosition")
	void jjk$setPosition(Vec3 pos);

	@Invoker("setRotation")
	void jjk$setRotation(float yaw, float pitch);
}
