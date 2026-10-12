package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import java.util.Map;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

public final class ModCreativeTab {
	public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, ExtremeSports.id("extreme_sports"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.extremesports"))
			.icon(() -> new ItemStack(ModItems.SKATEBOARD))
			.displayItems((parameters, output) -> {
				for (EquipmentKind kind : EquipmentKind.values()) {
					output.accept(new ItemStack(ModItems.forKind(kind)));
				}
				// A few pre-built showcase setups
				output.accept(styled(ModItems.SKATEBOARD, new EquipmentConfig(
					Map.of("graphic", "flames", "wheels", "small", "trucks", "light", "bearings", "swiss", "sticker", "skull", "effect", "flames"),
					Map.of("deck", 0x1C1C1F, "wheels", 0xD6362F, "trucks", 0xF5C518))));
				output.accept(styled(ModItems.SKATEBOARD, new EquipmentConfig(
					Map.of("graphic", "galaxy", "effect", "ender", "sticker", "star"),
					Map.of("deck", 0x7A3FC4, "wheels", 0x1FB5B0, "grip", 0x283A9E))));
				output.accept(styled(ModItems.LONGBOARD, new EquipmentConfig(
					Map.of("graphic", "sunset", "wheels", "soft", "bearings", "ceramic", "effect", "dust"),
					Map.of("deck", 0xD8B07A, "wheels", 0xF07A1E))));
				output.accept(styled(ModItems.BMX_BIKE, new EquipmentConfig(
					Map.of("frame", "park", "bars", "low", "pegs", "steel", "effect", "sparks"),
					Map.of("frame", 0xF5C518, "rims", 0x1C1C1F, "seat", 0xD6362F))));
				output.accept(styled(ModItems.KICK_SCOOTER, new EquipmentConfig(
					Map.of("deck", "light", "wheels", "w100", "effect", "rainbow"),
					Map.of("deck", 0x1FB5B0, "grips", 0xF5C518, "wheels", 0x1C1C1F))));
				output.accept(styled(ModItems.INLINE_SKATES, new EquipmentConfig(
					Map.of("frame", "aggressive", "wheels", "anti_rocker", "effect", "notes"),
					Map.of("boot", 0xD14FA3, "frame", 0x1C1C1F, "wheels", 0xF2F2F2))));
				output.accept(new ItemStack(ModItems.PARK_BUILDER));
				for (Item item : ModItems.BLOCK_ITEMS) {
					output.accept(new ItemStack(item));
				}
			})
			.build());

	private static ItemStack styled(Item item, EquipmentConfig config) {
		ItemStack stack = new ItemStack(item);
		stack.set(ModDataComponents.EQUIPMENT_CONFIG, config);
		return stack;
	}

	private ModCreativeTab() {
	}

	public static void init() {
	}
}
