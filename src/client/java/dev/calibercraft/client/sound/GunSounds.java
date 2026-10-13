package dev.calibercraft.client.sound;

import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.registry.ModSounds;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Weapon audio presentation. Respects Minecraft's master/category volumes (everything plays through the sound
 * manager on the PLAYERS category) and adds: near/far layering by distance, muffling through walls, speed-of-sound
 * delay, suppressed profiles and gentle volume reduction during long automatic strings.
 */
public final class GunSounds {
	/** Speed of sound in blocks per tick (343 m/s). */
	private static final double SOUND_SPEED = 17.15;
	private static final RandomSource RANDOM = RandomSource.create();
	private static final List<Delayed> DELAYED = new ArrayList<>();
	private static int burstCount;
	private static long lastOwnShot;

	private record Delayed(SoundInstance sound, int[] ticks) {
	}

	private GunSounds() {
	}

	public static String soundSet(Identifier weapon, WeaponDefinition def) {
		return def.soundSet(weapon);
	}

	public static SoundEvent weaponSound(Identifier weapon, WeaponDefinition def, String event) {
		return ModSounds.get("weapon." + soundSet(weapon, def) + "." + event);
	}

	private static float master() {
		return ClientConfig.get().gunVolume;
	}

	/** Plays a sound at the local player's position (own weapon handling, UI-like feedback). */
	public static void playLocal(SoundEvent sound, float volume, float pitch) {
		Minecraft mc = Minecraft.getInstance();
		if (sound == null || mc.player == null) {
			return;
		}
		Vec3 p = mc.player.getEyePosition();
		mc.getSoundManager().play(new SimpleSoundInstance(sound, SoundSource.PLAYERS, volume * master(), pitch, RANDOM, p.x, p.y, p.z));
	}

	public static void playUi(SoundEvent sound, float volume, float pitch) {
		if (sound != null) {
			Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(sound, pitch, volume * master()));
		}
	}

	public static void playAt(SoundEvent sound, Vec3 pos, float volume, float pitch) {
		if (sound != null) {
			Minecraft.getInstance().getSoundManager().play(new SimpleSoundInstance(sound, SoundSource.PLAYERS, volume * master(), pitch, RANDOM,
				pos.x, pos.y, pos.z));
		}
	}

	public static void playWeaponCue(Identifier weapon, WeaponDefinition def, String cue, float volume) {
		if (weapon != null && def != null) {
			playLocal(weaponSound(weapon, def, cue), volume, 0.97f + RANDOM.nextFloat() * 0.06f);
		}
	}

	/** The local player's own shot. */
	public static void ownShot(Identifier weapon, WeaponDefinition def, boolean suppressed, float loudness) {
		long now = System.nanoTime();
		burstCount = now - lastOwnShot < 250_000_000L ? burstCount + 1 : 0;
		lastOwnShot = now;
		float vol = 1.0f;
		if (ClientConfig.get().reduceRepeatedSounds) {
			vol -= Math.min(0.25f, burstCount * 0.012f);
		}
		float pitch = 0.97f + RANDOM.nextFloat() * 0.06f;
		SoundEvent ev = weaponSound(weapon, def, suppressed ? "fire_suppressed" : "fire");
		playLocal(ev, vol * (suppressed ? 0.9f : 1.0f) * Math.min(1.4f, 0.75f + loudness * 0.25f), pitch);
	}

	/** Another player's shot heard from the camera position. */
	public static void remoteShot(Identifier weapon, WeaponDefinition def, Vec3 pos, boolean suppressed, float loudness) {
		Minecraft mc = Minecraft.getInstance();
		Camera cam = mc.gameRenderer.getMainCamera();
		if (mc.level == null) {
			return;
		}
		Vec3 ear = cam.position();
		double dist = ear.distanceTo(pos);
		ClientConfig cfg = ClientConfig.get();
		boolean occluded = false;
		if (cfg.soundOcclusion && dist > 4) {
			HitResult hit = mc.level.clip(new ClipContext(ear, pos, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, mc.player));
			occluded = hit.getType() != HitResult.Type.MISS && hit.getLocation().distanceToSqr(pos) > 1.0;
		}
		float pitch = 0.96f + RANDOM.nextFloat() * 0.08f;
		int delay = cfg.soundTravelDelay ? (int) Math.round(dist / SOUND_SPEED) : 0;
		if (suppressed) {
			if (dist < 40) {
				queue(sound(weaponSound(weapon, def, "fire_suppressed"), pos, (occluded ? 0.5f : 1f) * Math.max(1f, loudness * 2), pitch), delay);
			}
			return;
		}
		double nearRange = 32 * Math.max(0.6, loudness);
		float nearVol = (float) Math.max(0, 1 - Math.max(0, dist - nearRange * 0.6) / (nearRange * 0.6));
		if (occluded) {
			nearVol *= 0.35f;
		}
		if (nearVol > 0.02f) {
			queue(sound(weaponSound(weapon, def, "fire"), pos, nearVol * Math.max(1f, loudness), pitch), delay);
		}
		if (dist > nearRange * 0.5) {
			float farVol = (float) Math.min(1.0, (dist - nearRange * 0.5) / nearRange) * (occluded ? 0.7f : 1f);
			// Volume above 1 extends the attenuation range (sounds.json gives the far layer 192 blocks).
			queue(sound(weaponSound(weapon, def, "fire_far"), pos, farVol * Math.max(1f, loudness * 1.3f), pitch), delay);
		}
	}

	private static SoundInstance sound(SoundEvent ev, Vec3 pos, float volume, float pitch) {
		if (ev == null) {
			return null;
		}
		return new SimpleSoundInstance(ev, SoundSource.PLAYERS, volume * master(), pitch, RANDOM, pos.x, pos.y, pos.z);
	}

	private static void queue(SoundInstance s, int delay) {
		if (s == null) {
			return;
		}
		if (delay <= 0) {
			Minecraft.getInstance().getSoundManager().play(s);
		} else if (DELAYED.size() < 64) {
			DELAYED.add(new Delayed(s, new int[] {delay}));
		}
	}

	public static void tick() {
		Iterator<Delayed> it = DELAYED.iterator();
		while (it.hasNext()) {
			Delayed d = it.next();
			if (--d.ticks()[0] <= 0) {
				Minecraft.getInstance().getSoundManager().play(d.sound());
				it.remove();
			}
		}
	}

	public static void clear() {
		DELAYED.clear();
	}
}
