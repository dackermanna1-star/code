package com.jjkshowdown.client;

import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.mixin.client.GameRendererAccessor;
import com.jjkshowdown.network.Payloads;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

import java.util.ArrayList;
import java.util.List;

/** Client screen effects: trauma-based camera shake, colour flashes, Black Flash inversion, impact frames, slow-mo. */
public final class ScreenFx {
	private ScreenFx() {
	}

	private static float trauma;
	private static long seed = 1;

	public record Flash(int color, float intensity, long start, int duration) {
	}

	public static final List<Flash> FLASHES = new ArrayList<>();
	/** Sentinel for "never happened"; far enough in the past that subtraction can never overflow. */
	public static final long NEVER = -1_000_000L;
	public static long blackFlashStart = NEVER;
	public static int blackFlashDuration = 1;
	public static long impactStart = NEVER;
	public static int impactDuration = 1;
	public static int impactColor = 0xFFFFFF;
	public static long slowMoStart = NEVER;
	public static int slowMoDuration = 1;

	/** Whether an effect that started at {@code start} is still running at {@code now}. */
	public static boolean running(long start, int duration, long now) {
		return start != NEVER && now >= start && now - start < duration;
	}
	private static boolean invertActive;
	private static int invertTicks;

	public static long now() {
		Minecraft mc = Minecraft.getInstance();
		return mc.level == null ? 0 : mc.level.getGameTime();
	}

	public static void accept(Payloads.ScreenEffect e) {
		ClientConfig cfg = ClientConfig.get();
		long t = now();
		switch (e.effect()) {
			case Payloads.ScreenEffect.SHAKE -> shake(e.intensity());
			case Payloads.ScreenEffect.FLASH -> {
				if (cfg.screenFlashes) FLASHES.add(new Flash(e.color(), Math.min(1f, e.intensity()), t, Math.max(1, e.duration())));
			}
			case Payloads.ScreenEffect.BLACK_FLASH -> {
				blackFlashStart = t;
				blackFlashDuration = Math.max(4, e.duration());
				shake(0.6f * e.intensity());
				if (cfg.screenFlashes) invert(3);
			}
			case Payloads.ScreenEffect.IMPACT_FRAME -> {
				if (cfg.screenFlashes) {
					impactStart = t;
					impactDuration = Math.max(2, e.duration());
					impactColor = e.color();
				}
				shake(0.8f);
			}
			case Payloads.ScreenEffect.SLOW_MO -> {
				slowMoStart = t;
				slowMoDuration = Math.max(4, e.duration());
			}
			case Payloads.ScreenEffect.INVERT -> {
				if (cfg.screenFlashes) invert(Math.max(2, e.duration()));
			}
			default -> {
			}
		}
	}

	public static void shake(float amount) {
		trauma = Math.min(1.0f, trauma + amount * ClientConfig.get().screenShake * 0.6f);
	}

	public static void flash(int color, float intensity, int duration) {
		if (ClientConfig.get().screenFlashes) FLASHES.add(new Flash(color, intensity, now(), duration));
	}

	private static void invert(int ticks) {
		Minecraft mc = Minecraft.getInstance();
		try {
			((GameRendererAccessor) mc.gameRenderer).jjk$setPostEffect(Identifier.withDefaultNamespace("invert"));
			invertActive = true;
			invertTicks = ticks;
		} catch (Exception ignored) {
		}
	}

	public static void tick() {
		trauma = Math.max(0, trauma - 0.045f);
		long t = now();
		FLASHES.removeIf(f -> t - f.start > f.duration);
		if (invertActive && --invertTicks <= 0) {
			invertActive = false;
			Minecraft mc = Minecraft.getInstance();
			mc.gameRenderer.clearPostEffect();
			mc.gameRenderer.checkEntityPostEffect(mc.getCameraEntity());
		}
		seed++;
	}

	/** Shake offsets (yaw, pitch, roll-ish x offset) in degrees for this frame. */
	public static float[] shakeOffsets(float partial) {
		if (trauma <= 0.001f) return null;
		float s = trauma * trauma;
		float time = (seed + partial) * 0.9f;
		float yaw = (float) (noise(time, 1) * 4.0 * s);
		float pitch = (float) (noise(time, 2) * 3.0 * s);
		float off = (float) (noise(time, 3) * 0.08 * s);
		return new float[]{yaw, pitch, off};
	}

	private static double noise(float t, int channel) {
		return Math.sin(t * 1.7 + channel * 12.9) * 0.6 + Math.sin(t * 3.1 + channel * 4.1) * 0.3 + Math.sin(t * 7.3 + channel * 1.3) * 0.1;
	}

	public static float slowMo(float partial) {
		long t = now();
		if (!running(slowMoStart, slowMoDuration, t)) return 0f;
		float p = (t - slowMoStart + partial) / slowMoDuration;
		return Mth.clamp(1f - p, 0f, 1f);
	}

	public static void clear() {
		trauma = 0;
		FLASHES.clear();
		blackFlashStart = NEVER;
		impactStart = NEVER;
		slowMoStart = NEVER;
		if (invertActive) {
			invertActive = false;
			Minecraft.getInstance().gameRenderer.clearPostEffect();
		}
	}
}
