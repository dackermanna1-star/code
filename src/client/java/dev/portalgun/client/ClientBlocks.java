package dev.portalgun.client;

import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.registry.ModBlocks;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.minecraft.client.color.block.BlockColor;
import net.minecraft.client.renderer.BiomeColors;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.world.level.FoliageColor;
import net.minecraft.world.level.GrassColor;
import net.minecraft.world.level.block.Block;
import org.jetbrains.annotations.Nullable;

/** Render layers and biome color providers for spec-driven blocks. */
public final class ClientBlocks {
	private ClientBlocks() {
	}

	public static void init() {
		int cutout = 0;
		int translucent = 0;
		for (ContentSpec.BlockSpec spec : ContentSpec.get().blocks) {
			Block block = ModBlocks.get(spec.id);
			if (block == null) {
				continue;
			}
			ChunkSectionLayer layer = layer(spec);
			if (layer != null) {
				BlockRenderLayerMap.putBlock(block, layer);
				if (layer == ChunkSectionLayer.TRANSLUCENT) {
					translucent++;
				} else {
					cutout++;
				}
			}
			BlockColor color = tint(spec.biomeTint);
			if (color != null) {
				ColorProviderRegistry.BLOCK.register(color, block);
			}
		}
		PortalGunMod.LOGGER.debug("Spec block render layers: {} cutout, {} translucent", cutout, translucent);
	}

	/** The explicit layer, or the kind's natural layer when the spec left the default "solid". Leaves pick their own. */
	private static @Nullable ChunkSectionLayer layer(ContentSpec.BlockSpec spec) {
		String layer = spec.layer == null ? "solid" : spec.layer;
		String kind = spec.kind == null ? "solid" : spec.kind;
		if ("solid".equals(layer)) {
			layer = switch (kind) {
				case "plant", "tall_plant", "hanging_plant", "crystal_cluster", "vine", "lily", "carpet" -> "cutout";
				case "glass", "ice", "slime", "sticky" -> "translucent";
				default -> "solid";
			};
		}
		if ("leaves".equals(kind)) {
			return null; // LeavesBlock follows the "cutout leaves" video option
		}
		return switch (layer) {
			case "cutout", "cutout_mipped" -> ChunkSectionLayer.CUTOUT;
			case "translucent" -> ChunkSectionLayer.TRANSLUCENT;
			default -> null;
		};
	}

	private static @Nullable BlockColor tint(@Nullable String biomeTint) {
		if (biomeTint == null) {
			return null;
		}
		return switch (biomeTint) {
			case "grass" -> (state, level, pos, index) -> level != null && pos != null
				? BiomeColors.getAverageGrassColor(level, pos) : GrassColor.getDefaultColor();
			case "foliage" -> (state, level, pos, index) -> level != null && pos != null
				? BiomeColors.getAverageFoliageColor(level, pos) : FoliageColor.FOLIAGE_DEFAULT;
			case "dry_foliage" -> (state, level, pos, index) -> level != null && pos != null
				? BiomeColors.getAverageDryFoliageColor(level, pos) : FoliageColor.FOLIAGE_DEFAULT;
			case "water" -> (state, level, pos, index) -> level != null && pos != null
				? BiomeColors.getAverageWaterColor(level, pos) : 0xFF3F76E4;
			default -> null;
		};
	}
}
