package net.abyssaldescent.item;

import java.util.List;
import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.dungeon.zone.Zone;
import net.abyssaldescent.item.effect.WeaponEffect;
import org.jetbrains.annotations.Nullable;

/**
 * Static definition of a piece of dungeon gear.
 *
 * @param zone      the zone whose loot tables can roll it
 * @param exclusive only obtainable from the zone boss
 * @param kind      tooltip type label key suffix (sword, dagger, greatsword, bow, ...)
 * @param set       armour set id, or null
 */
public record GearSpec(Zone zone, Rarity rarity, boolean exclusive, String kind, List<WeaponEffect> effects, @Nullable String set) {
	public static GearSpec of(Zone zone, Rarity rarity, String kind, WeaponEffect... effects) {
		return new GearSpec(zone, rarity, false, kind, List.of(effects), null);
	}

	public static GearSpec exclusive(Zone zone, Rarity rarity, String kind, WeaponEffect... effects) {
		return new GearSpec(zone, rarity, true, kind, List.of(effects), null);
	}

	public static GearSpec armor(Zone zone, Rarity rarity, String set) {
		return new GearSpec(zone, rarity, false, "armor", List.of(), set);
	}
}
