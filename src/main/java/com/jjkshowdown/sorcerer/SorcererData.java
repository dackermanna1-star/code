package com.jjkshowdown.sorcerer;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;

/**
 * Persistent sorcerer data, stored as a Fabric data attachment on any {@link net.minecraft.world.entity.LivingEntity}
 * (players keep it across deaths). Mastery progress is tracked per character so switching does not wipe progress.
 */
public final class SorcererData {
	public static final Codec<SorcererData> CODEC = RecordCodecBuilder.create(i -> i.group(
			CharacterType.CODEC.optionalFieldOf("character", CharacterType.NONE).forGetter(d -> d.character),
			Codec.INT.optionalFieldOf("mastery_gojo", 1).forGetter(d -> d.masteryGojo),
			Codec.FLOAT.optionalFieldOf("xp_gojo", 0f).forGetter(d -> d.xpGojo),
			Codec.INT.optionalFieldOf("mastery_sukuna", 1).forGetter(d -> d.masterySukuna),
			Codec.FLOAT.optionalFieldOf("xp_sukuna", 0f).forGetter(d -> d.xpSukuna),
			Codec.FLOAT.optionalFieldOf("energy", -1f).forGetter(d -> d.energy),
			Codec.INT.optionalFieldOf("fingers", 0).forGetter(d -> d.fingers),
			Codec.BOOL.optionalFieldOf("prompted", false).forGetter(d -> d.prompted)
	).apply(i, SorcererData::new));

	public static final int MAX_MASTERY = 10;
	public static final int MAX_FINGERS = 20;

	private CharacterType character;
	private int masteryGojo;
	private float xpGojo;
	private int masterySukuna;
	private float xpSukuna;
	/** Current cursed energy; negative means "uninitialised, fill to max on first tick". */
	public float energy;
	private int fingers;
	/** Whether the player was already offered the character selection screen. */
	public boolean prompted;

	public SorcererData() {
		this(CharacterType.NONE, 1, 0f, 1, 0f, -1f, 0, false);
	}

	private SorcererData(CharacterType character, int masteryGojo, float xpGojo, int masterySukuna, float xpSukuna,
			float energy, int fingers, boolean prompted) {
		this.character = character;
		this.masteryGojo = clampMastery(masteryGojo);
		this.xpGojo = Math.max(0, xpGojo);
		this.masterySukuna = clampMastery(masterySukuna);
		this.xpSukuna = Math.max(0, xpSukuna);
		this.energy = energy;
		this.fingers = Math.max(0, Math.min(MAX_FINGERS, fingers));
		this.prompted = prompted;
	}

	private static int clampMastery(int m) {
		return Math.max(1, Math.min(MAX_MASTERY, m));
	}

	public CharacterType character() {
		return character;
	}

	public void setCharacter(CharacterType character) {
		this.character = character == null ? CharacterType.NONE : character;
	}

	public int mastery() {
		return mastery(character);
	}

	public int mastery(CharacterType type) {
		return switch (type) {
			case GOJO -> masteryGojo;
			case SUKUNA -> masterySukuna;
			case NONE -> 1;
		};
	}

	public void setMastery(CharacterType type, int level) {
		switch (type) {
			case GOJO -> masteryGojo = clampMastery(level);
			case SUKUNA -> masterySukuna = clampMastery(level);
			default -> {
			}
		}
	}

	public float xp() {
		return xp(character);
	}

	public float xp(CharacterType type) {
		return switch (type) {
			case GOJO -> xpGojo;
			case SUKUNA -> xpSukuna;
			case NONE -> 0f;
		};
	}

	public void setXp(CharacterType type, float xp) {
		switch (type) {
			case GOJO -> xpGojo = Math.max(0, xp);
			case SUKUNA -> xpSukuna = Math.max(0, xp);
			default -> {
			}
		}
	}

	public int fingers() {
		return fingers;
	}

	public void setFingers(int fingers) {
		this.fingers = Math.max(0, Math.min(MAX_FINGERS, fingers));
	}
}
