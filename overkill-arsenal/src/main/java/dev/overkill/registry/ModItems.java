package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import dev.overkill.item.GravemakerItem;
import dev.overkill.item.RiftfangScytheItem;
import dev.overkill.item.StormcallerGauntletItem;
import dev.overkill.item.SunlineRifleItem;
import dev.overkill.item.WorldbreakerCannonItem;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;

import java.util.function.Function;

public final class ModItems {
	public static final Item SUNLINE_RIFLE = register("sunline_rifle", SunlineRifleItem::new, weapon());

	public static final Item WORLDBREAKER_CANNON = register("worldbreaker_cannon", WorldbreakerCannonItem::new, weapon());

	public static final Item RIFTFANG_SCYTHE = register("riftfang_scythe", RiftfangScytheItem::new, weapon()
		.attributes(RiftfangScytheItem.createAttributes())
		.enchantable(15));

	public static final Item STORMCALLER_GAUNTLET = register("stormcaller_gauntlet", StormcallerGauntletItem::new, weapon()
		.attributes(StormcallerGauntletItem.createAttributes())
		.component(ModComponents.STORM_CHARGE, 0)
		.enchantable(15));

	public static final Item GRAVEMAKER = register("gravemaker", GravemakerItem::new, weapon());

	/** Projectile visuals for the Gravemaker (not obtainable, the launcher needs no ammo). */
	public static final Item SINGULARITY_ROUND = register("singularity_round", Item::new, new Item.Properties().rarity(Rarity.RARE));
	public static final Item WHITE_HOLE_ROUND = register("white_hole_round", Item::new, new Item.Properties().rarity(Rarity.RARE));

	private ModItems() {
	}

	private static Item.Properties weapon() {
		return new Item.Properties().stacksTo(1).rarity(Rarity.EPIC).fireResistant();
	}

	private static Item register(String name, Function<Item.Properties, Item> factory, Item.Properties properties) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, OverkillArsenal.id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(properties.setId(key)));
	}

	public static void init() {
	}
}
