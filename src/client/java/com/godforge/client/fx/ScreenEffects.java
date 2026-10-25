package com.godforge.client.fx;

import com.godforge.client.ClientConfig;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;

/**
 * Client-only camera and screen effects: trauma-based shake, coloured flashes, view distortion
 * and the reality-crack overlay. All are driven by server effect packets.
 */
public final class ScreenEffects {
	private static final Identifier CRACKS = com.godforge.Godforge.id("textures/misc/screen_cracks.png");
	private static final RandomSource RANDOM = RandomSource.create();

	private static float trauma;
	private static float traumaDecay = 0.04F;
	private static float flash;
	private static float flashDecay = 0.05F;
	private static int flashColor = 0xFFFFFF;
	private static float distortion;
	private static float distortionDecay = 0.02F;
	private static float cracks;
	private static float time;

	private ScreenEffects() {
	}

	public static void shake(float intensity, int duration) {
		float scaled = (float) (intensity * ClientConfig.get().screenShake);
		if (scaled <= 0.0F) {
			return;
		}
		trauma = Math.min(3.0F, Math.max(trauma, scaled));
		traumaDecay = Math.max(0.01F, trauma / Math.max(4, duration));
	}

	public static void flash(int color, float intensity, int duration) {
		float scaled = (float) (intensity * ClientConfig.get().flashes);
		if (scaled <= flash * 0.8F) {
			return;
		}
		flash = Math.min(1.0F, scaled);
		flashColor = color;
		flashDecay = flash / Math.max(2, duration);
	}

	public static void distort(float intensity, int duration) {
		if (!ClientConfig.get().distortion) {
			return;
		}
		distortion = Math.min(1.5F, Math.max(distortion, intensity));
		distortionDecay = Math.max(0.005F, distortion / Math.max(4, duration));
	}

	public static void cracks(float intensity) {
		if (ClientConfig.get().distortion) {
			cracks = Math.min(1.0F, Math.max(cracks, intensity));
		}
	}

	public static void tick() {
		time += 1.0F;
		trauma = Math.max(0.0F, trauma - traumaDecay);
		flash = Math.max(0.0F, flash - flashDecay);
		distortion = Math.max(0.0F, distortion - distortionDecay);
		cracks = Math.max(0.0F, cracks - 0.012F);
	}

	public static float distortion() {
		return distortion;
	}

	/** Applied to the world projection right before view bobbing (see GameRendererMixin). */
	public static void applyCamera(PoseStack poseStack, float partialTick) {
		if (Minecraft.getInstance().isPaused()) {
			return;
		}
		float t = time + partialTick;
		if (trauma > 0.0F) {
			float shake = trauma * trauma;
			float yaw = (smoothNoise(t * 0.9F, 1) * 2.0F) * shake;
			float pitch = (smoothNoise(t * 0.9F, 2) * 2.0F) * shake;
			float roll = (smoothNoise(t * 0.7F, 3) * 2.0F) * shake * 1.4F;
			poseStack.mulPose(Axis.ZP.rotationDegrees(roll));
			poseStack.mulPose(Axis.XP.rotationDegrees(pitch));
			poseStack.mulPose(Axis.YP.rotationDegrees(yaw));
		}
		if (distortion > 0.0F) {
			// a slow, nauseating warp of space (same idea as the vanilla portal/nausea projection warp)
			float d = Math.min(1.0F, distortion);
			float angle = t * 0.05F;
			float squash = 1.0F + Mth.sin(t * 0.21F) * 0.08F * d;
			poseStack.mulPose(Axis.ZP.rotation(angle));
			poseStack.scale(squash, 1.0F / squash, 1.0F);
			poseStack.mulPose(Axis.ZP.rotation(-angle));
			poseStack.mulPose(Axis.ZP.rotationDegrees(Mth.sin(t * 0.13F) * 2.5F * d));
		}
	}

	/** FOV multiplier pulse while distortion is active. */
	public static float fovMultiplier(float partialTick) {
		if (distortion <= 0.0F) {
			return 1.0F;
		}
		float t = time + partialTick;
		return 1.0F + Mth.sin(t * 0.17F) * 0.06F * Math.min(1.0F, distortion);
	}

	private static float smoothNoise(float t, int channel) {
		int i = Mth.floor(t);
		float f = t - i;
		float a = hash(i, channel);
		float b = hash(i + 1, channel);
		float s = f * f * (3 - 2 * f);
		return a + (b - a) * s;
	}

	private static float hash(int i, int channel) {
		long h = (long) i * 0x9E3779B97F4A7C15L + channel * 0xBF58476D1CE4E5B9L;
		h ^= h >>> 31;
		h *= 0x94D049BB133111EBL;
		h ^= h >>> 29;
		return ((h >>> 40) & 0xFFFF) / 65535.0F * 2.0F - 1.0F;
	}

	/** Full-screen overlays, drawn as a HUD layer. */
	public static void renderOverlay(GuiGraphics graphics, float partialTick) {
		int w = graphics.guiWidth();
		int h = graphics.guiHeight();
		if (cracks > 0.0F) {
			int alpha = (int) (Mth.clamp(cracks, 0.0F, 1.0F) * 200);
			graphics.blit(RenderPipelines.GUI_TEXTURED, CRACKS, 0, 0, 0.0F, 0.0F, w, h, w, h, ARGB.color(alpha, 0xE8C8FF));
		}
		if (flash > 0.0F) {
			int alpha = (int) (Mth.clamp(flash, 0.0F, 1.0F) * 235);
			graphics.fill(0, 0, w, h, ARGB.color(alpha, flashColor));
		}
	}

	public static void reset() {
		trauma = 0.0F;
		flash = 0.0F;
		distortion = 0.0F;
		cracks = 0.0F;
	}

	public static float random() {
		return RANDOM.nextFloat();
	}
}
