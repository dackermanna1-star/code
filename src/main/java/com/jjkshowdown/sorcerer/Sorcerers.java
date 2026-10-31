package com.jjkshowdown.sorcerer;

import com.jjkshowdown.registry.ModAttachments;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;

/** Static accessors for the sorcerer attachments. Server-side only (clients use ClientState). */
public final class Sorcerers {
	private Sorcerers() {
	}

	public static SorcererData data(LivingEntity e) {
		return e.getAttachedOrCreate(ModAttachments.DATA);
	}

	public static SorcererState state(LivingEntity e) {
		return e.getAttachedOrCreate(ModAttachments.STATE);
	}

	public static CharacterType character(Entity e) {
		if (!(e instanceof LivingEntity)) return CharacterType.NONE;
		SorcererData d = e.getAttached(ModAttachments.DATA);
		return d == null ? CharacterType.NONE : d.character();
	}

	public static boolean isSorcerer(Entity e) {
		return character(e).isSorcerer();
	}

	/** Runtime state if present (never creates one). */
	public static SorcererState peekState(Entity e) {
		return e.getAttached(ModAttachments.STATE);
	}

	public static boolean hasInfinity(Entity e) {
		SorcererState s = peekState(e);
		return s != null && s.infinity && character(e) == CharacterType.GOJO;
	}

	public static boolean hasAmplification(Entity e) {
		SorcererState s = peekState(e);
		return s != null && s.amplification;
	}
}
