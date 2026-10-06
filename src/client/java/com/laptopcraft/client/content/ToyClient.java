package com.laptopcraft.client.content;

import com.laptopcraft.content.ToyContent;
import java.util.HashSet;
import java.util.Set;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.minecraft.ChatFormatting;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;

/** Client-only setup for the toys: render layers, the bouncy ball renderer and joke tooltips. */
public final class ToyClient {
	private ToyClient() {
	}

	public static void init() {
		for (Block block : ToyContent.CUTOUT_BLOCKS) {
			BlockRenderLayerMap.putBlock(block, ChunkSectionLayer.CUTOUT);
		}
		EntityRenderers.register(ToyContent.BOUNCY_BALL_ENTITY, ThrownItemRenderer::new);
		registerTooltips(ToyContent.items());
	}

	/**
	 * Adds the gray flavour line {@code <description id>.tooltip} under each of the given items. Shared with
	 * {@link DecorClient}.
	 */
	static void registerTooltips(Iterable<Item> items) {
		Set<Item> set = new HashSet<>();
		items.forEach(set::add);
		ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> {
			if (set.contains(stack.getItem())) {
				String key = stack.getItem().getDescriptionId() + ".tooltip";
				lines.add(Math.min(1, lines.size()), Component.translatable(key).withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC));
			}
		});
	}
}
