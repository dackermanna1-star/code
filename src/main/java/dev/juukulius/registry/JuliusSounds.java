package dev.juukulius.registry;

import dev.juukulius.JuliusMod;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;

/** All original sound effects (synthesized, see {@code tools/gen_sounds.py}). */
public final class JuliusSounds {
	public static final SoundEvent SWORD_SWING_1 = register("sword.swing_1");
	public static final SoundEvent SWORD_SWING_2 = register("sword.swing_2");
	public static final SoundEvent SWORD_SWING_3 = register("sword.swing_3");
	public static final SoundEvent SWORD_HEAVY_SWING = register("sword.heavy_swing");
	public static final SoundEvent SWORD_HIT = register("sword.hit");
	public static final SoundEvent SWORD_HEAVY_HIT = register("sword.heavy_hit");
	public static final SoundEvent SWORD_CHARGE = register("sword.charge");
	public static final SoundEvent SWORD_CHARGE_READY = register("sword.charge_ready");
	public static final SoundEvent SWORD_WAVE_RELEASE = register("sword.wave_release");
	public static final SoundEvent SPIRIT_SUMMON = register("spirit.summon");
	public static final SoundEvent SPIRIT_DISMISS = register("spirit.dismiss");
	public static final SoundEvent SPIRIT_SELECT = register("spirit.select");
	public static final SoundEvent TRANSFORM = register("transform");
	public static final SoundEvent REVERT = register("revert");
	public static final SoundEvent FIRE_CAST = register("art.fire_cast");
	public static final SoundEvent FIRE_EXPLODE = register("art.fire_explode");
	public static final SoundEvent WATER_CAST = register("art.water_cast");
	public static final SoundEvent WATER_HEAL = register("art.water_heal");
	public static final SoundEvent WIND_CAST = register("art.wind_cast");
	public static final SoundEvent DASH = register("art.dash");
	public static final SoundEvent EARTH_CAST = register("art.earth_cast");
	public static final SoundEvent EARTH_SHATTER = register("art.earth_shatter");
	public static final SoundEvent YANG_CAST = register("art.yang_cast");
	public static final SoundEvent YANG_BUFF = register("art.yang_buff");
	public static final SoundEvent YIN_CAST = register("art.yin_cast");
	public static final SoundEvent YIN_SEAL = register("art.yin_seal");
	public static final SoundEvent EL_FURA = register("el_fura");
	public static final SoundEvent UL_GORA = register("ul_gora");
	public static final SoundEvent CLAUZERIA_CHARGE = register("al_clauzeria_charge");
	public static final SoundEvent CLAUZERIA_BURST = register("al_clauzeria_burst");
	public static final SoundEvent BARRIER = register("barrier");
	public static final SoundEvent ULTIMATE_ACTIVATE = register("ultimate.activate");
	public static final SoundEvent ULTIMATE_END = register("ultimate.end");
	public static final SoundEvent DENIED = register("ability.denied");
	public static final SoundEvent CUSHION = register("cushion");

	private JuliusSounds() {
	}

	private static SoundEvent register(String name) {
		Identifier id = JuliusMod.id(name);
		return Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
	}

	public static void init() {
	}
}
