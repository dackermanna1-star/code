package net.earthscapes.client;

import net.earthscapes.registry.EsBlocks;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.world.level.block.Block;

public class EarthscapesClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		for (Block block : EsBlocks.CUTOUT) {
			BlockRenderLayerMap.putBlock(block, ChunkSectionLayer.CUTOUT);
		}
		// Leaf textures are pre-coloured; these colours only tint the falling-leaf particles.
		leafParticle(0x8A9A3E, EsBlocks.UMBRELLA_THORN_LEAVES);
		leafParticle(0x4C6B2A, EsBlocks.THORNBUSH_LEAVES);
		leafParticle(0x6E8C3A, EsBlocks.BAOBAB.leaves());
		leafParticle(0x93A848, EsBlocks.FEVER_TREE_LEAVES);
		leafParticle(0x7C9A52, EsBlocks.DATE_PALM.leaves());
		leafParticle(0x3F7A2A, EsBlocks.KAPOK.leaves());
		leafParticle(0x2F5E22, EsBlocks.RAINFOREST_LEAVES);
		leafParticle(0x9FB38A, EsBlocks.CECROPIA_LEAVES);
		leafParticle(0x4E8A2E, EsBlocks.ACAI_PALM_LEAVES);
		leafParticle(0x5F8F35, EsBlocks.BURITI_PALM_LEAVES);
		leafParticle(0x9CC25A, EsBlocks.LARCH.leaves());
	}

	private static void leafParticle(int rgb, Block block) {
		ColorProviderRegistry.BLOCK.register((state, level, pos, tintIndex) -> 0xFF000000 | rgb, block);
	}
}
