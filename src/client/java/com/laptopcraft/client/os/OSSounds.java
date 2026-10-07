package com.laptopcraft.client.os;

import com.laptopcraft.registry.ModSounds;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.sounds.SoundEvent;

/**
 * Plays CubeOS UI sounds (non-positional) and respects the user's "sounds" setting. Apps should use
 * {@code ctx.playClick()} / {@code ctx.playSound(...)} which route here.
 */
public final class OSSounds {
	private static boolean enabled = true;

	private OSSounds() {
	}

	/** Mirrors the "sounds" setting of the running laptop. */
	public static void setEnabled(boolean on) {
		enabled = on;
	}

	/** True if UI sounds are on. */
	public static boolean enabled() {
		return enabled;
	}

	/** Plays a UI sound at full volume (if sounds are on). */
	public static void play(SoundEvent sound, float pitch) {
		play(sound, pitch, 1f);
	}

	/** Plays a UI sound (if sounds are on). */
	public static void play(SoundEvent sound, float pitch, float volume) {
		if (!enabled || sound == null) {
			return;
		}
		Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(sound, pitch, volume));
	}

	/** Plays even when the OS sounds are muted (e.g. boot chime is part of the hardware). */
	public static void playAlways(SoundEvent sound, float pitch, float volume) {
		Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(sound, pitch, volume));
	}

	/** Soft click. */
	public static void click() {
		play(ModSounds.LAPTOP_CLICK, 1f, 0.6f);
	}

	/** Notification chime. */
	public static void notification() {
		play(ModSounds.LAPTOP_NOTIFY, 1f, 0.8f);
	}

	/** Error buzz. */
	public static void error() {
		play(ModSounds.LAPTOP_ERROR, 1f, 0.8f);
	}

	/** Boot chime. */
	public static void boot() {
		play(ModSounds.LAPTOP_BOOT, 1f, 0.9f);
	}

	/** Shutdown sound. */
	public static void shutdown() {
		play(ModSounds.LAPTOP_SHUTDOWN, 1f, 0.9f);
	}
}
