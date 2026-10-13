package dev.calibercraft.client.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import dev.calibercraft.client.GunController;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.fx.TracerRenderer;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.util.Mth;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Per-frame weapon update, recoil camera shake, and calmer view bobbing while aiming. */
@Mixin(GameRenderer.class)
abstract class GameRendererMixin {
	@Shadow
	@Final
	private Minecraft minecraft;

	@Inject(method = "render", at = @At("HEAD"))
	private void calibercraft$frame(DeltaTracker delta, boolean renderLevel, CallbackInfo ci) {
		float dt = delta.getGameTimeDeltaTicks();
		GunController.INSTANCE.frame(minecraft, dt);
		TracerRenderer.advance(dt);
	}

	@Inject(method = "bobHurt", at = @At("TAIL"))
	private void calibercraft$shake(PoseStack pose, float partial, CallbackInfo ci) {
		ClientConfig cfg = ClientConfig.get();
		float s = GunController.INSTANCE.shake * cfg.screenShake;
		if (s > 0.001f && !cfg.reducedMotion) {
			float t = GunController.INSTANCE.clock;
			pose.mulPose(Axis.XP.rotationDegrees(-s * 0.9f * Mth.abs(Mth.sin(t * 2.7f))));
			pose.mulPose(Axis.ZP.rotationDegrees(s * 0.6f * Mth.sin(t * 3.9f)));
		}
	}

	@Inject(method = "bobView", at = @At("HEAD"), cancellable = true)
	private void calibercraft$aimBob(PoseStack pose, float partial, CallbackInfo ci) {
		GunController c = GunController.INSTANCE;
		boolean calm = ClientConfig.get().reducedMotion && c.active();
		if (!(c.active() && c.ads > 0) && !calm) {
			return;
		}
		ci.cancel();
		if (!(minecraft.getCameraEntity() instanceof AbstractClientPlayer player)) {
			return;
		}
		float k = calm ? 0.25f : 1 - 0.85f * c.ads;
		var state = player.avatarState();
		float g = state.getBackwardsInterpolatedWalkDistance(partial);
		float h = state.getInterpolatedBob(partial) * k;
		pose.translate(Mth.sin(g * Mth.PI) * h * 0.5F, -Math.abs(Mth.cos(g * Mth.PI) * h), 0.0F);
		pose.mulPose(Axis.ZP.rotationDegrees(Mth.sin(g * Mth.PI) * h * 3.0F));
		pose.mulPose(Axis.XP.rotationDegrees(Math.abs(Mth.cos(g * Mth.PI - 0.2F) * h) * 5.0F));
	}
}
