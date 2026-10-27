package com.realweather.weather;

import com.realweather.RealWeather;
import com.realweather.config.RealWeatherConfig;
import com.realweather.network.RealWeatherNetworking;
import com.realweather.network.WeatherSyncPayload;
import com.realweather.world.LightningDirector;
import com.realweather.world.SnowAccumulation;
import java.util.EnumMap;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.storage.ServerLevelData;
import org.jspecify.annotations.Nullable;

/**
 * Server-side weather simulation. One instance exists per running server and drives the overworld (and every
 * dimension that shares its weather).
 *
 * <p>The simulator is the single source of truth: it chooses weather regimes, blends all parameters smoothly,
 * evolves wind and gusts, drifts the cloud field, and keeps vanilla's {@code raining}/{@code thundering} flags in
 * sync so vanilla gameplay (crops, mobs, tridents, fishing, vanilla clients) behaves consistently. External
 * changes made through vanilla ({@code /weather}, sleeping, other mods) are detected and adopted.
 */
public final class WeatherSimulator {
	private static final float SECONDS_PER_TICK = 1.0F / 20.0F;
	/** Visual scale between wind speed (m/s) and cloud drift (blocks/s) for clouds that sit ~200 blocks up. */
	private static final float CLOUD_DRIFT_SCALE = 0.18F;
	private static final int CLOUD_ALTITUDE = 200;
	private static final int VANILLA_REFRESH_TICKS = 600;
	private static final int COMMAND_BOOST_TICKS = 1200;

	private static @Nullable WeatherSimulator instance;

	private final MinecraftServer server;
	private final WeatherSavedData data;
	private final WeatherState state;
	private final RandomSource random = RandomSource.create();
	private final SnowAccumulation snow = new SnowAccumulation();
	private final LightningDirector lightning = new LightningDirector();

	private boolean applyingVanilla;
	private boolean appliedRaining;
	private boolean appliedThundering;
	private int vanillaRefresh;
	private int boostTicks;
	private int syncCountdown;
	private boolean syncNow = true;

	private WeatherSimulator(MinecraftServer server, WeatherSavedData data) {
		this.server = server;
		this.data = data;
		this.state = data.state();
	}

	public static void start(MinecraftServer server) {
		ServerLevel overworld = server.overworld();
		WeatherSavedData data = overworld.getDataStorage().computeIfAbsent(WeatherSavedData.TYPE);
		WeatherSimulator simulator = new WeatherSimulator(server, data);
		if (data.isFresh()) {
			simulator.initializeFromVanilla(overworld);
			data.markInitialized();
		}
		simulator.appliedRaining = overworld.getLevelData().isRaining();
		simulator.appliedThundering = overworld.getLevelData().isThundering();
		instance = simulator;
		RealWeather.LOGGER.info("Weather simulation started: {} ({}s left, dynamic={})", simulator.state.type.id(),
			simulator.state.remainingTicks / 20, simulator.state.dynamic);
	}

	public static void stop() {
		instance = null;
	}

	public static @Nullable WeatherSimulator get() {
		return instance;
	}

	public WeatherState state() {
		return this.state;
	}

	public MinecraftServer server() {
		return this.server;
	}

	// ---------------------------------------------------------------------------------------------------------
	// Ticking
	// ---------------------------------------------------------------------------------------------------------

	public void tick(ServerLevel overworld) {
		RealWeatherConfig config = RealWeatherConfig.get();
		this.adoptExternalVanillaChanges(overworld);

		boolean advancing = overworld.getGameRules().get(GameRules.ADVANCE_WEATHER) && overworld.tickRateManager().runsNormally();
		if (advancing) {
			if (this.state.remainingTicks > 0) {
				this.state.remainingTicks--;
			}
			if (this.state.remainingTicks <= 0) {
				if (this.state.dynamic && config.dynamicWeather) {
					this.beginRegime(this.chooseNextRegime(overworld), -1, -1.0F, false);
				} else {
					this.state.remainingTicks = 0;
				}
			}
		}

		this.blend(config);
		this.integrateWind(config, overworld);
		this.state.simTicks++;
		if (this.boostTicks > 0 && --this.boostTicks == 0) {
			this.state.transitionBoost = 1.0F;
		}

		this.syncVanillaFlags(overworld);

		for (ServerLevel level : this.server.getAllLevels()) {
			if (level.canHaveWeather()) {
				this.snow.tick(level, this.state);
			}
		}
		this.lightning.tick(overworld, this.state);

		if (this.syncNow || --this.syncCountdown <= 0) {
			this.broadcast();
			this.syncNow = false;
			this.syncCountdown = config.syncIntervalTicks;
		}
		this.data.setDirty();
	}

	private void blend(RealWeatherConfig config) {
		WeatherType type = this.state.type;
		float intensity = Mth.clamp(this.state.effectiveIntensity() * config.intensityMultiplier, 0.0F, 1.5F);
		float speed = config.transitionSpeed * this.state.transitionBoost;

		float cloudTarget = switch (type) {
			case CLEAR -> 0.06F + 0.34F * Mth.clamp(intensity, 0.0F, 1.0F);
			case FOG -> 0.35F + 0.3F * Mth.clamp(intensity, 0.0F, 1.0F);
			default -> Math.min(1.0F, type.cloudCover * (0.92F + 0.08F * intensity));
		};
		// Precipitation waits for the clouds to build up and stops before they break apart.
		float cloudGate = smoothstep(0.55F, 0.86F, this.state.cloudCover);
		float precipTarget = type.hasPrecipitation() ? Mth.clamp(type.precipitation * (0.25F + intensity), 0.0F, 1.0F) * cloudGate : 0.0F;
		float stormTarget = type.storm * (0.35F + 0.65F * Mth.clamp(intensity, 0.0F, 1.0F)) * smoothstep(0.15F, 0.45F, this.state.precipitation);
		float fogTarget = type == WeatherType.FOG ? type.fog * (0.45F + 0.55F * Mth.clamp(intensity, 0.0F, 1.0F)) : type.fog * Mth.clamp(intensity, 0.0F, 1.0F);

		float windTarget = this.state.windOverride >= 0.0F ? this.state.windOverride : this.state.windTargetSpeed * config.windMultiplier;
		windTarget = Mth.clamp(windTarget, 0.0F, config.maxWindSpeed);
		float dirTarget = Float.isNaN(this.state.windDirectionOverride)
			? this.state.windTargetDirection
			: (float) Math.toRadians(this.state.windDirectionOverride);

		// Clouds thicken slowly but can clear a bit faster; precipitation responds quicker than clouds.
		float cloudTau = cloudTarget > this.state.cloudCover ? 45.0F : 60.0F;
		this.state.cloudCover = approach(this.state.cloudCover, cloudTarget, cloudTau, speed);
		this.state.precipitation = approach(this.state.precipitation, precipTarget, precipTarget > this.state.precipitation ? 22.0F : 16.0F, speed);
		this.state.storm = approach(this.state.storm, stormTarget, 18.0F, speed);
		this.state.coldSnap = approach(this.state.coldSnap, type.coldSnap, type.coldSnap > this.state.coldSnap ? 30.0F : 90.0F, speed);
		this.state.fog = approach(this.state.fog, fogTarget, 35.0F, speed);
		this.state.windSpeed = approach(this.state.windSpeed, windTarget, 25.0F, speed);
		this.state.gustiness = approach(this.state.gustiness, type.gustiness * (0.7F + 0.5F * Mth.clamp(intensity, 0.0F, 1.0F)), 20.0F, speed);
		this.state.windDirection = approachAngle(this.state.windDirection, dirTarget, 40.0F, speed);
	}

	private void integrateWind(RealWeatherConfig config, ServerLevel overworld) {
		if (Float.isNaN(this.state.windDirectionOverride)) {
			// Slow meandering of the prevailing wind.
			this.state.windTargetDirection = wrapAngle(this.state.windTargetDirection + (float) this.random.nextGaussian() * 0.0012F);
		}
		float altitude = Climate.windAltitudeFactor(CLOUD_ALTITUDE, overworld.getSeaLevel());
		float drift = this.state.windSpeed * altitude * CLOUD_DRIFT_SCALE * SECONDS_PER_TICK;
		this.state.cloudOffsetX = CloudNoise.wrap(this.state.cloudOffsetX + this.state.windX() * drift);
		this.state.cloudOffsetZ = CloudNoise.wrap(this.state.cloudOffsetZ + this.state.windZ() * drift);
	}

	// ---------------------------------------------------------------------------------------------------------
	// Regime selection
	// ---------------------------------------------------------------------------------------------------------

	private static final EnumMap<WeatherType, float[]> TRANSITIONS = new EnumMap<>(WeatherType.class);

	static {
		// Preference multipliers for the next regime, ordered like WeatherType.values().
		//                                          CLEAR OVERC FOG   RAIN  THUND SNOW  BLIZZ
		TRANSITIONS.put(WeatherType.CLEAR, new float[] {0.6F, 1.4F, 1.0F, 0.8F, 0.35F, 0.5F, 0.1F});
		TRANSITIONS.put(WeatherType.OVERCAST, new float[] {1.0F, 0.4F, 0.6F, 1.8F, 1.4F, 1.6F, 0.8F});
		TRANSITIONS.put(WeatherType.FOG, new float[] {1.6F, 1.4F, 0.2F, 0.6F, 0.2F, 0.5F, 0.1F});
		TRANSITIONS.put(WeatherType.RAIN, new float[] {0.7F, 1.6F, 0.8F, 0.5F, 1.6F, 0.4F, 0.2F});
		TRANSITIONS.put(WeatherType.THUNDER, new float[] {0.8F, 1.4F, 0.3F, 1.8F, 0.3F, 0.1F, 0.1F});
		TRANSITIONS.put(WeatherType.SNOW, new float[] {0.7F, 1.6F, 0.6F, 0.4F, 0.05F, 0.6F, 2.5F});
		TRANSITIONS.put(WeatherType.BLIZZARD, new float[] {0.5F, 1.2F, 0.3F, 0.1F, 0.05F, 3.0F, 0.2F});
	}

	private WeatherType chooseNextRegime(ServerLevel overworld) {
		RealWeatherConfig config = RealWeatherConfig.get();
		float[] preference = TRANSITIONS.get(this.state.type);
		long dayTime = overworld.getDayTime() % 24000L;
		boolean dawn = dayTime >= 21500L || dayTime < 1500L;
		WeatherType[] types = WeatherType.values();
		float[] weights = new float[types.length];
		float total = 0.0F;
		for (int i = 0; i < types.length; i++) {
			WeatherType type = types[i];
			float w = config.weight(type) * preference[i];
			if (type == WeatherType.FOG) {
				w *= dawn ? 3.0F : 0.4F;
			}
			if (type.coldSnap > 0.0F && !config.dynamicColdSnaps) {
				w = 0.0F;
			}
			weights[i] = Math.max(0.0F, w);
			total += weights[i];
		}
		if (total <= 0.0F) {
			return WeatherType.CLEAR;
		}
		float pick = this.random.nextFloat() * total;
		for (int i = 0; i < types.length; i++) {
			pick -= weights[i];
			if (pick <= 0.0F) {
				return types[i];
			}
		}
		return types[types.length - 1];
	}

	private float randomIntensity(WeatherType type) {
		float r = this.random.nextFloat();
		return switch (type) {
			case CLEAR -> r;
			case OVERCAST, FOG -> 0.4F + 0.6F * r;
			case THUNDER -> 0.55F + 0.45F * r;
			case BLIZZARD -> 0.65F + 0.35F * r;
			default -> 0.2F + 0.8F * (float) Math.pow(r, 0.8);
		};
	}

	private int randomDurationTicks(WeatherType type) {
		RealWeatherConfig config = RealWeatherConfig.get();
		int[] range = config.durationRange(type);
		int seconds = range[0] + (range[1] > range[0] ? this.random.nextInt(range[1] - range[0] + 1) : 0);
		return Math.max(200, Math.round(seconds * 20 * config.durationMultiplier));
	}

	/**
	 * Starts a new weather regime.
	 *
	 * @param durationTicks duration, or a negative value for a random natural duration
	 * @param intensity     intensity override in [0, 1], or a negative value for a random natural intensity
	 * @param fromCommand   whether an operator requested this (speeds up the transition)
	 */
	public void beginRegime(WeatherType type, int durationTicks, float intensity, boolean fromCommand) {
		WeatherType previous = this.state.type;
		this.state.type = type;
		this.state.remainingTicks = durationTicks > 0 ? durationTicks : this.randomDurationTicks(type);
		this.state.intensity = this.randomIntensity(type);
		this.state.intensityOverride = intensity >= 0.0F ? Mth.clamp(intensity, 0.0F, 1.0F) : -1.0F;
		float effective = this.state.effectiveIntensity();
		this.state.windTargetSpeed = type.baseWind * (0.65F + 0.7F * this.random.nextFloat()) * (0.75F + 0.5F * effective);
		if (previous != type) {
			// Fronts usually arrive with a shift in wind direction.
			this.state.windTargetDirection = wrapAngle(this.state.windTargetDirection + (this.random.nextFloat() - 0.5F) * 1.8F);
		}
		if (fromCommand) {
			this.state.transitionBoost = Math.max(1.0F, RealWeatherConfig.get().commandTransitionSpeed);
			this.boostTicks = COMMAND_BOOST_TICKS;
		}
		this.syncNow = true;
		this.data.setDirty();
	}

	private void initializeFromVanilla(ServerLevel overworld) {
		ServerLevelData levelData = (ServerLevelData) overworld.getLevelData();
		this.state.seed = this.random.nextLong();
		this.state.windTargetDirection = this.random.nextFloat() * Mth.TWO_PI;
		this.state.windDirection = this.state.windTargetDirection;
		this.state.cloudOffsetX = this.random.nextInt(CloudNoise.PERIOD);
		this.state.cloudOffsetZ = this.random.nextInt(CloudNoise.PERIOD);
		this.state.dynamic = RealWeatherConfig.get().dynamicWeather;
		WeatherType type;
		int duration;
		if (levelData.isThundering()) {
			type = WeatherType.THUNDER;
			duration = levelData.getThunderTime();
		} else if (levelData.isRaining()) {
			type = WeatherType.RAIN;
			duration = levelData.getRainTime();
		} else {
			type = WeatherType.CLEAR;
			duration = Math.max(levelData.getClearWeatherTime(), levelData.getRainTime());
		}
		this.beginRegime(type, duration > 0 ? duration : -1, -1.0F, false);
		this.snapToTargets();
	}

	/** Jumps all smoothed values to their targets (used when no previous state exists). */
	private void snapToTargets() {
		WeatherType type = this.state.type;
		float intensity = this.state.effectiveIntensity();
		this.state.cloudCover = type == WeatherType.CLEAR ? 0.06F + 0.34F * intensity : type.cloudCover;
		this.state.precipitation = type.hasPrecipitation() ? Mth.clamp(type.precipitation * (0.25F + intensity), 0.0F, 1.0F) : 0.0F;
		this.state.storm = type.storm * (0.35F + 0.65F * intensity);
		this.state.coldSnap = type.coldSnap;
		this.state.fog = type.fog * intensity;
		this.state.windSpeed = this.state.windTargetSpeed;
		this.state.gustiness = type.gustiness;
	}

	// ---------------------------------------------------------------------------------------------------------
	// Vanilla integration
	// ---------------------------------------------------------------------------------------------------------

	private void syncVanillaFlags(ServerLevel overworld) {
		boolean raining = this.appliedRaining ? this.state.precipitation > 0.02F : this.state.precipitation > 0.05F;
		boolean thundering = raining && (this.appliedThundering ? this.state.storm > 0.2F : this.state.storm > 0.3F);
		if (raining != this.appliedRaining || thundering != this.appliedThundering || --this.vanillaRefresh <= 0) {
			this.applyVanilla(overworld, raining, thundering);
		}
	}

	private void applyVanilla(ServerLevel overworld, boolean raining, boolean thundering) {
		// Keep vanilla's own timers far in the future so its cycle never flips the weather behind our back.
		int hold = Math.max(this.state.remainingTicks, 0) + 24000;
		this.applyingVanilla = true;
		try {
			overworld.setWeatherParameters(raining ? 0 : hold, raining ? hold : 0, raining, thundering);
		} finally {
			this.applyingVanilla = false;
		}
		this.appliedRaining = raining;
		this.appliedThundering = thundering;
		this.vanillaRefresh = VANILLA_REFRESH_TICKS;
	}

	/** Called from {@code ServerLevel#setWeatherParameters}: vanilla's /weather command and other mods. */
	public void onVanillaWeatherSet(ServerLevel level, int clearTime, int rainTime, boolean raining, boolean thundering) {
		if (this.applyingVanilla || level != this.server.overworld()) {
			return;
		}
		WeatherType type = thundering ? WeatherType.THUNDER : raining ? WeatherType.RAIN : WeatherType.CLEAR;
		int duration = raining ? rainTime : clearTime;
		this.beginRegime(type, duration > 0 ? duration : -1, -1.0F, true);
		this.appliedRaining = raining;
		this.appliedThundering = thundering;
	}

	/** Called from {@code ServerLevel#resetWeatherCycle}: players slept through the weather. */
	public void onVanillaWeatherReset(ServerLevel level) {
		if (this.applyingVanilla || level != this.server.overworld()) {
			return;
		}
		this.beginRegime(WeatherType.CLEAR, -1, -1.0F, true);
		this.appliedRaining = false;
		this.appliedThundering = false;
	}

	/** Catches flag changes that bypassed {@link #onVanillaWeatherSet} (e.g. mods writing level data directly). */
	private void adoptExternalVanillaChanges(ServerLevel overworld) {
		boolean raining = overworld.getLevelData().isRaining();
		boolean thundering = overworld.getLevelData().isThundering();
		if (raining == this.appliedRaining && thundering == this.appliedThundering) {
			return;
		}
		ServerLevelData levelData = (ServerLevelData) overworld.getLevelData();
		WeatherType type = thundering && raining ? WeatherType.THUNDER : raining ? WeatherType.RAIN : WeatherType.CLEAR;
		if (type.vanillaRaining == this.state.type.vanillaRaining && type.vanillaThundering == this.state.type.vanillaThundering) {
			// Consistent with our regime (e.g. snow is "raining" for vanilla); just re-assert our flags.
			this.applyVanilla(overworld, this.appliedRaining, this.appliedThundering);
			return;
		}
		int duration = raining ? levelData.getRainTime() : levelData.getClearWeatherTime();
		this.beginRegime(type, duration > 0 ? duration : -1, -1.0F, true);
		this.appliedRaining = raining;
		this.appliedThundering = thundering;
	}

	// ---------------------------------------------------------------------------------------------------------
	// Sync
	// ---------------------------------------------------------------------------------------------------------

	public void markForSync() {
		this.syncNow = true;
	}

	private void broadcast() {
		WeatherSyncPayload payload = WeatherSyncPayload.of(this.state, RealWeatherConfig.get().coldSnapStrength, false);
		for (ServerPlayer player : this.server.getPlayerList().getPlayers()) {
			RealWeatherNetworking.sendIfSupported(player, payload);
		}
	}

	public void sendTo(ServerPlayer player, boolean snap) {
		RealWeatherNetworking.sendIfSupported(player, WeatherSyncPayload.of(this.state, RealWeatherConfig.get().coldSnapStrength, snap));
	}

	// ---------------------------------------------------------------------------------------------------------
	// Operator controls
	// ---------------------------------------------------------------------------------------------------------

	public void setIntensityOverride(float intensity) {
		this.state.intensityOverride = intensity >= 0.0F ? Mth.clamp(intensity, 0.0F, 1.0F) : -1.0F;
		this.boost();
	}

	public void setWindOverride(float speed, float directionDegrees) {
		this.state.windOverride = speed;
		this.state.windDirectionOverride = directionDegrees;
		this.boost();
	}

	public void setRemainingTicks(int ticks) {
		this.state.remainingTicks = Math.max(1, ticks);
		this.syncNow = true;
		this.data.setDirty();
	}

	public void setDynamic(boolean dynamic) {
		this.state.dynamic = dynamic;
		this.syncNow = true;
		this.data.setDirty();
	}

	public void resetOverrides() {
		this.state.intensityOverride = -1.0F;
		this.state.windOverride = -1.0F;
		this.state.windDirectionOverride = Float.NaN;
		this.state.dynamic = true;
		this.boost();
	}

	private void boost() {
		this.state.transitionBoost = Math.max(1.0F, RealWeatherConfig.get().commandTransitionSpeed);
		this.boostTicks = COMMAND_BOOST_TICKS;
		this.syncNow = true;
		this.data.setDirty();
	}

	// ---------------------------------------------------------------------------------------------------------
	// Math helpers
	// ---------------------------------------------------------------------------------------------------------

	/** Exponential approach with a time constant in seconds, scaled by a speed multiplier. */
	static float approach(float value, float target, float tauSeconds, float speed) {
		float k = 1.0F - (float) Math.exp(-SECONDS_PER_TICK * speed / tauSeconds);
		float next = value + (target - value) * k;
		return Math.abs(target - next) < 1.0E-4F ? target : next;
	}

	static float approachAngle(float value, float target, float tauSeconds, float speed) {
		float diff = Mth.wrapDegrees((float) Math.toDegrees(target - value));
		float k = 1.0F - (float) Math.exp(-SECONDS_PER_TICK * speed / tauSeconds);
		return wrapAngle(value + (float) Math.toRadians(diff * k));
	}

	static float wrapAngle(float radians) {
		float r = radians % Mth.TWO_PI;
		return r < 0.0F ? r + Mth.TWO_PI : r;
	}

	public static float smoothstep(float edge0, float edge1, float x) {
		float t = Mth.clamp((x - edge0) / (edge1 - edge0), 0.0F, 1.0F);
		return t * t * (3.0F - 2.0F * t);
	}
}
