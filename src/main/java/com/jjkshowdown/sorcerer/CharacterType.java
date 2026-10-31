package com.jjkshowdown.sorcerer;

import com.mojang.serialization.Codec;
import net.minecraft.network.chat.Component;
import net.minecraft.util.StringRepresentable;

/**
 * The playable / AI-controlled characters. {@link #NONE} means "not a sorcerer" (vanilla behaviour).
 */
public enum CharacterType implements StringRepresentable {
	NONE("none", 0xFFFFFF, 0xFFFFFF),
	GOJO("gojo", 0x5FD3FF, 0xB8F0FF),
	SUKUNA("sukuna", 0xE0243A, 0xFF8A8A);

	public static final Codec<CharacterType> CODEC = StringRepresentable.fromEnum(CharacterType::values);

	private final String id;
	/** Primary cursed-energy colour (RGB). */
	public final int energyColor;
	/** Lighter accent colour (RGB). */
	public final int accentColor;

	CharacterType(String id, int energyColor, int accentColor) {
		this.id = id;
		this.energyColor = energyColor;
		this.accentColor = accentColor;
	}

	@Override
	public String getSerializedName() {
		return id;
	}

	public String id() {
		return id;
	}

	public boolean isSorcerer() {
		return this != NONE;
	}

	public CharacterType rival() {
		return switch (this) {
			case GOJO -> SUKUNA;
			case SUKUNA -> GOJO;
			case NONE -> NONE;
		};
	}

	public Component displayName() {
		return Component.translatable("character.jjkshowdown." + id);
	}

	public Component title() {
		return Component.translatable("character.jjkshowdown." + id + ".title");
	}

	public static CharacterType byId(String id) {
		for (CharacterType t : values()) {
			if (t.id.equalsIgnoreCase(id)) return t;
		}
		return NONE;
	}

	public static CharacterType byOrdinal(int ordinal) {
		CharacterType[] v = values();
		return ordinal >= 0 && ordinal < v.length ? v[ordinal] : NONE;
	}
}
