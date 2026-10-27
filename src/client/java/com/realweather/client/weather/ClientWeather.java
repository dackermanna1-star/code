package com.realweather.client.weather;

import com.realweather.network.WeatherSyncPayload;
import com.realweather.weather.Climate;
import com.realweather.weather.CloudNoise;
import com.realweather.weather.WeatherState;
import com.realweather.weather.WeatherType;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Client-side view of the atmosphere.
 *
 * <p>With RealWeather on the server, the state follows the server's snapshots with smooth interpolation (and the
 * same deterministic gusts and cloud drift, so all players see identical weather). On a vanilla server it derives
 * an equivalent state from vanilla's rain and thunder levels, so the visual upgrade still works everywhere.
 *
 * <p>It also samples the player's surroundings (sky exposure, local precipitation, wetness) and keeps track of
 * lightning flashes, which drive sky, cloud and terrain illumination.
 */
public final class ClientWeather {
	private static final ClientWeather INSTANCE = new ClientWeather();
	private static final float CLOUD_DRIFT_SCALE = 0.18F;
	private static final long FALLBACK_SEED = 0x5EEDC0FFEEL;

	private final WeatherState target = new WeatherState();
	private final WeatherState current = new WeatherState();
	private boolean synced;
	private boolean initialized;
	private int ticksSinceSync = Integer.MAX_VALUE / 2;
	private long clientTicks;

	// Values of the previous tick, for frame interpolation.
	private float prevPrecipitation;
	private float prevCloudCover;
	private float prevStorm;
	private float prevFog;
	private float prevColdSnap;
	private float prevWindSpeed;
	private float prevWindDirection;
	private double prevOffsetX;
	private double prevOffsetZ;

	// Local environment around the camera.
	private float exposure = 1.0F;
	private float prevExposure = 1.0F;
	private boolean underRoof;
	private Climate.Precipitation localType = Climate.Precipitation.NONE;
	private float localIntensity;
	private float prevLocalIntensity;
	private float localHumidity = 0.5F;
	private float localTemperature = 0.8F;
	private float wetness;
	private float prevWetness;
	private float inCloud;
	private float prevInCloud;
	private boolean weatherDimension;

	private final List<Flash> flashes = new ArrayList<>();

	public static ClientWeather get() {
		return INSTANCE;
	}

	private ClientWeather() {
		this.reset();
	}

	public void reset() {
		this.synced = false;
		this.initialized = false;
		this.ticksSinceSync = Integer.MAX_VALUE / 2;
		this.target.copyFrom(new WeatherState());
		this.current.copyFrom(new WeatherState());
		this.wetness = 0.0F;
		this.prevWetness = 0.0F;
		this.flashes.clear();
		Climate.setClientColdSnapStrength(-1.0F);
	}

	public void onSync(WeatherSyncPayload payload) {
		WeatherState t = this.target;
		t.type = payload.weatherType();
		t.dynamic = payload.dynamic();
		t.remainingTicks = payload.remainingTicks();
		t.intensity = payload.intensity();
		t.intensityOverride = -1.0F;
		t.cloudCover = payload.cloudCover();
		t.precipitation = payload.precipitation();
		t.storm = payload.storm();
		t.coldSnap = payload.coldSnap();
		t.fog = payload.fog();
		t.windSpeed = payload.windSpeed();
		t.windDirection = payload.windDirection();
		t.gustiness = payload.gustiness();
		t.seed = payload.seed();
		t.simTicks = payload.simTicks();
		t.cloudOffsetX = payload.cloudOffsetX();
		t.cloudOffsetZ = payload.cloudOffsetZ();
		Climate.setClientColdSnapStrength(payload.coldSnapStrength());
		if (!this.synced || payload.snap() || !this.initialized) {
			this.current.copyFrom(t);
			this.storePrevious();
			this.initialized = true;
		}
		this.synced = true;
		this.ticksSinceSync = 0;
	}

	public boolean isServerSynced() {
		return this.synced;
	}

	// -----------------------------------------------------------------------------------------------------------
	// Ticking
	// -----------------------------------------------------------------------------------------------------------

	public void tick(Minecraft minecraft) {
		ClientLevel level = minecraft.level;
		if (level == null) {
			if (this.initialized || this.synced) {
				this.reset();
			}
			return;
		}
		this.clientTicks++;
		this.ticksSinceSync++;
		this.weatherDimension = level.canHaveWeather();
		this.storePrevious();

		if (!this.synced) {
			this.deriveFromVanilla(level);
			if (!this.initialized) {
				this.current.copyFrom(this.target);
				this.storePrevious();
				this.initialized = true;
			}
		} else {
			this.extrapolateTarget(level);
		}
		this.followTarget(level);
		this.sampleSurroundings(minecraft, level);
		this.flashes.removeIf(flash -> this.clientTicks - flash.startTick > 60);
	}

	private void storePrevious() {
		this.prevPrecipitation = this.current.precipitation;
		this.prevCloudCover = this.current.cloudCover;
		this.prevStorm = this.current.storm;
		this.prevFog = this.current.fog;
		this.prevColdSnap = this.current.coldSnap;
		this.prevWindSpeed = this.current.windSpeed;
		this.prevWindDirection = this.current.windDirection;
		this.prevOffsetX = this.current.cloudOffsetX;
		this.prevOffsetZ = this.current.cloudOffsetZ;
		this.prevExposure = this.exposure;
		this.prevLocalIntensity = this.localIntensity;
		this.prevWetness = this.wetness;
		this.prevInCloud = this.inCloud;
	}

	/** Advances the server snapshot between packets exactly like the server would. */
	private void extrapolateTarget(ClientLevel level) {
		WeatherState t = this.target;
		t.simTicks++;
		if (t.remainingTicks > 0) {
			t.remainingTicks--;
		}
		float drift = t.windSpeed * Climate.windAltitudeFactor(200, level.getSeaLevel()) * CLOUD_DRIFT_SCALE / 20.0F;
		t.cloudOffsetX = CloudNoise.wrap(t.cloudOffsetX + t.windX() * drift);
		t.cloudOffsetZ = CloudNoise.wrap(t.cloudOffsetZ + t.windZ() * drift);
	}

	/** Builds an equivalent state from vanilla rain/thunder on servers without RealWeather. */
	private void deriveFromVanilla(ClientLevel level) {
		WeatherState t = this.target;
		float rain = level.getRainLevel(1.0F);
		float thunder = level.getThunderLevel(1.0F);
		long time = level.getGameTime();
		t.type = thunder > 0.5F ? WeatherType.THUNDER : rain > 0.2F ? WeatherType.RAIN : WeatherType.CLEAR;
		t.seed = FALLBACK_SEED;
		t.simTicks = time;
		t.precipitation = rain * (0.55F + 0.35F * thunder);
		t.storm = thunder;
		t.coldSnap = 0.0F;
		float fairWeather = 0.12F + 0.3F * (float) smooth1D(time / 24000.0, 17);
		t.cloudCover = Math.max(fairWeather, rain * 0.97F);
		t.fog = rain * 0.25F + thunder * 0.1F;
		t.gustiness = t.type.gustiness;
		t.windSpeed = 2.0F + 4.0F * (float) smooth1D(time / 6000.0, 3) + rain * 3.5F + thunder * 6.0F;
		t.windDirection = (float) (smooth1D(time / 48000.0, 9) * Math.PI * 4.0);
		t.remainingTicks = 0;
		t.intensity = 0.6F;
		t.dynamic = true;
		float drift = t.windSpeed * Climate.windAltitudeFactor(200, level.getSeaLevel()) * CLOUD_DRIFT_SCALE / 20.0F;
		t.cloudOffsetX = CloudNoise.wrap(t.cloudOffsetX + t.windX() * drift);
		t.cloudOffsetZ = CloudNoise.wrap(t.cloudOffsetZ + t.windZ() * drift);
	}

	private static double smooth1D(double x, int seed) {
		double fl = Math.floor(x);
		double f = x - fl;
		double u = f * f * (3.0 - 2.0 * f);
		double a = (CloudNoise.hash((int) fl, 0, seed) & 0xFFFFFF) / 16777216.0;
		double b = (CloudNoise.hash((int) fl + 1, 0, seed) & 0xFFFFFF) / 16777216.0;
		return a + (b - a) * u;
	}

	private void followTarget(ClientLevel level) {
		WeatherState c = this.current;
		WeatherState t = this.target;
		float k = 0.065F;
		c.type = t.type;
		c.dynamic = t.dynamic;
		c.remainingTicks = t.remainingTicks;
		c.intensity = t.intensity;
		c.seed = t.seed;
		c.precipitation += (t.precipitation - c.precipitation) * k;
		c.cloudCover += (t.cloudCover - c.cloudCover) * k;
		c.storm += (t.storm - c.storm) * k;
		c.coldSnap += (t.coldSnap - c.coldSnap) * k;
		c.fog += (t.fog - c.fog) * k;
		c.windSpeed += (t.windSpeed - c.windSpeed) * k;
		c.gustiness += (t.gustiness - c.gustiness) * k;
		float dirDiff = (float) Math.toRadians(Mth.wrapDegrees((float) Math.toDegrees(t.windDirection - c.windDirection)));
		c.windDirection += dirDiff * k;

		c.simTicks++;
		if (Math.abs(c.simTicks - t.simTicks) > 20) {
			c.simTicks = t.simTicks;
		}

		// Integrate drift locally for smooth motion, then pull gently towards the authoritative offset.
		float drift = c.windSpeed * Climate.windAltitudeFactor(200, level.getSeaLevel()) * CLOUD_DRIFT_SCALE / 20.0F;
		double ox = c.cloudOffsetX + c.windX() * drift;
		double oz = c.cloudOffsetZ + c.windZ() * drift;
		double ex = wrappedDelta(t.cloudOffsetX, ox);
		double ez = wrappedDelta(t.cloudOffsetZ, oz);
		if (Math.abs(ex) > 256.0 || Math.abs(ez) > 256.0) {
			ox = t.cloudOffsetX;
			oz = t.cloudOffsetZ;
			this.prevOffsetX = ox;
			this.prevOffsetZ = oz;
		} else {
			ox += ex * 0.04;
			oz += ez * 0.04;
		}
		c.cloudOffsetX = ox;
		c.cloudOffsetZ = oz;
		if (Math.abs(c.cloudOffsetX - CloudNoise.wrap(c.cloudOffsetX)) > 1.0 || Math.abs(c.cloudOffsetZ - CloudNoise.wrap(c.cloudOffsetZ)) > 1.0) {
			// Keep the offsets small without breaking interpolation: shift the previous values along.
			double wx = CloudNoise.wrap(c.cloudOffsetX);
			double wz = CloudNoise.wrap(c.cloudOffsetZ);
			this.prevOffsetX += wx - c.cloudOffsetX;
			this.prevOffsetZ += wz - c.cloudOffsetZ;
			c.cloudOffsetX = wx;
			c.cloudOffsetZ = wz;
		}
	}

	private static double wrappedDelta(double to, double from) {
		double d = (to - from) % CloudNoise.PERIOD;
		if (d > CloudNoise.PERIOD / 2.0) {
			d -= CloudNoise.PERIOD;
		} else if (d < -CloudNoise.PERIOD / 2.0) {
			d += CloudNoise.PERIOD;
		}
		return d;
	}

	private void sampleSurroundings(Minecraft minecraft, ClientLevel level) {
		Camera camera = minecraft.gameRenderer.getMainCamera();
		Vec3 pos = camera.isInitialized() ? camera.position() : minecraft.player != null ? minecraft.player.getEyePosition() : Vec3.ZERO;
		BlockPos cameraPos = BlockPos.containing(pos);

		if (!this.weatherDimension) {
			this.exposure = 0.0F;
			this.localType = Climate.Precipitation.NONE;
			this.localIntensity = 0.0F;
			this.wetness = Math.max(0.0F, this.wetness - 0.01F);
			this.inCloud = 0.0F;
			return;
		}

		if ((this.clientTicks & 3) == 0) {
			this.exposureTarget = this.measureExposure(level, pos);
		}
		this.exposure += (this.exposureTarget - this.exposure) * 0.15F;

		Biome biome = level.getBiome(cameraPos).value();
		this.localType = Climate.precipitationFor(level, biome, cameraPos, this.current.coldSnap);
		this.localHumidity = Climate.humidity(biome);
		this.localTemperature = Climate.effectiveTemperature(level, biome, cameraPos, this.current.coldSnap);
		double nx = pos.x - this.current.cloudOffsetX;
		double nz = pos.z - this.current.cloudOffsetZ;
		float intensity = this.localType == Climate.Precipitation.NONE ? 0.0F
			: this.current.precipitation * Climate.localIntensity(biome, nx, nz, this.current.cloudCover);
		float cloudBase = CloudLayer.baseHeight(level, this.current);
		if (pos.y > cloudBase + 20.0) {
			intensity *= Mth.clamp(1.0F - (float) (pos.y - cloudBase - 20.0) / 40.0F, 0.0F, 1.0F);
		}
		this.localIntensity += (Mth.clamp(intensity, 0.0F, 1.2F) - this.localIntensity) * 0.1F;

		boolean wetting = (this.localType == Climate.Precipitation.RAIN || this.localType == Climate.Precipitation.SLEET) && this.localIntensity > 0.04F;
		if (wetting) {
			this.wetness = Math.min(1.0F, this.wetness + 0.0035F * (0.3F + this.localIntensity));
		} else {
			float dry = 0.0007F * (level.isBrightOutside() ? 1.6F : 0.6F) * (0.6F + Math.max(0.0F, this.localTemperature));
			if (this.localType == Climate.Precipitation.SNOW) {
				dry *= 0.5F;
			}
			this.wetness = Math.max(0.0F, this.wetness - dry);
		}

		float thickness = CloudLayer.thickness(this.current);
		float h = (float) ((pos.y - cloudBase) / thickness);
		float cloudDensity = 0.0F;
		if (h > 0.0F && h < 1.0F) {
			float coverage = CloudNoise.coverageAt(CloudNoise.wrap(nx), CloudNoise.wrap(nz), this.current.cloudCover);
			float top = Mth.lerp(coverage, 0.35F, 1.0F);
			cloudDensity = coverage * Mth.clamp(h / 0.08F, 0.0F, 1.0F) * Mth.clamp((top - h) / (top * 0.3F), 0.0F, 1.0F);
		}
		this.inCloud += (cloudDensity - this.inCloud) * 0.2F;
	}

	private float exposureTarget = 1.0F;

	private static final int[][] EXPOSURE_SAMPLES = {
		{0, 0}, {0, 0}, {0, 0}, {3, 0}, {-3, 0}, {0, 3}, {0, -3}, {6, 4}, {-6, 4}, {4, -6}, {-4, -6}, {7, -1}, {-7, 1}
	};

	private float measureExposure(ClientLevel level, Vec3 pos) {
		int exposed = 0;
		int bx = Mth.floor(pos.x);
		int bz = Mth.floor(pos.z);
		double y = pos.y + 0.5;
		boolean roof = false;
		for (int i = 0; i < EXPOSURE_SAMPLES.length; i++) {
			int x = bx + EXPOSURE_SAMPLES[i][0];
			int z = bz + EXPOSURE_SAMPLES[i][1];
			int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
			boolean open = top <= y + 1.0;
			if (open) {
				exposed++;
			}
			if (i == 0 && !open) {
				roof = true;
			}
		}
		this.underRoof = roof;
		return exposed / (float) EXPOSURE_SAMPLES.length;
	}

	// -----------------------------------------------------------------------------------------------------------
	// Lightning flashes
	// -----------------------------------------------------------------------------------------------------------

	public record Flash(long startTick, float intensity, double x, double y, double z, boolean bolt, long seed) {
	}

	public void addFlash(double x, double y, double z, float intensity, boolean bolt, long seed) {
		if (this.flashes.size() > 24) {
			this.flashes.removeFirst();
		}
		this.flashes.add(new Flash(this.clientTicks, intensity, x, y, z, bolt, seed));
	}

	public List<Flash> flashes() {
		return this.flashes;
	}

	public long clientTicks() {
		return this.clientTicks;
	}

	/** Brightness of a single flash: a few rapid return strokes followed by a short afterglow. */
	public float flashEnvelope(Flash flash, float partialTick) {
		float age = (this.clientTicks - flash.startTick + partialTick) / 20.0F;
		if (age < 0.0F || age > 2.5F) {
			return 0.0F;
		}
		long s = flash.seed;
		int strokes = 1 + (int) ((s >>> 8) & 3L);
		float value = 0.0F;
		float strokeTime = 0.0F;
		for (int i = 0; i < strokes; i++) {
			if (age >= strokeTime) {
				float strength = i == 0 ? 1.0F : 0.55F + 0.4F * (((s >>> (12 + i * 5)) & 31L) / 31.0F);
				value += strength * (float) Math.exp(-(age - strokeTime) / 0.045F);
			}
			strokeTime += 0.07F + 0.09F * (((s >>> (20 + i * 7)) & 15L) / 15.0F);
		}
		value += 0.18F * (float) Math.exp(-age / 0.35F);
		return Math.min(1.5F, value) * flash.intensity;
	}

	/** Combined, distance-weighted flash brightness as seen from a position (for sky and world lighting). */
	public float flashBrightness(Vec3 viewer, float partialTick) {
		float total = 0.0F;
		for (Iterator<Flash> it = this.flashes.iterator(); it.hasNext(); ) {
			Flash flash = it.next();
			float envelope = this.flashEnvelope(flash, partialTick);
			if (envelope <= 0.0F) {
				continue;
			}
			double dx = flash.x - viewer.x;
			double dz = flash.z - viewer.z;
			double distance = Math.sqrt(dx * dx + dz * dz);
			float falloff = (float) (1.0 / (1.0 + distance / 220.0));
			total += envelope * falloff;
		}
		return Math.min(total, 1.6F);
	}

	/** The brightest flash right now, for localized cloud illumination. */
	public Flash brightestFlash(float partialTick) {
		Flash best = null;
		float bestValue = 0.02F;
		for (Flash flash : this.flashes) {
			float value = this.flashEnvelope(flash, partialTick);
			if (value > bestValue) {
				bestValue = value;
				best = flash;
			}
		}
		return best;
	}

	// -----------------------------------------------------------------------------------------------------------
	// Accessors (frame interpolated)
	// -----------------------------------------------------------------------------------------------------------

	public WeatherState state() {
		return this.current;
	}

	public boolean hasWeather() {
		return this.weatherDimension && this.initialized;
	}

	public float precipitation(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevPrecipitation, this.current.precipitation) : 0.0F;
	}

	public float cloudCover(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevCloudCover, this.current.cloudCover) : 0.0F;
	}

	public float storm(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevStorm, this.current.storm) : 0.0F;
	}

	public float fog(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevFog, this.current.fog) : 0.0F;
	}

	public float coldSnap(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevColdSnap, this.current.coldSnap) : 0.0F;
	}

	public float coldSnap() {
		return this.hasWeather() ? this.current.coldSnap : 0.0F;
	}

	public float windSpeed(float partialTick) {
		return this.hasWeather() ? Mth.lerp(partialTick, this.prevWindSpeed, this.current.windSpeed) : 0.0F;
	}

	public float windDirection(float partialTick) {
		float diff = (float) Math.toRadians(Mth.wrapDegrees((float) Math.toDegrees(this.current.windDirection - this.prevWindDirection)));
		return this.prevWindDirection + diff * partialTick;
	}

	public double cloudOffsetX(float partialTick) {
		return Mth.lerp(partialTick, this.prevOffsetX, this.current.cloudOffsetX);
	}

	public double cloudOffsetZ(float partialTick) {
		return Mth.lerp(partialTick, this.prevOffsetZ, this.current.cloudOffsetZ);
	}

	/** Gust multiplier at this instant, identical on every client. */
	public float gust(float partialTick) {
		return WeatherState.gustFactor(this.current.seed, this.current.simTicks + partialTick, this.current.gustiness);
	}

	/** Wind vector (m/s, X and Z) including gusts and veer, at the given altitude. */
	public float[] windVector(float partialTick, double y, int seaLevel) {
		float speed = this.windSpeed(partialTick) * this.gust(partialTick) * Climate.windAltitudeFactor(y, seaLevel);
		float direction = this.windDirection(partialTick)
			+ WeatherState.gustVeer(this.current.seed, this.current.simTicks + partialTick, this.current.gustiness);
		return new float[] {(float) -Math.sin(direction) * speed, (float) Math.cos(direction) * speed};
	}

	public float exposure(float partialTick) {
		return Mth.lerp(partialTick, this.prevExposure, this.exposure);
	}

	public boolean underRoof() {
		return this.underRoof;
	}

	public Climate.Precipitation localType() {
		return this.localType;
	}

	public float localIntensity(float partialTick) {
		return Mth.lerp(partialTick, this.prevLocalIntensity, this.localIntensity);
	}

	public float localHumidity() {
		return this.localHumidity;
	}

	public float localTemperature() {
		return this.localTemperature;
	}

	public float wetness(float partialTick) {
		return Mth.lerp(partialTick, this.prevWetness, this.wetness);
	}

	public float inCloud(float partialTick) {
		return Mth.lerp(partialTick, this.prevInCloud, this.inCloud);
	}
}
