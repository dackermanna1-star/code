package com.ordnance.client.fx;

import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.registry.ModSounds;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.sound.PositionedSoundInstance;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;

/**
 * Explosion audio. A sharp near-field report (size-dependent) and a low, long distant rumble are layered by
 * listener distance, and both arrive after the travel time of sound when realistic delay is enabled.
 */
public final class ExplosionSounds {
	/** 343 m/s at 20 ticks per second, one block being one metre. */
	public static final double SPEED_OF_SOUND = 17.15;
	/** Matches attenuation_distance in sounds.json. */
	private static final float NEAR_ATTENUATION = 48.0F;
	private static final float FAR_ATTENUATION = 128.0F;

	private ExplosionSounds() {
	}

	public static int travelTicks(double distance) {
		return ConfigManager.get().visuals.realisticSoundDelay ? (int)(distance / SPEED_OF_SOUND) : 0;
	}

	public static void play(Vec3d pos, ExplosionProfile.FxStyle style, float scale, boolean underwater, Random random) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.gameRenderer == null) {
			return;
		}

		double distance = client.gameRenderer.getCamera().getCameraPos().distanceTo(pos);
		int delay = travelTicks(distance);
		float nearRange = NEAR_ATTENUATION * (0.8F + scale * 0.55F);
		float pitch = (0.92F + random.nextFloat() * 0.16F) * (scale > 3.0F ? 0.88F : 1.0F);
		SoundEvent near;
		if (underwater) {
			near = ModSounds.EXPLOSION_UNDERWATER;
		} else if (style == ExplosionProfile.FxStyle.SMOKE) {
			near = ModSounds.SMOKE_POP;
			nearRange = 32.0F;
		} else if (style == ExplosionProfile.FxStyle.INCENDIARY) {
			near = ModSounds.EXPLOSION_INCENDIARY;
		} else if (scale < 1.35F) {
			near = ModSounds.EXPLOSION_SMALL;
		} else if (scale < 2.2F) {
			near = ModSounds.EXPLOSION_MEDIUM;
		} else if (scale < 4.0F) {
			near = ModSounds.EXPLOSION_LARGE;
		} else {
			near = ModSounds.EXPLOSION_HUGE;
		}

		if (distance < nearRange * 1.1) {
			play(client, near, pos, nearRange / NEAR_ATTENUATION, pitch, delay);
		}

		if (style == ExplosionProfile.FxStyle.SMOKE || underwater) {
			return;
		}

		float farRange = nearRange * 4.0F;
		if (distance > nearRange * 0.35 && distance < farRange) {
			SoundEvent far = scale >= 4.0F ? ModSounds.EXPLOSION_DISTANT_HUGE : ModSounds.EXPLOSION_DISTANT;
			play(client, far, pos, farRange / FAR_ATTENUATION, 0.85F + random.nextFloat() * 0.2F, delay);
		}

		if (scale >= 4.0F && distance > 20.0) {
			// The missile's own shock cone reaches the listener just ahead of the blast.
			play(client, ModSounds.MISSILE_BOOM, pos, farRange / FAR_ATTENUATION, 1.0F, Math.max(0, delay - 6));
		}

		if (scale >= 1.4F && distance < nearRange) {
			play(client, ModSounds.EXPLOSION_DEBRIS, pos, Math.max(1.0F, scale * 0.6F), 0.9F + random.nextFloat() * 0.2F, delay + 12 + random.nextInt(14));
		}
	}

	public static void play(MinecraftClient client, SoundEvent event, Vec3d pos, float volume, float pitch, int delay) {
		PositionedSoundInstance sound = new PositionedSoundInstance(event, SoundCategory.BLOCKS, volume, pitch, Random.create(), pos.x, pos.y, pos.z);
		if (delay > 0) {
			client.getSoundManager().play(sound, delay);
		} else {
			client.getSoundManager().play(sound);
		}
	}
}
