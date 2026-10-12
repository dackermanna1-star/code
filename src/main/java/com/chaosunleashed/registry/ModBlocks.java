package com.chaosunleashed.registry;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.block.ChaosControlPanelBlock;
import com.chaosunleashed.block.PanelStatus;
import net.minecraft.block.AbstractBlock;
import net.minecraft.block.Block;
import net.minecraft.block.MapColor;
import net.minecraft.item.BlockItem;
import net.minecraft.item.Item;
import net.minecraft.registry.Registries;
import net.minecraft.registry.Registry;
import net.minecraft.registry.RegistryKey;
import net.minecraft.registry.RegistryKeys;
import net.minecraft.sound.BlockSoundGroup;
import net.minecraft.util.Rarity;

import java.util.function.Function;

public final class ModBlocks {
	public static final Block CHAOS_CONTROL_PANEL = register("chaos_control_panel", ChaosControlPanelBlock::new,
		AbstractBlock.Settings.create()
			.mapColor(MapColor.IRON_GRAY)
			.strength(3.5F, 6.0F)
			.requiresTool()
			.sounds(BlockSoundGroup.METAL)
			.luminance(state -> state.get(ChaosControlPanelBlock.STATUS) == PanelStatus.IDLE ? 6 : 11)
			.nonOpaque(),
		new Item.Settings().rarity(Rarity.RARE));

	private ModBlocks() {
	}

	private static Block register(String name, Function<AbstractBlock.Settings, Block> factory, AbstractBlock.Settings settings,
								  Item.Settings itemSettings) {
		RegistryKey<Block> key = RegistryKey.of(RegistryKeys.BLOCK, ChaosUnleashed.id(name));
		Block block = Registry.register(Registries.BLOCK, key, factory.apply(settings.registryKey(key)));
		RegistryKey<Item> itemKey = RegistryKey.of(RegistryKeys.ITEM, ChaosUnleashed.id(name));
		Registry.register(Registries.ITEM, itemKey, new BlockItem(block, itemSettings.registryKey(itemKey).useBlockPrefixedTranslationKey()));
		return block;
	}

	public static void init() {
	}
}
