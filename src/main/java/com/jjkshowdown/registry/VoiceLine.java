package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.sorcerer.CharacterType;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

/**
 * Voice lines. Each maps to {@code sounds/voice/<character>/<id>.ogg} and a subtitle in the language file
 * ({@code voice.jjkshowdown.<character>.<id>}).
 */
public enum VoiceLine {
	GOJO_DOMAIN(CharacterType.GOJO, "domain", 3),
	GOJO_HONORED_ONE(CharacterType.GOJO, "honored_one", 3),
	GOJO_BLUE(CharacterType.GOJO, "blue", 1),
	GOJO_RED(CharacterType.GOJO, "red", 1),
	GOJO_PURPLE(CharacterType.GOJO, "purple", 2),
	GOJO_PURPLE_INCANTATION(CharacterType.GOJO, "purple_incantation", 3),
	GOJO_NAH_ID_WIN(CharacterType.GOJO, "nah_id_win", 2),
	GOJO_STRONGEST(CharacterType.GOJO, "strongest", 2),
	GOJO_INTRO(CharacterType.GOJO, "intro", 3),
	GOJO_TAUNT(CharacterType.GOJO, "taunt", 1),
	GOJO_VICTORY(CharacterType.GOJO, "victory", 3),
	GOJO_DEFEAT(CharacterType.GOJO, "defeat", 3),
	GOJO_SELECT(CharacterType.GOJO, "select", 2),
	GOJO_INFINITY(CharacterType.GOJO, "infinity", 1),
	GOJO_CLASH(CharacterType.GOJO, "clash", 3),

	SUKUNA_DOMAIN(CharacterType.SUKUNA, "domain", 3),
	SUKUNA_DISMANTLE(CharacterType.SUKUNA, "dismantle", 1),
	SUKUNA_CLEAVE(CharacterType.SUKUNA, "cleave", 1),
	SUKUNA_FUGA(CharacterType.SUKUNA, "fuga", 2),
	SUKUNA_INCANTATION(CharacterType.SUKUNA, "incantation", 3),
	SUKUNA_WORLD_SLASH(CharacterType.SUKUNA, "world_slash", 3),
	SUKUNA_KNOW_YOUR_PLACE(CharacterType.SUKUNA, "know_your_place", 2),
	SUKUNA_STAND_PROUD(CharacterType.SUKUNA, "stand_proud", 3),
	SUKUNA_INTRO(CharacterType.SUKUNA, "intro", 3),
	SUKUNA_TAUNT(CharacterType.SUKUNA, "taunt", 1),
	SUKUNA_VICTORY(CharacterType.SUKUNA, "victory", 3),
	SUKUNA_DEFEAT(CharacterType.SUKUNA, "defeat", 3),
	SUKUNA_SELECT(CharacterType.SUKUNA, "select", 2),
	SUKUNA_CLASH(CharacterType.SUKUNA, "clash", 3);

	public final CharacterType character;
	public final String id;
	/** Higher priority lines interrupt lower ones and ignore the per-speaker cooldown. */
	public final int priority;
	private SoundEvent sound;

	VoiceLine(CharacterType character, String id, int priority) {
		this.character = character;
		this.id = id;
		this.priority = priority;
	}

	public SoundEvent sound() {
		return sound;
	}

	public Component subtitle() {
		return Component.translatable("voice.jjkshowdown." + character.id() + "." + id);
	}

	public static VoiceLine byOrdinal(int i) {
		VoiceLine[] v = values();
		return i >= 0 && i < v.length ? v[i] : null;
	}

	static void init() {
		for (VoiceLine line : values()) {
			Identifier id = JjkShowdown.id("voice." + line.character.id() + "." + line.id);
			line.sound = Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
		}
	}
}
