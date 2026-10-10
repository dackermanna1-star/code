package dev.overkill.client.mixin;

import dev.overkill.client.fx.CameraShake;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Applies {@link CameraShake} on top of the normal camera orientation each frame. */
@Mixin(Camera.class)
public abstract class CameraMixin {
	@Shadow
	private float xRot;

	@Shadow
	private float yRot;

	@Shadow
	protected abstract void setRotation(float yRot, float xRot);

	@Inject(method = "setup", at = @At("TAIL"))
	private void overkill$applyShake(Level level, Entity entity, boolean detached, boolean mirrored, float partialTick, CallbackInfo ci) {
		float[] offsets = CameraShake.offsets(partialTick);
		if (offsets != null) {
			this.setRotation(this.yRot + offsets[0], this.xRot + offsets[1]);
		}
	}
}
