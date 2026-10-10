package dev.overkill.registry;

import dev.overkill.OverkillArsenal;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;

public final class ModItemGroup {
	public static final ResourceKey<CreativeModeTab> KEY = ResourceKey.create(Registries.CREATIVE_MODE_TAB, OverkillArsenal.id("arsenal"));

	private ModItemGroup() {
	}

	public static void init() {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, KEY, FabricItemGroup.builder()
			.icon(() -> new ItemStack(ModItems.WORLDBREAKER_CANNON))
			.title(Component.translatable("itemGroup.overkill.arsenal"))
			.displayItems((parameters, output) -> {
				output.accept(ModItems.SUNLINE_RIFLE);
				output.accept(ModItems.WORLDBREAKER_CANNON);
				output.accept(ModItems.RIFTFANG_SCYTHE);
				output.accept(ModItems.STORMCALLER_GAUNTLET);
				output.accept(ModItems.GRAVEMAKER);
				output.accept(ModBlocks.SCORCHED_STONE);
				output.accept(ModBlocks.MOLTEN_ROCK);
				output.accept(ModBlocks.SMOLDERING_ASH);
				output.accept(ModBlocks.ASH_LAYER);
			})
			.build());
	}
}
