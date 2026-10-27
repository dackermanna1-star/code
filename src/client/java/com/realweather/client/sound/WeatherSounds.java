package com.realweather.client.sound;

import com.realweather.RealWeather;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.weather.Climate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.FogType;
import net.minecraft.world.phys.Vec3;

/**
 * Weather soundscape: continuously crossfaded ambience (light/heavy rain outdoors, muffled rain on the roof when
 * indoors, breeze, strong wind and blizzard howl) and thunder that arrives after the flash with the delay of sound
 * travelling at 343 m/s, its character changing from a sharp crack to a distant rumble with distance.
 *
 * <p>Sound events are not registered in any registry (sounds.json is enough on the client), so the mod never
 * causes registry mismatches with servers or clients that do not have it.
 */
public final class WeatherSounds {
	public static final SoundEvent RAIN_LIGHT = event("ambient.rain.light");
	public static final SoundEvent RAIN_HEAVY = event("ambient.rain.heavy");
	public static final SoundEvent RAIN_INDOOR = event("ambient.rain.indoor");
	public static final SoundEvent WIND_LIGHT = event("ambient.wind.light");
	public static final SoundEvent WIND_STRONG = event("ambient.wind.strong");
	public static final SoundEvent BLIZZARD = event("ambient.blizzard");
	public static final SoundEvent THUNDER_NEAR = event("thunder.near");
	public static final SoundEvent THUNDER_FAR = event("thunder.far");
	public static final SoundEvent THUNDER_DISTANT = event("thunder.distant");

	private static final float SPEED_OF_SOUND = 343.0F;
	private static final WeatherSounds INSTANCE = new WeatherSounds();

	private final List<Loop> loops = new ArrayList<>();
	private final List<PendingThunder> pending = new ArrayList<>();
	private final RandomSource random = RandomSource.create();
	private long ticks;
	private int vanillaRainCooldown;

	// Smoothed mix levels.
	private float rainLight;
	private float rainHeavy;
	private float rainIndoor;
	private float windLight;
	private float windStrong;
	private float blizzard;
	private float windPitch = 1.0F;

	private record PendingThunder(long playTick, Vec3 source, float distance, float intensity, boolean bolt) {
	}

	public static WeatherSounds get() {
		return INSTANCE;
	}

	private WeatherSounds() {
		this.loops.add(new Loop(RAIN_LIGHT, () -> this.rainLight, () -> 1.0F));
		this.loops.add(new Loop(RAIN_HEAVY, () -> this.rainHeavy, () -> 1.0F));
		this.loops.add(new Loop(RAIN_INDOOR, () -> this.rainIndoor, () -> 1.0F));
		this.loops.add(new Loop(WIND_LIGHT, () -> this.windLight, () -> this.windPitch));
		this.loops.add(new Loop(WIND_STRONG, () -> this.windStrong, () -> this.windPitch));
		this.loops.add(new Loop(BLIZZARD, () -> this.blizzard, () -> 0.95F + (this.windPitch - 1.0F) * 0.6F));
	}

	private static SoundEvent event(String path) {
		return SoundEvent.createVariableRangeEvent(RealWeather.id(path));
	}

	public void reset() {
		this.pending.clear();
		this.rainLight = this.rainHeavy = this.rainIndoor = this.windLight = this.windStrong = this.blizzard = 0.0F;
	}

	public void tick(Minecraft minecraft) {
		this.ticks++;
		ClientLevel level = minecraft.level;
		ClientConfig config = ClientConfig.get();
		if (level == null || minecraft.player == null) {
			this.pending.clear();
			return;
		}
		Camera camera = minecraft.gameRenderer.getMainCamera();
		Vec3 cameraPos = camera.isInitialized() ? camera.position() : minecraft.player.getEyePosition();
		this.tickThunder(minecraft, cameraPos);

		ClientWeather weather = ClientWeather.get();
		float exposure = weather.exposure(1.0F);
		float intensity = weather.localIntensity(1.0F);
		Climate.Precipitation type = weather.localType();
		boolean rainy = type == Climate.Precipitation.RAIN || type == Climate.Precipitation.SLEET;
		float underwater = camera.isInitialized() && camera.getFluidInCamera() == FogType.WATER ? 0.25F : 1.0F;

		float rainLevel = rainy ? intensity : 0.0F;
		// A roof overhead: heavy, muffled drumming; out in the open: the full, airy rain sound.
		float open = Mth.clamp(exposure * 1.25F, 0.0F, 1.0F);
		float targetRainLight = Mth.clamp(rainLevel * 2.2F, 0.0F, 1.0F) * (1.0F - smoothstep(0.45F, 0.9F, rainLevel) * 0.6F) * open;
		float targetRainHeavy = smoothstep(0.3F, 0.85F, rainLevel) * open;
		float targetRainIndoor = Mth.clamp(rainLevel * 1.6F, 0.0F, 1.0F) * (1.0F - open) * (weather.underRoof() ? 1.0F : 0.4F);

		float[] wind = weather.windVector(1.0F, cameraPos.y, level.getSeaLevel());
		float windSpeed = Mth.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		float shelter = 0.3F + 0.7F * exposure;
		float effectiveWind = windSpeed * shelter * (weather.hasWeather() ? 1.0F : 0.0F);
		float snowy = type == Climate.Precipitation.SNOW ? 1.0F : type == Climate.Precipitation.SLEET ? 0.5F : 0.0F;
		float targetWindLight = smoothstep(1.5F, 7.0F, effectiveWind) * (1.0F - smoothstep(10.0F, 18.0F, effectiveWind) * 0.7F) * 0.75F;
		float targetWindStrong = smoothstep(6.5F, 18.0F, effectiveWind);
		float targetBlizzard = smoothstep(7.0F, 16.0F, effectiveWind) * snowy * Mth.clamp(intensity * 1.6F, 0.0F, 1.0F);
		targetWindStrong *= 1.0F - targetBlizzard * 0.5F;
		float gust = weather.gust(1.0F);

		boolean enabled = config.ambientSounds && weather.hasWeather();
		float rainVolume = enabled ? config.rainVolume * underwater : 0.0F;
		float windVolume = enabled ? config.windVolume * underwater : 0.0F;
		this.rainLight = approach(this.rainLight, targetRainLight * rainVolume * 0.75F);
		this.rainHeavy = approach(this.rainHeavy, targetRainHeavy * rainVolume * 0.9F);
		this.rainIndoor = approach(this.rainIndoor, targetRainIndoor * rainVolume * 0.85F);
		this.windLight = approach(this.windLight, targetWindLight * windVolume * 0.7F);
		this.windStrong = approach(this.windStrong, targetWindStrong * windVolume * 0.85F);
		this.blizzard = approach(this.blizzard, targetBlizzard * windVolume);
		this.windPitch = Mth.clamp(0.88F + (gust - 1.0F) * 0.22F + effectiveWind * 0.004F, 0.75F, 1.25F);

		for (Loop loop : this.loops) {
			loop.ensurePlaying(minecraft);
		}

		if ((!config.ambientSounds || !config.replaceVanillaRainSounds) && rainy && intensity > 0.05F) {
			this.playVanillaRainSounds(level, cameraPos, intensity);
		}
	}

	private void playVanillaRainSounds(ClientLevel level, Vec3 camera, float intensity) {
		if (--this.vanillaRainCooldown > 0) {
			return;
		}
		this.vanillaRainCooldown = 2 + this.random.nextInt(3);
		BlockPos cameraPos = BlockPos.containing(camera);
		BlockPos ground = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING,
			cameraPos.offset(this.random.nextInt(21) - 10, 0, this.random.nextInt(21) - 10));
		if (Math.abs(ground.getY() - cameraPos.getY()) > 10) {
			return;
		}
		boolean above = ground.getY() > cameraPos.getY() + 1;
		level.playLocalSound(ground, above ? SoundEvents.WEATHER_RAIN_ABOVE : SoundEvents.WEATHER_RAIN, SoundSource.WEATHER,
			(above ? 0.1F : 0.2F) * Math.min(1.0F, intensity * 1.5F), above ? 0.5F : 1.0F, false);
	}

	private static float approach(float value, float target) {
		return value + (target - value) * 0.06F;
	}

	private static float smoothstep(float edge0, float edge1, float x) {
		float t = Mth.clamp((x - edge0) / (edge1 - edge0), 0.0F, 1.0F);
		return t * t * (3.0F - 2.0F * t);
	}

	// -----------------------------------------------------------------------------------------------------------
	// Thunder
	// -----------------------------------------------------------------------------------------------------------

	/** Schedules thunder for a lightning event; the sound arrives after the light, delayed by distance. */
	public void onLightning(Vec3 source, float intensity, boolean bolt) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.player == null) {
			return;
		}
		Camera camera = minecraft.gameRenderer.getMainCamera();
		Vec3 listener = camera.isInitialized() ? camera.position() : minecraft.player.getEyePosition();
		float distance = (float) listener.distanceTo(source);
		long delay = ClientConfig.get().realisticThunderDelay ? Math.round(distance / SPEED_OF_SOUND * 20.0F) : 0L;
		if (this.pending.size() < 32) {
			this.pending.add(new PendingThunder(this.ticks + delay, source, distance, intensity, bolt));
		}
	}

	private void tickThunder(Minecraft minecraft, Vec3 listener) {
		for (Iterator<PendingThunder> it = this.pending.iterator(); it.hasNext(); ) {
			PendingThunder thunder = it.next();
			if (thunder.playTick > this.ticks) {
				continue;
			}
			it.remove();
			this.playThunder(minecraft, listener, thunder);
		}
	}

	private void playThunder(Minecraft minecraft, Vec3 listener, PendingThunder thunder) {
		ClientConfig config = ClientConfig.get();
		if (config.thunderVolume <= 0.0F) {
			return;
		}
		float distance = (float) listener.distanceTo(thunder.source);
		SoundEvent event;
		float volume;
		float pitch;
		if (distance < 140.0F) {
			event = THUNDER_NEAR;
			volume = 1.0F;
			pitch = 0.92F + this.random.nextFloat() * 0.16F;
		} else if (distance < 480.0F) {
			event = THUNDER_FAR;
			volume = Mth.lerp((distance - 140.0F) / 340.0F, 0.95F, 0.6F);
			pitch = 0.85F + this.random.nextFloat() * 0.2F;
		} else {
			event = THUNDER_DISTANT;
			volume = Mth.clamp(0.6F - (distance - 480.0F) / 1600.0F, 0.18F, 0.6F);
			pitch = 0.8F + this.random.nextFloat() * 0.2F;
		}
		if (!thunder.bolt) {
			// In-cloud discharges rumble but never crack.
			event = distance < 480.0F ? THUNDER_FAR : THUNDER_DISTANT;
			volume *= 0.8F;
		}
		volume *= Mth.clamp(0.55F + 0.45F * thunder.intensity, 0.3F, 1.0F) * config.thunderVolume;
		// Place the sound a short distance away in the direction of the strike so stereo panning is right,
		// while loudness is controlled here rather than by OpenAL's distance attenuation.
		Vec3 direction = thunder.source.subtract(listener);
		double length = direction.length();
		Vec3 position = length > 1.0E-3 ? listener.add(direction.scale(12.0 / length)) : listener;
		minecraft.getSoundManager().play(new SimpleSoundInstance(event.location(), SoundSource.WEATHER, Math.min(volume, 1.6F), pitch,
			this.random, false, 0, SoundInstance.Attenuation.NONE, position.x, position.y, position.z, false));
	}

	// -----------------------------------------------------------------------------------------------------------

	/** A looping ambience whose volume follows a supplier and that restarts itself if the sound engine drops it. */
	private final class Loop {
		private final SoundEvent event;
		private final Supplier<Float> volume;
		private final Supplier<Float> pitch;
		private LoopInstance instance;

		Loop(SoundEvent event, Supplier<Float> volume, Supplier<Float> pitch) {
			this.event = event;
			this.volume = volume;
			this.pitch = pitch;
		}

		void ensurePlaying(Minecraft minecraft) {
			float v = this.volume.get();
			boolean playing = this.instance != null && !this.instance.isStopped() && minecraft.getSoundManager().isActive(this.instance);
			if (v > 0.004F && !playing) {
				this.instance = new LoopInstance(this.event, this.volume, this.pitch);
				minecraft.getSoundManager().play(this.instance);
			}
		}
	}

	private static final class LoopInstance extends AbstractTickableSoundInstance {
		private final Supplier<Float> targetVolume;
		private final Supplier<Float> targetPitch;
		private int silentTicks;

		LoopInstance(SoundEvent event, Supplier<Float> volume, Supplier<Float> pitch) {
			super(event, SoundSource.WEATHER, SoundInstance.createUnseededRandom());
			this.targetVolume = volume;
			this.targetPitch = pitch;
			this.looping = true;
			this.delay = 0;
			this.relative = true;
			this.attenuation = SoundInstance.Attenuation.NONE;
			this.volume = Math.max(0.001F, volume.get());
			this.pitch = pitch.get();
		}

		@Override
		public void tick() {
			float v = this.targetVolume.get();
			this.volume = Math.max(0.0F, v);
			this.pitch = this.targetPitch.get();
			this.silentTicks = v <= 0.003F ? this.silentTicks + 1 : 0;
			if (this.silentTicks > 60 || Minecraft.getInstance().level == null) {
				this.stop();
			}
		}

		@Override
		public boolean canStartSilent() {
			return true;
		}
	}
}
