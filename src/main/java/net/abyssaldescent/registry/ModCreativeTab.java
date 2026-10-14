package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.core.component.DataComponents;

public final class ModCreativeTab {
	public static final CreativeModeTab TAB = Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, AbyssalDescent.id("main"),
		FabricItemGroup.builder()
			.title(Component.translatable("itemGroup.abyssal_descent"))
			.icon(() -> new ItemStack(ModItems.GRAVEBRAND))
			.displayItems((params, output) -> {
				for (var item : ModItems.ALL) {
					output.accept(item);
				}
				for (var potion : java.util.List.of(ModPotions.MENDING, ModPotions.STRONG_MENDING, ModPotions.WARDING, ModPotions.BLOODRAGE,
					ModPotions.SOULWARD)) {
					ItemStack stack = new ItemStack(Items.POTION);
					stack.set(DataComponents.POTION_CONTENTS, new PotionContents(potion));
					output.accept(stack);
				}
			})
			.build());

	private ModCreativeTab() {
	}

	public static void init() {
	}
}
