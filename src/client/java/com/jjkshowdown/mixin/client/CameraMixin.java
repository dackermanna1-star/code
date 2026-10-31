package com.jjkshowdown.mixin.client;

import com.jjkshowdown.client.ScreenFx;
import com.jjkshowdown.client.cinematic.CameraDirector;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
	/** Cinematic camera paths and trauma-based screen shake. */
	@Inject(method = "setup", at = @At("TAIL"))
	private void jjk$setup(Level level, Entity entity, boolean detached, boolean mirror, float partial, CallbackInfo ci) {
		Camera self = (Camera) (Object) this;
		CameraDirector.apply(self, partial);
		float[] shake = ScreenFx.shakeOffsets(partial);
		if (shake != null) {
			CameraAccessor acc = (CameraAccessor) self;
			acc.jjk$setRotation(self.yRot() + shake[0], self.xRot() + shake[1]);
			acc.jjk$setPosition(self.position().add(0, shake[2], 0));
		}
	}
}
