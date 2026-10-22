package com.ordnance.registry;

import com.ordnance.Ordnance;
import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.MagazineComponent;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.text.Text;

public final class ModItemGroups {
	public static final RegistryKey<ItemGroup> ARSENAL = RegistryKey.of(RegistryKeys.ITEM_GROUP, Ordnance.id("arsenal"));

	private ModItemGroups() {
	}

	public static void init() {
		Registry.register(
			Registries.ITEM_GROUP,
			ARSENAL,
			FabricItemGroup.builder()
				.icon(() -> new ItemStack(ModItems.RPG7))
				.displayName(Text.translatable("itemGroup.ordnance.arsenal"))
				.entries((context, entries) -> {
					entries.add(ModItems.FRAG_GRENADE);
					entries.add(ModItems.INCENDIARY_GRENADE);
					entries.add(ModItems.SMOKE_GRENADE);

					ItemStack loadedRpg = new ItemStack(ModItems.RPG7);
					loadedRpg.set(ModComponents.MAGAZINE, MagazineComponent.EMPTY.withLoaded(ModItems.PG7V_ROCKET.getRegistryEntry()));
					entries.add(loadedRpg);
					entries.add(ModItems.PG7V_ROCKET);
					entries.add(ModItems.TBG7V_ROCKET);

					entries.add(ModItems.GRENADE_LAUNCHER);
					entries.add(ModItems.GRENADE_40MM_HE);
					entries.add(ModItems.GRENADE_40MM_INCENDIARY);
					entries.add(ModItems.GRENADE_40MM_SMOKE);

					ItemStack fueled = new ItemStack(ModItems.FLAMETHROWER);
					fueled.set(ModComponents.FUEL, FlamethrowerItem.maxFuel());
					entries.add(fueled);
					entries.add(ModItems.FUEL_CANISTER);

					entries.add(ModItems.STRIKE_DESIGNATOR);
					entries.add(ModItems.HYPERSONIC_MISSILE);

					entries.add(ModItems.EXPLOSIVE_CHARGE);
					entries.add(ModItems.SCORCHED_EARTH);
					entries.add(ModItems.CHARRED_LOG);
					entries.add(ModItems.ASH_LAYER);
				})
				.build()
		);
	}
}
