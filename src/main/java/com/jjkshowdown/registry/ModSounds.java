package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Every sound event of the mod. The event id {@code jjkshowdown:gojo.blue_cast} maps to the file
 * {@code assets/jjkshowdown/sounds/gojo/blue_cast.ogg} (see sounds.json).
 */
public final class ModSounds {
	public static final Map<String, SoundEvent> ALL = new LinkedHashMap<>();

	// Gojo
	public static final SoundEvent INFINITY_ON = reg("gojo.infinity_on");
	public static final SoundEvent INFINITY_OFF = reg("gojo.infinity_off");
	public static final SoundEvent INFINITY_BLOCK = reg("gojo.infinity_block");
	public static final SoundEvent BLUE_CAST = reg("gojo.blue_cast");
	public static final SoundEvent BLUE_LOOP = reg("gojo.blue_loop");
	public static final SoundEvent RED_CHARGE = reg("gojo.red_charge");
	public static final SoundEvent RED_FIRE = reg("gojo.red_fire");
	public static final SoundEvent RED_IMPACT = reg("gojo.red_impact");
	public static final SoundEvent PURPLE_CHARGE = reg("gojo.purple_charge");
	public static final SoundEvent PURPLE_FIRE = reg("gojo.purple_fire");
	public static final SoundEvent BLINK = reg("gojo.blink");
	public static final SoundEvent VOID_ACTIVATE = reg("gojo.void_activate");
	public static final SoundEvent VOID_AMBIENT = reg("gojo.void_ambient");
	// Sukuna
	public static final SoundEvent DISMANTLE = reg("sukuna.dismantle");
	public static final SoundEvent DISMANTLE_BARRAGE = reg("sukuna.dismantle_barrage");
	public static final SoundEvent CLEAVE = reg("sukuna.cleave");
	public static final SoundEvent FUGA_CHARGE = reg("sukuna.fuga_charge");
	public static final SoundEvent FUGA_FIRE = reg("sukuna.fuga_fire");
	public static final SoundEvent FUGA_EXPLODE = reg("sukuna.fuga_explode");
	public static final SoundEvent WORLD_SLASH_CHARGE = reg("sukuna.world_slash_charge");
	public static final SoundEvent WORLD_SLASH = reg("sukuna.world_slash");
	public static final SoundEvent SHRINE_ACTIVATE = reg("sukuna.shrine_activate");
	public static final SoundEvent SHRINE_AMBIENT = reg("sukuna.shrine_ambient");
	public static final SoundEvent SHRINE_SLASH = reg("sukuna.shrine_slash");
	public static final SoundEvent AMPLIFICATION_ON = reg("sukuna.amplification_on");
	// Combat
	public static final SoundEvent PUNCH_LIGHT = reg("combat.punch_light");
	public static final SoundEvent PUNCH_HEAVY = reg("combat.punch_heavy");
	public static final SoundEvent COMBO_FINISHER = reg("combat.combo_finisher");
	public static final SoundEvent BLACK_FLASH = reg("combat.black_flash");
	public static final SoundEvent DODGE = reg("combat.dodge");
	public static final SoundEvent BLOCK = reg("combat.block");
	public static final SoundEvent PARRY = reg("combat.parry");
	public static final SoundEvent COUNTER = reg("combat.counter");
	public static final SoundEvent DOUBLE_JUMP = reg("combat.double_jump");
	public static final SoundEvent SLAM = reg("combat.slam");
	public static final SoundEvent FINISHER = reg("combat.finisher");
	public static final SoundEvent RCT = reg("combat.rct");
	// Domain
	public static final SoundEvent CLASH = reg("domain.clash");
	public static final SoundEvent SHATTER = reg("domain.shatter");
	public static final SoundEvent BARRIER_FORM = reg("domain.barrier_form");
	public static final SoundEvent CLASH_WIN = reg("domain.clash_win");
	// UI
	public static final SoundEvent QTE_PROMPT = reg("ui.qte_prompt");
	public static final SoundEvent QTE_SUCCESS = reg("ui.qte_success");
	public static final SoundEvent QTE_FAIL = reg("ui.qte_fail");
	public static final SoundEvent UI_SELECT = reg("ui.select");
	public static final SoundEvent LEVEL_UP = reg("ui.level_up");
	public static final SoundEvent CINEMATIC_HIT = reg("ui.cinematic_hit");
	// Music
	public static final Holder.Reference<SoundEvent> MUSIC_BATTLE_GOJO = regHolder("music.battle_gojo");
	public static final Holder.Reference<SoundEvent> MUSIC_BATTLE_SUKUNA = regHolder("music.battle_sukuna");
	public static final Holder.Reference<SoundEvent> MUSIC_UNLIMITED_VOID = regHolder("music.unlimited_void");
	public static final Holder.Reference<SoundEvent> MUSIC_MALEVOLENT_SHRINE = regHolder("music.malevolent_shrine");

	private ModSounds() {
	}

	private static SoundEvent reg(String path) {
		Identifier id = JjkShowdown.id(path);
		SoundEvent ev = Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
		ALL.put(path, ev);
		return ev;
	}

	private static Holder.Reference<SoundEvent> regHolder(String path) {
		Identifier id = JjkShowdown.id(path);
		Holder.Reference<SoundEvent> h = Registry.registerForHolder(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
		ALL.put(path, h.value());
		return h;
	}

	public static void init() {
		VoiceLine.init();
	}
}
