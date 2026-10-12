package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.item.Item;
import net.minecraft.item.ItemGroup;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

public final class ModItemGroups {
	public static final ItemGroup CHAOS = Registry.register(Registries.ITEM_GROUP, ChaosUnleashed.id("chaos"),
		FabricItemGroup.builder()
			.icon(() -> new ItemStack(ModBlocks.CHAOS_CONTROL_PANEL))
			.displayName(Text.translatable("itemGroup.chaosunleashed.chaos"))
			.entries((context, entries) -> {
				for (Identifier id : Registries.ITEM.getIds()) {
					if (id.getNamespace().equals(ChaosUnleashed.MOD_ID)) {
						Item item = Registries.ITEM.get(id);
						if (!ModItems.isHidden(item)) {
							entries.add(item);
						}
					}
				}
			})
			.build());

	private ModItemGroups() {
	}

	public static void init() {
	}
}
