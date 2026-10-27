package dev.visceral.combat;

import dev.visceral.registry.VisceralTags;
import dev.visceral.state.WoundType;
import net.minecraft.core.component.DataComponents;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/** Broad weapon families; each has its own move set and animation style. */
public enum WeaponClass {
	FIST(8f, WoundType.BLUNT),
	SWORD(12.5f, WoundType.CUT),
	AXE(22f, WoundType.CUT),
	MACE(25f, WoundType.BLUNT),
	SPEAR(15f, WoundType.STAB),
	/** Pickaxes, shovels, hoes and other tools used as improvised weapons. */
	TOOL(16f, WoundType.BLUNT);

	/** Ticks per attack this family's move set is authored for (at scale 1). */
	public final float nominalTicks;
	public final WoundType woundType;

	WeaponClass(float nominalTicks, WoundType woundType) {
		this.nominalTicks = nominalTicks;
		this.woundType = woundType;
	}

	private static final WeaponClass[] VALUES = values();

	public static WeaponClass byId(int id) {
		return id >= 0 && id < VALUES.length ? VALUES[id] : FIST;
	}

	public static WeaponClass of(ItemStack stack) {
		if (stack.isEmpty()) return FIST;
		if (stack.is(ItemTags.SWORDS)) return SWORD;
		if (stack.is(ItemTags.AXES) || stack.is(VisceralTags.HEAVY_WEAPONS)) return AXE;
		if (stack.is(Items.MACE) || stack.is(VisceralTags.BLUNT_WEAPONS)) return MACE;
		if (stack.is(Items.TRIDENT) || stack.is(ItemTags.SPEARS) || stack.is(VisceralTags.POLEARMS)) return SPEAR;
		if (stack.is(ItemTags.PICKAXES) || stack.is(ItemTags.SHOVELS) || stack.is(ItemTags.HOES) || stack.has(DataComponents.TOOL)) return TOOL;
		return FIST;
	}

	public boolean twoHanded() {
		return this == AXE || this == SPEAR;
	}
}
