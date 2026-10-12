package com.chaosunleashed.client.render;

import com.chaosunleashed.client.ClientChaosState;
import com.chaosunleashed.core.ChaosEventType;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.util.math.MathHelper;

/**
 * Full-screen tints drawn under the HUD: Solar Flare glare + heat shimmer, Blood Moon red vignette, Eclipse dark
 * vignette and a flickering purple edge near a Dimension Rift.
 */
public final class ChaosHudOverlay implements HudElement {
	@Override
	public void render(DrawContext context, RenderTickCounter tickCounter) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.world == null || client.options.hudHidden) {
			return;
		}
		float delta = tickCounter.getTickProgress(false);
		float time = client.world.getTime() + delta;
		int w = context.getScaledWindowWidth();
		int h = context.getScaledWindowHeight();

		float flare = ClientChaosState.strength(ChaosEventType.SOLAR_FLARE, delta);
		if (flare > 0.0F) {
			boolean outside = client.player != null && client.world.isSkyVisible(client.player.getBlockPos().up());
			float glare = flare * (outside ? 1.0F : 0.45F);
			context.fill(0, 0, w, h, argb(glare * 0.28F, 0xFF9A30));
			context.fillGradient(0, 0, w, h / 2, argb(glare * 0.35F, 0xFFE070), argb(0.0F, 0xFFE070));
			// Heat shimmer: faint bright bands drifting upward.
			for (int y = 0; y < h; y += 3) {
				float wave = MathHelper.sin(y * 0.09F + time * 0.35F) * MathHelper.sin(y * 0.031F - time * 0.11F);
				if (wave > 0.2F) {
					context.fill(0, y, w, y + 1, argb(glare * 0.10F * wave, 0xFFF0C0));
				}
			}
		}

		float blood = ClientChaosState.strength(ChaosEventType.BLOOD_MOON, delta);
		if (blood > 0.0F) {
			float pulse = 0.85F + 0.15F * MathHelper.sin(time * 0.08F);
			vignette(context, w, h, argb(blood * 0.45F * pulse, 0x6A0000));
		}

		float eclipse = ClientChaosState.strength(ChaosEventType.ECLIPSE, delta) * ClientChaosState.value(ChaosEventType.ECLIPSE);
		if (eclipse > 0.0F) {
			vignette(context, w, h, argb(eclipse * 0.55F, 0x000008));
		}

		float rift = ClientChaosState.strength(ChaosEventType.DIMENSION_RIFT, delta);
		if (rift > 0.0F) {
			float flicker = 0.6F + 0.4F * MathHelper.sin(time * 0.6F) * MathHelper.sin(time * 0.23F);
			int color = ClientChaosState.value(ChaosEventType.DIMENSION_RIFT) > 0.5F ? 0x7A30B0 : 0xB03010;
			vignette(context, w, h, argb(rift * 0.25F * flicker, color));
		}

		float hole = ClientChaosState.strength(ChaosEventType.BLACK_HOLE, delta);
		if (hole > 0.0F) {
			vignette(context, w, h, argb(hole * 0.25F, 0x10001A));
		}
	}

	private static void vignette(DrawContext context, int w, int h, int color) {
		int clear = color & 0x00FFFFFF;
		int band = Math.max(8, h / 4);
		context.fillGradient(0, 0, w, band, color, clear);
		context.fillGradient(0, h - band, w, h, clear, color);
		// Side bands: vertical gradients only exist, so draw thin columns with fading alpha.
		int alpha = color >>> 24;
		int steps = 12;
		int stepW = Math.max(1, (w / 5) / steps);
		for (int i = 0; i < steps; i++) {
			int a = (int) (alpha * (1.0F - i / (float) steps));
			int c = (a << 24) | clear;
			context.fill(i * stepW, 0, (i + 1) * stepW, h, c);
			context.fill(w - (i + 1) * stepW, 0, w - i * stepW, h, c);
		}
	}

	private static int argb(float alpha, int rgb) {
		return (MathHelper.clamp((int) (alpha * 255.0F), 0, 255) << 24) | (rgb & 0xFFFFFF);
	}
}
