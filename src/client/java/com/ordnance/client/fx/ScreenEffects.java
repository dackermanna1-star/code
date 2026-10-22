package com.ordnance.client.fx;

import com.ordnance.config.ConfigManager;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.RaycastContext;

/** Full-screen overlays: the blinding flash of a nearby detonation and the inside-the-smoke whiteout. */
public final class ScreenEffects {
	private static float flash;
	private static float lastFlash;
	private static int flashColor = 0xFFF2D0;
	private static float smoke;
	private static float lastSmoke;
	private static int smokeColor = 0x6A6662;

	private ScreenEffects() {
	}

	/**
	 * Flash for an explosion at {@code pos}: stronger when close, when looking towards it, and much weaker when it
	 * is hidden behind terrain.
	 */
	public static void explosionFlash(Vec3d pos, float scale, int rgb) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (!ConfigManager.get().visuals.screenFlash || client.player == null || client.world == null) {
			return;
		}

		Vec3d eye = client.gameRenderer.getCamera().getCameraPos();
		Vec3d to = pos.subtract(eye);
		double distance = to.length();
		float strength = (float)MathHelper.clamp(scale * 5.0 / (distance + scale * 3.0) - 0.08, 0.0, 1.0);
		if (strength <= 0.01F) {
			return;
		}

		Vec3d look = client.player.getRotationVec(1.0F);
		double facing = distance < 1.0E-3 ? 1.0 : look.dotProduct(to.multiply(1.0 / distance));
		strength *= (float)MathHelper.clamp(0.35 + 0.65 * facing, 0.2, 1.0);
		if (distance > 2.0) {
			HitResult hit = client.world.raycast(new RaycastContext(eye, pos, RaycastContext.ShapeType.VISUAL, RaycastContext.FluidHandling.NONE, client.player));
			if (hit.getType() != HitResult.Type.MISS && hit.getPos().distanceTo(pos) > 1.5) {
				strength *= 0.25F;
			}
		}

		if (strength > flash) {
			flash = strength;
			flashColor = rgb;
		}
	}

	public static void tick() {
		lastFlash = flash;
		flash *= 0.7F;
		if (flash < 0.004F) {
			flash = 0.0F;
		}

		lastSmoke = smoke;
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.gameRenderer != null && ConfigManager.get().visuals.smokeObstruction) {
			SmokeVolumes.Sample sample = SmokeVolumes.sample(client.gameRenderer.getCamera().getCameraPos());
			smoke += (sample.density() - smoke) * 0.2F;
			smokeColor = sample.rgb();
		} else {
			smoke = 0.0F;
		}
	}

	public static void reset() {
		flash = lastFlash = smoke = lastSmoke = 0.0F;
	}

	public static void render(DrawContext context, RenderTickCounter tickCounter) {
		float delta = tickCounter.getTickProgress(false);
		int width = context.getScaledWindowWidth();
		int height = context.getScaledWindowHeight();
		float s = MathHelper.lerp(delta, lastSmoke, smoke);
		if (s > 0.01F) {
			int alpha = (int)(MathHelper.clamp(s * 0.92F, 0.0F, 0.95F) * 255.0F);
			context.fill(0, 0, width, height, alpha << 24 | smokeColor);
		}

		float f = MathHelper.lerp(delta, lastFlash, flash);
		if (f > 0.005F) {
			int alpha = (int)(MathHelper.clamp(f * 0.9F, 0.0F, 0.95F) * 255.0F);
			context.fill(0, 0, width, height, alpha << 24 | flashColor);
		}
	}
}
