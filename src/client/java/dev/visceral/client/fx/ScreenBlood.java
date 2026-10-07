package dev.visceral.client.fx;

import dev.visceral.Visceral;
import dev.visceral.VisceralConfig;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

/** Blood splattered over the edges of the screen for a moment when you are cut. */
public final class ScreenBlood {
	private static final Identifier TEXTURE = Visceral.id("textures/gui/screen_blood.png");
	private static final int TEXTURE_SIZE = 512;
	private static final float FADE_TICKS = 50.0F;
	private static float intensity;
	private static float ticksLeft;
	private static boolean flipped;

	private ScreenBlood() {
	}

	public static void trigger(float strength) {
		intensity = Math.min(1.0F, Math.max(intensity * (ticksLeft / FADE_TICKS), 0.0F) + strength);
		ticksLeft = FADE_TICKS;
		flipped = !flipped;
	}

	public static void tick() {
		if (ticksLeft > 0.0F) {
			ticksLeft--;
		}
	}

	public static void clear() {
		ticksLeft = 0.0F;
		intensity = 0.0F;
	}

	public static void render(GuiGraphics graphics, DeltaTracker deltaTracker) {
		if (ticksLeft <= 0.0F || !VisceralConfig.get().screenBlood || Minecraft.getInstance().options.hideGui) {
			return;
		}
		float t = (ticksLeft - deltaTracker.getGameTimeDeltaPartialTick(false)) / FADE_TICKS;
		float alpha = intensity * Mth.clamp(t * 1.4F, 0.0F, 1.0F) * 0.85F;
		if (alpha <= 0.01F) {
			return;
		}
		int width = graphics.guiWidth();
		int height = graphics.guiHeight();
		int color = ARGB.color(Math.round(alpha * 255.0F), 0xFFFFFF);
		if (flipped) {
			// Mirrored through the texture coordinates so consecutive hits don't look identical.
			graphics.blit(RenderPipelines.GUI_TEXTURED, TEXTURE, 0, 0, TEXTURE_SIZE, 0.0F, width, height, -TEXTURE_SIZE, TEXTURE_SIZE, TEXTURE_SIZE, TEXTURE_SIZE, color);
		} else {
			graphics.blit(RenderPipelines.GUI_TEXTURED, TEXTURE, 0, 0, 0.0F, 0.0F, width, height, TEXTURE_SIZE, TEXTURE_SIZE, TEXTURE_SIZE, TEXTURE_SIZE, color);
		}
	}
}
