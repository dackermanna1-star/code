package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.item.BlindfoldItem;
import com.jjkshowdown.item.SukunaFingerItem;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.equipment.EquipmentAsset;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.item.equipment.Equippable;
import net.minecraft.core.component.DataComponents;

import java.util.function.Function;

public final class ModItems {
	public static final ResourceKey<EquipmentAsset> BLINDFOLD_ASSET = ResourceKey.create(EquipmentAssets.ROOT_ID, JjkShowdown.id("gojo_blindfold"));

	public static final Item SUKUNA_FINGER = reg("sukuna_finger", SukunaFingerItem::new, new Item.Properties()
			.stacksTo(20).rarity(Rarity.EPIC).fireResistant());
	public static final Item GOJO_BLINDFOLD = reg("gojo_blindfold", BlindfoldItem::new, new Item.Properties()
			.stacksTo(1).rarity(Rarity.EPIC)
			.component(DataComponents.EQUIPPABLE, Equippable.builder(EquipmentSlot.HEAD).setAsset(BLINDFOLD_ASSET)
					.setEquipSound(SoundEvents.ARMOR_EQUIP_LEATHER).build()));
	public static final Item GOJO_SPAWN_EGG = reg("gojo_spawn_egg", SpawnEggItem::new, new Item.Properties().spawnEgg(ModEntities.GOJO));
	public static final Item SUKUNA_SPAWN_EGG = reg("sukuna_spawn_egg", SpawnEggItem::new, new Item.Properties().spawnEgg(ModEntities.SUKUNA));

	public static final ResourceKey<CreativeModeTab> TAB_KEY = ResourceKey.create(Registries.CREATIVE_MODE_TAB, JjkShowdown.id("main"));

	private ModItems() {
	}

	private static Item reg(String name, Function<Item.Properties, Item> factory, Item.Properties props) {
		ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, JjkShowdown.id(name));
		return Registry.register(BuiltInRegistries.ITEM, key, factory.apply(props.setId(key)));
	}

	public static void init() {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, TAB_KEY, FabricItemGroup.builder()
				.title(Component.translatable("itemGroup.jjkshowdown"))
				.icon(() -> new ItemStack(SUKUNA_FINGER))
				.displayItems((params, out) -> {
					out.accept(SUKUNA_FINGER);
					out.accept(GOJO_BLINDFOLD);
					out.accept(GOJO_SPAWN_EGG);
					out.accept(SUKUNA_SPAWN_EGG);
				})
				.build());
	}
}
