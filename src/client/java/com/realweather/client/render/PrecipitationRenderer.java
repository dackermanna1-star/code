package com.realweather.client.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.realweather.RealWeather;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.weather.CloudLayer;
import com.realweather.weather.Climate;
import com.realweather.weather.CloudNoise;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Replacement for vanilla's {@code WeatherEffectRenderer} drawing.
 *
 * <p>Precipitation is drawn as camera-facing column sheets (like vanilla, which keeps it very cheap) but with:
 * high-resolution streak/flake textures in several densities, two parallax layers with independent speeds,
 * wind tilt derived from the real fall speed, per-column variation so no two columns scroll alike, local intensity
 * from biome humidity and moving rain bands, a rain/snow mix near freezing, a cut-off at the cloud base,
 * lightning illumination, and distant rain curtains for atmospheric depth.
 */
public final class PrecipitationRenderer {
	private static final Identifier RAIN_LIGHT = RealWeather.id("textures/environment/rain_light.png");
	private static final Identifier RAIN_HEAVY = RealWeather.id("textures/environment/rain_heavy.png");
	private static final Identifier SNOW_LIGHT = RealWeather.id("textures/environment/snow_light.png");
	private static final Identifier SNOW_HEAVY = RealWeather.id("textures/environment/snow_heavy.png");
	private static final Identifier CURTAIN_RAIN = RealWeather.id("textures/environment/rain_curtain.png");
	private static final Identifier CURTAIN_SNOW = RealWeather.id("textures/environment/snow_curtain.png");

	private static final float RAIN_FALL_SPEED = 9.0F;
	private static final float SNOW_FALL_SPEED = 1.3F;

	private static final PrecipitationRenderer INSTANCE = new PrecipitationRenderer();

	private final List<Column> rain = new ArrayList<>();
	private final List<Column> snow = new ArrayList<>();
	private final List<Curtain> curtains = new ArrayList<>();
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private float time;
	private float windX;
	private float windZ;
	private float flash;
	private float radius;
	private boolean active;

	private record Column(int x, int z, float bottom, float top, float intensity, int light, int hash) {
	}

	private record Curtain(float x, float z, float bottom, float top, float intensity, boolean snow, int light) {
	}

	public static PrecipitationRenderer get() {
		return INSTANCE;
	}

	public static boolean enabled() {
		return ClientConfig.get().customPrecipitation;
	}

	/** Collects visible precipitation columns. Called on the render thread during the extract phase. */
	public void extract(ClientLevel level, int ticks, float partialTick, Vec3 camera) {
		this.rain.clear();
		this.snow.clear();
		this.curtains.clear();
		ClientWeather weather = ClientWeather.get();
		ClientConfig config = ClientConfig.get();
		float precipitation = weather.precipitation(partialTick);
		this.active = precipitation > 0.002F && weather.hasWeather();
		if (!this.active) {
			return;
		}

		this.time = (ticks + partialTick) / 20.0F;
		float[] wind = weather.windVector(partialTick, camera.y, level.getSeaLevel());
		this.windX = wind[0];
		this.windZ = wind[1];
		this.flash = Math.min(1.0F, weather.flashBrightness(camera, partialTick) * config.flashBrightness);
		float coldSnap = weather.coldSnap(partialTick);
		float cover = weather.cloudCover(partialTick);
		float cloudBase = CloudLayer.baseHeight(CloudLayer.vanillaHeight(level), cover, weather.storm(partialTick), precipitation) + 6.0F;
		double offsetX = weather.cloudOffsetX(partialTick);
		double offsetZ = weather.cloudOffsetZ(partialTick);
		float density = config.precipitationDensity;

		int radius = config.effectivePrecipitationRadius();
		this.radius = radius;
		int cx = Mth.floor(camera.x);
		int cy = Mth.floor(camera.y);
		int cz = Mth.floor(camera.z);
		float radiusSq = (radius + 0.5F) * (radius + 0.5F);

		for (int z = cz - radius; z <= cz + radius; z++) {
			for (int x = cx - radius; x <= cx + radius; x++) {
				int dx = x - cx;
				int dz = z - cz;
				if (dx * dx + dz * dz > radiusSq) {
					continue;
				}
				if (!level.getChunkSource().hasChunk(SectionPos.blockToSectionCoord(x), SectionPos.blockToSectionCoord(z))) {
					continue;
				}
				int ground = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
				float bottom = Math.max(cy - radius, ground);
				float top = Math.min(cy + radius + 10, cloudBase);
				if (top - bottom < 0.5F) {
					continue;
				}
				this.cursor.set(x, Math.max(cy, ground), z);
				Biome biome = level.getBiome(this.cursor).value();
				Climate.Precipitation type = Climate.precipitationFor(level, biome, this.cursor, coldSnap);
				if (type == Climate.Precipitation.NONE) {
					continue;
				}
				float local = precipitation * Climate.localIntensity(biome, CloudNoise.wrap(x - offsetX), CloudNoise.wrap(z - offsetZ), cover);
				int hash = columnHash(x, z);
				// Light precipitation thins out spatially instead of just fading, which reads far more naturally.
				float presence = Mth.clamp(local * 2.6F * density, 0.0F, 1.0F);
				if ((hash & 1023) / 1023.0F > presence) {
					continue;
				}
				int light = LevelRenderer.getLightColor(level, this.cursor);
				float intensity = Mth.clamp(local * density, 0.0F, 1.4F);
				switch (type) {
					case RAIN -> this.rain.add(new Column(x, z, bottom, top, intensity, light, hash));
					case SNOW -> this.snow.add(new Column(x, z, bottom, top, intensity, light, hash));
					case SLEET -> {
						this.rain.add(new Column(x, z, bottom, top, intensity * 0.65F, light, hash));
						this.snow.add(new Column(x, z, bottom, top, intensity * 0.6F, light, hash * 31 + 7));
					}
					default -> {
					}
				}
			}
		}

		if (config.rainCurtains && config.qualityPreset().rainCurtains && precipitation > 0.15F) {
			this.extractCurtains(level, camera, coldSnap, cover, cloudBase, precipitation, offsetX, offsetZ, radius);
		}
	}

	private void extractCurtains(ClientLevel level, Vec3 camera, float coldSnap, float cover, float cloudBase, float precipitation,
			double offsetX, double offsetZ, int radius) {
		int segments = 20;
		float distance = radius + 10.0F;
		for (int i = 0; i < segments; i++) {
			float angle = (float) (i * Math.PI * 2.0 / segments);
			float x = (float) camera.x + Mth.cos(angle) * distance;
			float z = (float) camera.z + Mth.sin(angle) * distance;
			int bx = Mth.floor(x);
			int bz = Mth.floor(z);
			if (!level.getChunkSource().hasChunk(SectionPos.blockToSectionCoord(bx), SectionPos.blockToSectionCoord(bz))) {
				continue;
			}
			int ground = level.getHeight(Heightmap.Types.MOTION_BLOCKING, bx, bz);
			this.cursor.set(bx, Math.max(ground, Mth.floor(camera.y)), bz);
			Biome biome = level.getBiome(this.cursor).value();
			Climate.Precipitation type = Climate.precipitationFor(level, biome, this.cursor, coldSnap);
			if (type == Climate.Precipitation.NONE) {
				continue;
			}
			float local = precipitation * Climate.localIntensity(biome, CloudNoise.wrap(x - offsetX), CloudNoise.wrap(z - offsetZ), cover);
			float bottom = Math.max(ground - 2.0F, (float) camera.y - 24.0F);
			float top = Math.min((float) camera.y + 60.0F, cloudBase);
			if (top - bottom < 4.0F || local < 0.12F) {
				continue;
			}
			int light = LevelRenderer.getLightColor(level, this.cursor);
			this.curtains.add(new Curtain(x, z, bottom, top, local, type == Climate.Precipitation.SNOW, light));
		}
	}

	public void render(MultiBufferSource buffers, Vec3 camera) {
		if (!this.active) {
			return;
		}
		boolean depthWrite = Minecraft.useShaderTransparency();
		float layers = ClientConfig.get().qualityPreset().precipitationLayers;

		if (!this.rain.isEmpty()) {
			this.renderColumns(buffers.getBuffer(RenderTypes.weather(RAIN_LIGHT, depthWrite)), this.rain, camera, false, false, layers);
			this.renderColumns(buffers.getBuffer(RenderTypes.weather(RAIN_HEAVY, depthWrite)), this.rain, camera, false, true, layers);
		}
		if (!this.snow.isEmpty()) {
			this.renderColumns(buffers.getBuffer(RenderTypes.weather(SNOW_LIGHT, depthWrite)), this.snow, camera, true, false, layers);
			this.renderColumns(buffers.getBuffer(RenderTypes.weather(SNOW_HEAVY, depthWrite)), this.snow, camera, true, true, layers);
		}
		if (!this.curtains.isEmpty()) {
			this.renderCurtains(buffers, camera, depthWrite);
		}
	}

	private void renderColumns(VertexConsumer consumer, List<Column> columns, Vec3 camera, boolean snow, boolean heavyLayer, float layers) {
		float fallSpeed = snow ? SNOW_FALL_SPEED : RAIN_FALL_SPEED;
		float tiltX = Mth.clamp(this.windX / fallSpeed, -2.2F, 2.2F);
		float tiltZ = Mth.clamp(this.windZ / fallSpeed, -2.2F, 2.2F);
		float vScale = snow ? 0.5F : 0.25F;
		float radiusSq = this.radius * this.radius;
		float brightness = 1.0F + this.flash * 0.9F;
		float red = snow ? 1.0F : 0.80F;
		float green = snow ? 1.0F : 0.85F;
		float blue = snow ? 1.0F : 0.93F;

		for (Column column : columns) {
			float intensity = column.intensity;
			// The light texture carries drizzle/flurries; the heavy one only appears as intensity rises.
			float layerAlpha = heavyLayer ? Mth.clamp((intensity - 0.35F) / 0.5F, 0.0F, 1.0F) * layers : Mth.clamp(intensity * 2.2F, 0.0F, 1.0F);
			if (layerAlpha <= 0.01F) {
				continue;
			}
			float cx = (float) (column.x + 0.5 - camera.x);
			float cz = (float) (column.z + 0.5 - camera.z);
			float distSq = cx * cx + cz * cz;
			if (distSq < 0.25F) {
				continue;
			}
			float dist = Mth.sqrt(distSq);
			float near = Mth.clamp((dist - 0.6F) / 1.6F, 0.0F, 1.0F);
			float far = Mth.lerp(Math.min(distSq / radiusSq, 1.0F), 1.0F, 0.35F);
			float alpha = layerAlpha * near * far * (snow ? 0.95F : 0.75F);
			if (alpha <= 0.01F) {
				continue;
			}

			int hash = heavyLayer ? column.hash * 1664525 + 1013904223 : column.hash;
			float random = (hash >>> 8 & 0xFFFF) / 65535.0F;
			float random2 = (hash >>> 4 & 0xFFF) / 4095.0F;
			// Half a block wide sheet facing the camera.
			float sideX = -cz / dist * 0.5F;
			float sideZ = cx / dist * 0.5F;
			float bottom = column.bottom;
			float top = column.top;
			float height = top - bottom;
			float topShiftX = tiltX * height;
			float topShiftZ = tiltZ * height;
			float baseX = cx;
			float baseZ = cz;

			float speed = fallSpeed * (0.85F + 0.3F * random) * (heavyLayer ? 1.12F : 1.0F);
			float scroll = this.time * speed * vScale;
			float u0 = random2 + (heavyLayer ? 0.5F : 0.0F);
			if (snow) {
				// Flakes wander sideways and are pushed along the sheet by the cross-wind.
				float crossWind = (this.windX * sideX + this.windZ * sideZ) * 2.0F;
				u0 += Mth.sin(this.time * (0.6F + random) + random2 * 6.28F) * 0.12F + this.time * crossWind * 0.08F;
			}
			float u1 = u0 + 1.0F;
			// World-anchored V (no jumping when the camera moves vertically); V grows downwards and scrolls with the fall.
			float vAtTop = -top * vScale - scroll + random * 7.0F;
			float vAtBottom = -bottom * vScale - scroll + random * 7.0F;

			int color = ARGB.colorFromFloat(Math.min(1.0F, alpha), Math.min(1.0F, red * brightness), Math.min(1.0F, green * brightness),
				Math.min(1.0F, blue * brightness));
			int light = this.flashLight(column.light);
			float yBottom = (float) (bottom - camera.y);
			float yTop = (float) (top - camera.y);

			consumer.addVertex(baseX - sideX + topShiftX, yTop, baseZ - sideZ + topShiftZ).setUv(u0, vAtTop).setColor(color).setLight(light);
			consumer.addVertex(baseX + sideX + topShiftX, yTop, baseZ + sideZ + topShiftZ).setUv(u1, vAtTop).setColor(color).setLight(light);
			consumer.addVertex(baseX + sideX, yBottom, baseZ + sideZ).setUv(u1, vAtBottom).setColor(color).setLight(light);
			consumer.addVertex(baseX - sideX, yBottom, baseZ - sideZ).setUv(u0, vAtBottom).setColor(color).setLight(light);
		}
	}

	private void renderCurtains(MultiBufferSource buffers, Vec3 camera, boolean depthWrite) {
		// One batch per texture: requesting another render type from the buffer source ends the previous batch.
		this.renderCurtainBatch(buffers, camera, false);
		this.renderCurtainBatch(buffers, camera, true);
	}

	private void renderCurtainBatch(MultiBufferSource buffers, Vec3 camera, boolean snowCurtains) {
		VertexConsumer consumer = null;
		float brightness = 1.0F + this.flash * 0.7F;
		for (Curtain curtain : this.curtains) {
			if (curtain.snow != snowCurtains) {
				continue;
			}
			if (consumer == null) {
				consumer = buffers.getBuffer(curtainType(snowCurtains ? CURTAIN_SNOW : CURTAIN_RAIN));
			}
			float cx = (float) (curtain.x - camera.x);
			float cz = (float) (curtain.z - camera.z);
			float dist = Mth.sqrt(cx * cx + cz * cz);
			float halfWidth = 9.0F;
			float sideX = -cz / dist * halfWidth;
			float sideZ = cx / dist * halfWidth;
			float fallSpeed = curtain.snow ? SNOW_FALL_SPEED : RAIN_FALL_SPEED;
			float height = curtain.top - curtain.bottom;
			float shiftX = Mth.clamp(this.windX / fallSpeed, -1.5F, 1.5F) * height * 0.5F;
			float shiftZ = Mth.clamp(this.windZ / fallSpeed, -1.5F, 1.5F) * height * 0.5F;
			float alpha = Mth.clamp(curtain.intensity * (curtain.snow ? 0.55F : 0.42F), 0.0F, 0.6F);
			float scroll = this.time * fallSpeed * 0.02F;
			float vAtTop = -curtain.top * 0.02F - scroll;
			float vAtBottom = -curtain.bottom * 0.02F - scroll;
			float u0 = (curtain.x + curtain.z) * 0.013F;
			float u1 = u0 + 1.0F;
			int color = ARGB.colorFromFloat(alpha, Math.min(1.0F, 0.86F * brightness), Math.min(1.0F, 0.89F * brightness), Math.min(1.0F, 0.95F * brightness));
			float yBottom = (float) (curtain.bottom - camera.y);
			float yTop = (float) (curtain.top - camera.y);
			int light = this.flashLight(curtain.light);
			consumer.addVertex(cx - sideX + shiftX, yTop, cz - sideZ + shiftZ).setUv(u0, vAtTop).setColor(color).setLight(light);
			consumer.addVertex(cx + sideX + shiftX, yTop, cz + sideZ + shiftZ).setUv(u1, vAtTop).setColor(color).setLight(light);
			consumer.addVertex(cx + sideX, yBottom, cz + sideZ).setUv(u1, vAtBottom).setColor(color).setLight(light);
			consumer.addVertex(cx - sideX, yBottom, cz - sideZ).setUv(u0, vAtBottom).setColor(color).setLight(light);
		}
	}

	/** Lightning briefly lights up the falling precipitation even where it is otherwise dark. */
	private int flashLight(int packedLight) {
		if (this.flash <= 0.05F) {
			return packedLight;
		}
		int level = Math.min(15, (int) (this.flash * 15.0F));
		return LightTexture.pack(Math.max(LightTexture.block(packedLight), level), Math.max(LightTexture.sky(packedLight), level));
	}

	private static RenderType curtainType(Identifier texture) {
		// Curtains are soft translucent sheets; never write depth so they don't occlude the columns in front.
		return RenderTypes.weather(texture, false);
	}

	private static int columnHash(int x, int z) {
		int h = x * 73428767 ^ z * 912931 ^ 0x5A17;
		h ^= h >>> 15;
		h *= 0x2C1B3C6D;
		h ^= h >>> 12;
		return h & 0x7FFFFFFF;
	}
}
