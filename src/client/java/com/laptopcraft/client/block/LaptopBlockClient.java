package com.laptopcraft.client.block;

import com.laptopcraft.registry.ModBlocks;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;

/** Client setup for the laptop and package blocks. */
public final class LaptopBlockClient {
	private LaptopBlockClient() {
	}

	public static void init() {
		// Non-full models with transparent texels (keyboard gaps, bag handles, box flaps).
		BlockRenderLayerMap.putBlocks(ChunkSectionLayer.CUTOUT, ModBlocks.LAPTOP, ModBlocks.EMERAZON_BOX, ModBlocks.ENDER_EATS_BAG);
	}
}
