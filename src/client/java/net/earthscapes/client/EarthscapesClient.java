package net.earthscapes.client;

import net.earthscapes.client.entity.BactrianCamelRenderer;
import net.earthscapes.client.entity.EsAnimalRenderer;
import net.earthscapes.client.entity.EsAnimalRenderer.Look;
import net.earthscapes.client.entity.FennecRenderer;
import net.earthscapes.client.entity.RiverDolphinRenderer;
import net.earthscapes.client.entity.ToucanRenderer;
import net.earthscapes.client.entity.WildHorseRenderer;
import net.earthscapes.client.model.EsMobLayers;
import net.earthscapes.entity.EsAnimal;
import net.earthscapes.registry.EsBlocks;
import net.earthscapes.registry.EsEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.BlockRenderLayerMap;
import net.fabricmc.fabric.api.client.rendering.v1.ColorProviderRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.world.entity.EntityType;
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
		registerAnimals();
	}

	private static void registerAnimals() {
		EsMobLayers.register();
		animal(EsEntities.ELEPHANT, Look.of(EsMobLayers.ELEPHANT, 0.45F, 1.6F, "elephant"));
		animal(EsEntities.GIRAFFE, Look.of(EsMobLayers.GIRAFFE, 0.5F, 0.9F, "giraffe").pace());
		animal(EsEntities.WILDEBEEST, Look.of(EsMobLayers.WILDEBEEST, 0.9F, 0.7F, "wildebeest"));
		animal(EsEntities.THOMSONS_GAZELLE, Look.of(EsMobLayers.GAZELLE, 1.0F, 0.4F, "thomsons_gazelle"));
		animal(EsEntities.HIPPO, Look.of(EsMobLayers.HIPPO, 0.6F, 1.3F, "hippo").jaw(1.1F));
		animal(EsEntities.LION, Look.of(EsMobLayers.LION, 0.9F, 0.7F, "lion", "lion").manelessFrom(1));
		animal(EsEntities.OSTRICH, Look.of(EsMobLayers.OSTRICH, 0.8F, 0.5F, "ostrich", "ostrich_female"));
		animal(EsEntities.NILE_CROCODILE, Look.of(EsMobLayers.NILE_CROCODILE, 0.8F, 0.9F, "nile_crocodile").jaw(0.7F));
		animal(EsEntities.ADDAX, Look.of(EsMobLayers.ADDAX, 0.9F, 0.6F, "addax"));
		animal(EsEntities.DORCAS_GAZELLE, Look.of(EsMobLayers.GAZELLE, 1.0F, 0.4F, "dorcas_gazelle"));
		animal(EsEntities.JAGUAR, Look.of(EsMobLayers.JAGUAR, 0.9F, 0.6F, "jaguar"));
		animal(EsEntities.CAPYBARA, Look.of(EsMobLayers.CAPYBARA, 0.9F, 0.5F, "capybara"));
		animal(EsEntities.TAPIR, Look.of(EsMobLayers.TAPIR, 0.8F, 0.7F, "tapir").baby("tapir_baby"));
		animal(EsEntities.BLACK_CAIMAN, Look.of(EsMobLayers.BLACK_CAIMAN, 0.8F, 0.9F, "black_caiman").jaw(0.7F));
		animal(EsEntities.YAK, Look.of(EsMobLayers.YAK, 0.7F, 1.0F, "yak"));
		animal(EsEntities.SAIGA, Look.of(EsMobLayers.SAIGA, 1.0F, 0.45F, "saiga"));
		animal(EsEntities.MONGOLIAN_GAZELLE, Look.of(EsMobLayers.GAZELLE, 1.0F, 0.4F, "mongolian_gazelle"));
		animal(EsEntities.SNOW_LEOPARD, Look.of(EsMobLayers.SNOW_LEOPARD, 0.9F, 0.55F, "snow_leopard"));
		animal(EsEntities.MARMOT, Look.of(EsMobLayers.MARMOT, 1.0F, 0.3F, "marmot").rearUp(0.19F));
		EntityRendererRegistry.register(EsEntities.ZEBRA, ctx -> new WildHorseRenderer(ctx, EsMobLayers.ZEBRA, EsMobLayers.ZEBRA_BABY, "zebra"));
		EntityRendererRegistry.register(EsEntities.PRZEWALSKI_HORSE,
			ctx -> new WildHorseRenderer(ctx, EsMobLayers.PRZEWALSKI_HORSE, EsMobLayers.PRZEWALSKI_HORSE_BABY, "przewalski_horse"));
		EntityRendererRegistry.register(EsEntities.FENNEC, FennecRenderer::new);
		EntityRendererRegistry.register(EsEntities.TOUCAN, ToucanRenderer::new);
		EntityRendererRegistry.register(EsEntities.BACTRIAN_CAMEL, BactrianCamelRenderer::new);
		EntityRendererRegistry.register(EsEntities.RIVER_DOLPHIN, RiverDolphinRenderer::new);
	}

	private static void animal(EntityType<EsAnimal> type, Look look) {
		EntityRendererRegistry.register(type, ctx -> new EsAnimalRenderer(ctx, look));
	}

	private static void leafParticle(int rgb, Block block) {
		ColorProviderRegistry.BLOCK.register((state, level, pos, tintIndex) -> 0xFF000000 | rgb, block);
	}
}
