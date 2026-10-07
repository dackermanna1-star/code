package com.laptopcraft.client.content;

import com.laptopcraft.content.DecorContent;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.world.level.block.Block;

/** Client-only setup for the decor blocks: render layers, the invisible seat entity and tooltips. */
public final class DecorClient {
	private DecorClient() {
	}

	public static void init() {
		for (Block block : DecorContent.TRANSLUCENT_BLOCKS) {
			BlockRenderLayerMap.putBlock(block, ChunkSectionLayer.TRANSLUCENT);
		}
		for (Block block : DecorContent.CUTOUT_BLOCKS) {
			BlockRenderLayerMap.putBlock(block, ChunkSectionLayer.CUTOUT);
		}
		EntityRenderers.register(DecorContent.SEAT, NoopRenderer::new);
		ToyClient.registerTooltips(DecorContent.items());
	}
}
