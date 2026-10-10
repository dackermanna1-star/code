package net.earthscapes;

import net.earthscapes.dev.MapDumper;
import net.earthscapes.registry.EsBlocks;
import net.earthscapes.registry.EsDensityFunctions;
import net.earthscapes.registry.EsEntities;
import net.earthscapes.registry.EsFeatures;
import net.earthscapes.registry.EsItems;
import net.earthscapes.registry.EsPlacements;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.registry.CompostingChanceRegistry;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.fabricmc.fabric.api.registry.StrippableBlockRegistry;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LeavesBlock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Earthscapes implements ModInitializer {
	public static final String MOD_ID = "earthscapes";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		EsBlocks.init();
		EsItems.init();
		EsEntities.init();
		EsDensityFunctions.init();
		EsFeatures.init();
		EsPlacements.init();
		registerBlockBehaviour();
		MapDumper.init();
		LOGGER.info("Earthscapes: savanna, Sahara, Amazon and steppe world types and {} animals ready", EsEntities.ALL.size());
	}

	private static void registerBlockBehaviour() {
		FlammableBlockRegistry flammable = FlammableBlockRegistry.getDefaultInstance();
		CompostingChanceRegistry compost = CompostingChanceRegistry.INSTANCE;
		for (EsBlocks.WoodSet set : EsBlocks.WOOD_SETS) {
			StrippableBlockRegistry.register(set.log(), set.strippedLog());
			StrippableBlockRegistry.register(set.wood(), set.strippedWood());
			for (Block b : new Block[] {set.log(), set.wood(), set.strippedLog(), set.strippedWood()}) {
				flammable.add(b, 5, 5);
			}
			for (Block b : new Block[] {set.planks(), set.stairs(), set.slab(), set.fence(), set.fenceGate()}) {
				flammable.add(b, 5, 20);
			}
			flammable.add(set.leaves(), 30, 60);
			compost.add(set.leaves(), 0.3F);
			compost.add(set.sapling(), 0.3F);
		}
		flammable.add(EsBlocks.FEVER_TREE_LOG, 5, 5);
		flammable.add(EsBlocks.FEVER_TREE_WOOD, 5, 5);
		flammable.add(EsBlocks.CECROPIA_LOG, 5, 5);
		flammable.add(EsBlocks.ACAI_PALM_LOG, 5, 5);
		for (Block block : EsBlocks.ALL) {
			if (block instanceof LeavesBlock) {
				flammable.add(block, 30, 60);
				compost.add(block, 0.3F);
			}
		}
		for (Block block : new Block[] {EsBlocks.GOLDEN_GRASS, EsBlocks.STEPPE_GRASS, EsBlocks.DRINN_GRASS, EsBlocks.BROMELIAD, EsBlocks.LIANA}) {
			flammable.add(block, 60, 100);
			compost.add(block, 0.3F);
		}
		for (Block block : new Block[] {EsBlocks.TALL_GOLDEN_GRASS, EsBlocks.RED_OAT_GRASS, EsBlocks.FEATHER_GRASS, EsBlocks.TALL_STEPPE_GRASS,
			EsBlocks.HELICONIA, EsBlocks.GIANT_TARO}) {
			flammable.add(block, 60, 100);
			compost.add(block, 0.5F);
		}
		for (Block block : new Block[] {EsBlocks.EDELWEISS, EsBlocks.PASQUE_FLOWER, EsBlocks.UMBRELLA_THORN_SAPLING, EsBlocks.FEVER_TREE_SAPLING, EsBlocks.VICTORIA_LILY_PAD}) {
			compost.add(block, 0.65F);
		}
		compost.add(EsItems.DATE, 0.65F);
	}
}
