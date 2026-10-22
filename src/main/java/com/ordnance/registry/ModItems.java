package com.ordnance.registry;

import com.ordnance.Ordnance;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.weapon.AmmoCategory;
import com.ordnance.weapon.AmmoItem;
import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.GrenadeItem;
import com.ordnance.weapon.GrenadeLauncherItem;
import com.ordnance.weapon.RocketLauncherItem;
import com.ordnance.weapon.StrikeDesignatorItem;
import java.util.function.Function;
import net.minecraft.block.Block;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.util.Rarity;

public final class ModItems {
	public static final Item EXPLOSIVE_CHARGE = register("explosive_charge", Item::new, new Item.Settings().maxCount(64));

	public static final Item FRAG_GRENADE = register(
		"frag_grenade", s -> new GrenadeItem(s, ExplosionProfile.FRAG_GRENADE), new Item.Settings().maxCount(16)
	);
	public static final Item INCENDIARY_GRENADE = register(
		"incendiary_grenade", s -> new GrenadeItem(s, ExplosionProfile.INCENDIARY_GRENADE), new Item.Settings().maxCount(16)
	);
	public static final Item SMOKE_GRENADE = register(
		"smoke_grenade", s -> new GrenadeItem(s, ExplosionProfile.SMOKE_GRENADE), new Item.Settings().maxCount(16)
	);

	public static final Item RPG7 = register("rpg7", RocketLauncherItem::new, new Item.Settings().rarity(Rarity.UNCOMMON));
	public static final Item PG7V_ROCKET = register(
		"pg7v_rocket", s -> new AmmoItem(s, AmmoCategory.RPG_ROCKET, ExplosionProfile.RPG_HEAT), new Item.Settings().maxCount(8)
	);
	public static final Item TBG7V_ROCKET = register(
		"tbg7v_rocket", s -> new AmmoItem(s, AmmoCategory.RPG_ROCKET, ExplosionProfile.RPG_THERMOBARIC), new Item.Settings().maxCount(8).rarity(Rarity.UNCOMMON)
	);

	public static final Item GRENADE_LAUNCHER = register("grenade_launcher", GrenadeLauncherItem::new, new Item.Settings().rarity(Rarity.UNCOMMON));
	public static final Item GRENADE_40MM_HE = register(
		"grenade_40mm_he", s -> new AmmoItem(s, AmmoCategory.GRENADE_40MM, ExplosionProfile.HE_40MM), new Item.Settings().maxCount(32)
	);
	public static final Item GRENADE_40MM_INCENDIARY = register(
		"grenade_40mm_incendiary", s -> new AmmoItem(s, AmmoCategory.GRENADE_40MM, ExplosionProfile.INCENDIARY_40MM), new Item.Settings().maxCount(32)
	);
	public static final Item GRENADE_40MM_SMOKE = register(
		"grenade_40mm_smoke", s -> new AmmoItem(s, AmmoCategory.GRENADE_40MM, ExplosionProfile.SMOKE_40MM), new Item.Settings().maxCount(32)
	);

	public static final Item FLAMETHROWER = register("flamethrower", FlamethrowerItem::new, new Item.Settings().rarity(Rarity.UNCOMMON));
	public static final Item FUEL_CANISTER = register("fuel_canister", Item::new, new Item.Settings().maxCount(16));

	public static final Item STRIKE_DESIGNATOR = register("strike_designator", StrikeDesignatorItem::new, new Item.Settings().rarity(Rarity.RARE));
	public static final Item HYPERSONIC_MISSILE = register(
		"hypersonic_missile", s -> new AmmoItem(s, AmmoCategory.MISSILE, ExplosionProfile.HYPERSONIC_MISSILE), new Item.Settings().maxCount(1).rarity(Rarity.EPIC)
	);

	public static final Item SCORCHED_EARTH = registerBlock(ModBlocks.SCORCHED_EARTH);
	public static final Item CHARRED_LOG = registerBlock(ModBlocks.CHARRED_LOG);
	public static final Item ASH_LAYER = registerBlock(ModBlocks.ASH_LAYER);

	private ModItems() {
	}

	private static Item register(String name, Function<Item.Settings, Item> factory, Item.Settings settings) {
		RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, Ordnance.id(name));
		return Registry.register(Registries.ITEM, key, factory.apply(settings.registryKey(key)));
	}

	private static Item registerBlock(Block block) {
		RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, Registries.BLOCK.getId(block));
		return Registry.register(Registries.ITEM, key, new BlockItem(block, new Item.Settings().registryKey(key).useBlockPrefixedTranslationKey()));
	}

	public static void init() {
	}
}
