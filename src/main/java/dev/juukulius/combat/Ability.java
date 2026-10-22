package dev.juukulius.combat;

import dev.juukulius.animation.JuliusAnim;
import net.minecraft.network.chat.Component;

/**
 * Every ability with a cooldown slot. Costs are in mana (0-100), cooldowns and locks in ticks (20 per second).
 * The ordinal is the cooldown slot index sent to the owning client, so new entries must be appended.
 * <p>
 * Names: El Fura, Ul Gora, Al Clarista, Al Clauzeria and Al Cranvel are Julius's named spirit arts in Re:Zero and are
 * used where the effect matches the source. The other arts are descriptive names for gameplay interpretations of what
 * each spirit's attribute does, not claimed canon spells.
 */
public enum Ability {
	HEAVY_STRIKE("heavy_strike", 10, 80, 14, true, JuliusAnim.HEAVY_STRIKE),
	AL_CLARISTA("al_clarista", 15, 50, 10, true, JuliusAnim.CHARGE_RELEASE),
	AL_CLAUZERIA("al_clauzeria", 45, 400, 26, true, JuliusAnim.AL_CLAUZERIA),
	AL_CRANVEL("al_cranvel", 40, 1800, 30, false, JuliusAnim.CRANVEL_ACTIVATE),
	IA_FLAME_BURST("ia_flame_burst", 14, 70, 9, false, JuliusAnim.CAST_FORWARD),
	UL_GORA("ul_gora", 32, 280, 18, false, JuliusAnim.UL_GORA),
	KUA_TIDE_LANCE("kua_tide_lance", 16, 100, 9, false, JuliusAnim.CAST_FORWARD),
	KUA_HEALING_WATER("kua_healing_water", 24, 300, 14, false, JuliusAnim.CAST_SELF),
	ARO_GALE_STEP("aro_gale_step", 10, 50, 8, false, JuliusAnim.GALE_STEP),
	EL_FURA("el_fura", 22, 200, 13, false, JuliusAnim.CAST_SWEEP),
	IKU_STONE_SPIRES("iku_stone_spires", 18, 120, 12, false, JuliusAnim.CAST_GROUND),
	IKU_GROUND_SHATTER("iku_ground_shatter", 24, 220, 14, false, JuliusAnim.CAST_GROUND),
	IN_RADIANT_BURST("in_radiant_burst", 20, 160, 11, false, JuliusAnim.CAST_FORWARD),
	IN_STRENGTH_ENHANCEMENT("in_strength_enhancement", 25, 400, 12, false, JuliusAnim.CAST_SELF),
	NES_UMBRAL_BOLT("nes_umbral_bolt", 14, 100, 9, false, JuliusAnim.CAST_FORWARD),
	NES_YIN_SEAL("nes_yin_seal", 26, 300, 12, false, JuliusAnim.CAST_FORWARD);

	public static final int COUNT = values().length;
	private static final Ability[] BY_INDEX = values();

	public final String id;
	public final int manaCost;
	public final int cooldownTicks;
	/** How long the action blocks other actions (not movement). */
	public final int lockTicks;
	public final boolean requiresSword;
	public final JuliusAnim animation;

	Ability(String id, int manaCost, int cooldownTicks, int lockTicks, boolean requiresSword, JuliusAnim animation) {
		this.id = id;
		this.manaCost = manaCost;
		this.cooldownTicks = cooldownTicks;
		this.lockTicks = lockTicks;
		this.requiresSword = requiresSword;
		this.animation = animation;
	}

	public static Ability byIndex(int index) {
		return index >= 0 && index < COUNT ? BY_INDEX[index] : HEAVY_STRIKE;
	}

	public static Ability byId(String id) {
		for (Ability ability : BY_INDEX) {
			if (ability.id.equals(id)) {
				return ability;
			}
		}

		return null;
	}

	public boolean isSpiritArt() {
		return this.ordinal() >= IA_FLAME_BURST.ordinal();
	}

	public Component displayName() {
		return Component.translatable("ability.julius_juukulius." + this.id);
	}
}
