package dev.juukulius.mixin.client;

import dev.juukulius.client.fx.CameraShake;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Adds the (restrained, optional) impact shake to the view direction only; aim and movement are unaffected. */
@Mixin(Camera.class)
public abstract class CameraMixin {
	@Shadow
	private float xRot;

	@Shadow
	private float yRot;

	@Shadow
	protected abstract void setRotation(float yRot, float xRot);

	@Inject(method = "setup", at = @At("TAIL"))
	private void julius$shake(Level level, Entity entity, boolean detached, boolean mirrored, float partialTick, CallbackInfo ci) {
		float frameSeconds = Minecraft.getInstance().getDeltaTracker().getRealtimeDeltaTicks() / 20.0F;
		float[] offsets = CameraShake.offsets(frameSeconds);
		if (offsets != null) {
			this.setRotation(this.yRot + offsets[0], this.xRot + offsets[1]);
		}
	}
}
