package com.laptopcraft.registry;

import com.laptopcraft.block.LaptopBlock;
import com.laptopcraft.block.LaptopData;
import com.laptopcraft.block.PackageBlock;
import com.laptopcraft.shop.Store;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;

/** Core blocks: the CubeBook laptop and the two delivery packages (which have no item form). */
public final class ModBlocks {
	/** The CubeBook laptop ({@code laptopcraft:laptop}); its block item carries the OS data when broken. */
	public static final LaptopBlock LAPTOP = Reg.block("laptop", LaptopBlock::new,
			BlockBehaviour.Properties.of()
					.mapColor(MapColor.COLOR_GRAY)
					.strength(1.5f, 6.0f)
					.sound(SoundType.LANTERN)
					.noOcclusion()
					.pushReaction(PushReaction.DESTROY)
					.lightLevel(state -> state.getValue(LaptopBlock.OPEN) ? LaptopBlock.SCREEN_LIGHT : 0),
			new Item.Properties()
					.stacksTo(1)
					.rarity(Rarity.UNCOMMON)
					.component(ModDataComponents.OS_DATA, LaptopData.EMPTY));

	/** Emerazon cardboard parcel. */
	public static final PackageBlock EMERAZON_BOX = Reg.blockNoItem("emerazon_box", p -> new PackageBlock(Store.EMERAZON, p),
			BlockBehaviour.Properties.of()
					.mapColor(MapColor.WOOD)
					.strength(0.4f)
					.sound(SoundType.CHISELED_BOOKSHELF)
					.noOcclusion()
					.noLootTable()
					.pushReaction(PushReaction.DESTROY));

	/** Ender Eats paper food bag. */
	public static final PackageBlock ENDER_EATS_BAG = Reg.blockNoItem("ender_eats_bag", p -> new PackageBlock(Store.ENDER_EATS, p),
			BlockBehaviour.Properties.of()
					.mapColor(MapColor.COLOR_PURPLE)
					.strength(0.2f)
					.sound(SoundType.LEAF_LITTER)
					.noOcclusion()
					.noLootTable()
					.pushReaction(PushReaction.DESTROY));

	private ModBlocks() {
	}

	/** The package block used by a store's deliveries. */
	public static PackageBlock packageFor(Store store) {
		return store == Store.ENDER_EATS ? ENDER_EATS_BAG : EMERAZON_BOX;
	}

	public static void init() {
		// Class loading registers the fields above.
	}
}
