package com.mineception;

import com.mineception.block.LaptopBlock;
import com.mineception.block.LaptopBlockEntity;
import com.mineception.block.LaptopDataCodecs;
import com.mineception.block.LaptopItem;
import com.mineception.dream.LaptopData;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.fabricmc.fabric.api.object.builder.v1.block.entity.FabricBlockEntityTypeBuilder;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;

/** Blocks, block entities, items and data components. */
public final class ModContent {
	public static final DataComponentType<LaptopData> LAPTOP_DATA = Registry.register(
		BuiltInRegistries.DATA_COMPONENT_TYPE,
		Mineception.id("laptop_data"),
		DataComponentType.<LaptopData>builder()
			.persistent(LaptopDataCodecs.CODEC)
			.networkSynchronized(LaptopDataCodecs.STREAM_CODEC)
			.build());

	public static final ResourceKey<net.minecraft.world.level.block.Block> LAPTOP_KEY =
		ResourceKey.create(Registries.BLOCK, Mineception.id("laptop"));
	public static final LaptopBlock LAPTOP = Registry.register(BuiltInRegistries.BLOCK, LAPTOP_KEY,
		new LaptopBlock(BlockBehaviour.Properties.of()
			.setId(LAPTOP_KEY)
			.mapColor(MapColor.COLOR_GRAY)
			.strength(1.0F, 3.0F)
			.sound(SoundType.METAL)
			.lightLevel(state -> 6)
			.noOcclusion()));

	public static final BlockEntityType<LaptopBlockEntity> LAPTOP_BLOCK_ENTITY = Registry.register(
		BuiltInRegistries.BLOCK_ENTITY_TYPE,
		Mineception.id("laptop"),
		FabricBlockEntityTypeBuilder.create(LaptopBlockEntity::new, LAPTOP).build());

	public static final ResourceKey<Item> LAPTOP_ITEM_KEY = ResourceKey.create(Registries.ITEM, Mineception.id("laptop"));
	public static final BlockItem LAPTOP_ITEM = Registry.register(BuiltInRegistries.ITEM, LAPTOP_ITEM_KEY,
		new LaptopItem(LAPTOP, new Item.Properties().setId(LAPTOP_ITEM_KEY).useBlockDescriptionPrefix().stacksTo(1)));

	private ModContent() {
	}

	public static void init() {
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.FUNCTIONAL_BLOCKS).register(entries -> entries.accept(LAPTOP_ITEM));
	}
}
