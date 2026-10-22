package dev.juukulius.spirit;

import dev.juukulius.combat.Ability;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Julius's six contracted spirits. Colours and attributes follow the Re:Zero wiki:
 * Ia (red/fire), Kua (blue/water), Aro (green/wind), Iku (yellow/earth), In (white-orange/yang), Nes (purple-black/yin).
 * The order here is also the order used by the HUD, the spirit wheel and the network index.
 */
public enum Spirit {
	IA("ia", Element.FIRE, 0xFF5A36, 0xFFC15A, Ability.IA_FLAME_BURST, Ability.UL_GORA),
	KUA("kua", Element.WATER, 0x3B8CFF, 0xB4E6FF, Ability.KUA_TIDE_LANCE, Ability.KUA_HEALING_WATER),
	ARO("aro", Element.WIND, 0x3FE07F, 0xD6FFE4, Ability.ARO_GALE_STEP, Ability.EL_FURA),
	IKU("iku", Element.EARTH, 0xF2C230, 0xFFEBAA, Ability.IKU_STONE_SPIRES, Ability.IKU_GROUND_SHATTER),
	IN("in", Element.YANG, 0xFFF3D8, 0xFFAA45, Ability.IN_RADIANT_BURST, Ability.IN_STRENGTH_ENHANCEMENT),
	NES("nes", Element.YIN, 0x9A52FF, 0x2C0F4E, Ability.NES_UMBRAL_BOLT, Ability.NES_YIN_SEAL);

	public static final int COUNT = values().length;
	private static final Spirit[] BY_INDEX = values();

	public final String id;
	public final Element element;
	/** Main glow colour (RGB). */
	public final int color;
	/** Secondary colour used for cores, trails and HUD accents (RGB). */
	public final int accent;
	public final Ability primaryArt;
	public final Ability combinationArt;

	Spirit(String id, Element element, int color, int accent, Ability primaryArt, Ability combinationArt) {
		this.id = id;
		this.element = element;
		this.color = color;
		this.accent = accent;
		this.primaryArt = primaryArt;
		this.combinationArt = combinationArt;
	}

	public static Spirit byIndex(int index) {
		return BY_INDEX[Mth.positiveModulo(index, COUNT)];
	}

	public Spirit next(int delta) {
		return byIndex(this.ordinal() + delta);
	}

	public Ability art(boolean combination) {
		return combination ? this.combinationArt : this.primaryArt;
	}

	public Component displayName() {
		return Component.translatable("spirit.julius_juukulius." + this.id);
	}

	public float red() {
		return ((this.color >> 16) & 0xFF) / 255.0F;
	}

	public float green() {
		return ((this.color >> 8) & 0xFF) / 255.0F;
	}

	public float blue() {
		return (this.color & 0xFF) / 255.0F;
	}

	public enum Element {
		FIRE,
		WATER,
		WIND,
		EARTH,
		YANG,
		YIN
	}
}
