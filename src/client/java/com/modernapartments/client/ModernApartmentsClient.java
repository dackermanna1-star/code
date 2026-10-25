package com.modernapartments.client;

import com.modernapartments.network.ElevatorFloorsPayload;
import com.modernapartments.registry.ModBlocks;
import com.modernapartments.registry.ModEntities;
import java.util.Map;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.world.level.block.Block;

public class ModernApartmentsClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		for (Map.Entry<Block, ModBlocks.Render> e : ModBlocks.RENDER.entrySet()) {
			switch (e.getValue()) {
				case CUTOUT -> BlockRenderLayerMap.putBlock(e.getKey(), ChunkSectionLayer.CUTOUT);
				case TRANSLUCENT -> BlockRenderLayerMap.putBlock(e.getKey(), ChunkSectionLayer.TRANSLUCENT);
				default -> {
				}
			}
		}
		EntityRendererRegistry.register(ModEntities.SEAT, NoopRenderer::new);
		ClientPlayNetworking.registerGlobalReceiver(ElevatorFloorsPayload.TYPE,
			(payload, context) -> context.client().setScreen(new ElevatorScreen(payload)));
		BlueprintPreview.init();
	}
}
