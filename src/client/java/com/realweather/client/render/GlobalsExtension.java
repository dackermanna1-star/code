package com.realweather.client.render;

import com.mojang.blaze3d.buffers.Std140Builder;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.weather.CloudLayer;
import com.realweather.weather.CloudNoise;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.phys.Vec3;

/**
 * Appends RealWeather's per-frame data to vanilla's {@code Globals} uniform block (layout documented in
 * {@code rw_globals.glsl}). Being part of Globals, the data reaches the terrain shader without touching vanilla's
 * chunk rendering code.
 */
public final class GlobalsExtension {
	/** Six vec4-sized entries. */
	private static final int EXTRA_BYTES = 6 * 16;

	public static final int FLAG_SWAY = 1;
	public static final int FLAG_WET = 2;
	public static final int FLAG_SHADOWS = 4;

	private static long lastNanos = -1L;
	private static double wavePhase;
	private static double flutterPhase;

	private GlobalsExtension() {
	}

	public static int extendedSize(int vanillaSize) {
		return ((vanillaSize + 15) & ~15) + EXTRA_BYTES;
	}

	public static Std140Builder write(Std140Builder builder, Camera camera, DeltaTracker deltaTracker) {
		Minecraft minecraft = Minecraft.getInstance();
		ClientLevel level = minecraft.level;
		ClientWeather weather = ClientWeather.get();
		long now = Util.getNanos();
		float dt = lastNanos < 0L ? 0.0F : Math.min(0.25F, (now - lastNanos) / 1.0E9F);
		lastNanos = now;

		if (level == null || !camera.isInitialized() || !weather.hasWeather()) {
			return builder.putIVec4(0, 0, CloudNoise.PERIOD, 0)
				.putVec4(0.0F, 0.0F, 0.0F, 0.0F)
				.putVec4(0.0F, 0.0F, 1.0F, 0.0F)
				.putVec4(1.0F, 0.0F, 0.0F, 0.0F)
				.putVec4(0.0F, 0.0F, 0.0F, 0.0F)
				.putVec4(0.0F, 1.0F, 0.0F, 0.0F);
		}

		ClientConfig config = ClientConfig.get();
		float partialTick = deltaTracker.getGameTimeDeltaPartialTick(false);
		Vec3 cam = camera.position();

		double nx = CloudNoise.wrap(cam.x - weather.cloudOffsetX(partialTick));
		double nz = CloudNoise.wrap(cam.z - weather.cloudOffsetZ(partialTick));
		int originX = Mth.floor(nx);
		int originZ = Mth.floor(nz);

		float cover = weather.cloudCover(partialTick);
		float storm = weather.storm(partialTick);
		float precipitation = weather.precipitation(partialTick);
		float base = CloudLayer.baseHeight(CloudLayer.vanillaHeight(level), cover, storm, precipitation) - (float) cam.y;
		float thickness = CloudLayer.thickness(cover, storm, precipitation);

		float sunAngle = camera.attributeProbe().getValue(EnvironmentAttributes.SUN_ANGLE, partialTick) * Mth.DEG_TO_RAD;
		float sunX = -Mth.sin(sunAngle);
		float sunY = Mth.cos(sunAngle);
		float sunVisibility = Mth.clamp((sunY + 0.05F) / 0.2F, 0.0F, 1.0F);
		float daylight = Mth.clamp((sunY + 0.15F) / 0.4F, 0.0F, 1.0F);
		float shadowStrength = config.cloudShadows ? 0.6F * sunVisibility * (1.0F - smoothstep(0.75F, 0.97F, cover)) : 0.0F;

		float[] wind = weather.windVector(partialTick, cam.y, level.getSeaLevel());
		float speed = Mth.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		float dirX = speed > 1.0E-3F ? wind[0] / speed : 1.0F;
		float dirZ = speed > 1.0E-3F ? wind[1] / speed : 0.0F;
		// Phases are integrated here (not derived from absolute time) so changing wind speed never makes plants jump.
		wavePhase = (wavePhase + dt * (0.9 + speed * 0.32)) % (Math.PI * 2.0 * 4096.0);
		flutterPhase = (flutterPhase + dt * (3.5 + speed * 0.9)) % (Math.PI * 2.0 * 4096.0);
		float sway = config.foliageSway ? config.swayStrength : 0.0F;
		float wetness = config.wetSurfaces ? weather.wetness(partialTick) * config.wetnessStrength : 0.0F;
		float time = (float) ((weather.clientTicks() + partialTick) / 20.0 % 3600.0);

		int flags = 0;
		if (sway > 0.0F) {
			flags |= FLAG_SWAY;
		}
		if (wetness > 0.0F) {
			flags |= FLAG_WET;
		}
		if (shadowStrength > 0.0F) {
			flags |= FLAG_SHADOWS;
		}

		return builder.putIVec4(originX, originZ, CloudNoise.PERIOD, flags)
			.putVec4((float) (nx - originX), (float) (nz - originZ), time, daylight)
			.putVec4(cover, base, thickness, shadowStrength)
			.putVec4(dirX, dirZ, speed, sway)
			.putVec4(wetness, (float) wavePhase, (float) flutterPhase, storm)
			.putVec4(sunX, sunY, 0.0F, sunVisibility);
	}

	private static float smoothstep(float edge0, float edge1, float x) {
		float t = Mth.clamp((x - edge0) / (edge1 - edge0), 0.0F, 1.0F);
		return t * t * (3.0F - 2.0F * t);
	}
}
