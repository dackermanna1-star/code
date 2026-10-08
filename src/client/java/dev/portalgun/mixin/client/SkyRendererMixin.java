package dev.portalgun.mixin.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.portalgun.client.sky.ClientSky;
import net.minecraft.client.renderer.SkyRenderer;
import net.minecraft.world.level.MoonPhase;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Draws the dimension's extra celestial bodies after the vanilla sun, moon and stars (and over the end sky box). */
@Mixin(SkyRenderer.class)
public abstract class SkyRendererMixin {
	@Inject(method = "renderSunMoonAndStars", at = @At("TAIL"))
	private void portalgun$renderBodies(PoseStack poseStack, float sunAngle, float moonAngle, float starAngle, MoonPhase moonPhase,
		float rainBrightness, float starBrightness, CallbackInfo ci) {
		ClientSky.render(rainBrightness);
	}

	@Inject(method = "renderEndSky", at = @At("TAIL"))
	private void portalgun$renderEndSkyBodies(CallbackInfo ci) {
		ClientSky.render(1.0F);
	}
}
