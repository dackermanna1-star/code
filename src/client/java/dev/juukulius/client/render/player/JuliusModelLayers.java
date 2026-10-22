package dev.juukulius.client.render.player;

import dev.juukulius.JuliusMod;
import dev.juukulius.client.render.entity.StoneSpikeModel;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.player.PlayerModel;

/** Model layers baked at resource load. */
public final class JuliusModelLayers {
	public static final ModelLayerLocation OUTFIT = layer("outfit");
	public static final ModelLayerLocation OUTFIT_SLIM = layer("outfit_slim");
	public static final ModelLayerLocation AURA = layer("aura");
	public static final ModelLayerLocation AURA_SLIM = layer("aura_slim");
	public static final ModelLayerLocation STONE_SPIKE = layer("stone_spike");

	private JuliusModelLayers() {
	}

	private static ModelLayerLocation layer(String name) {
		return new ModelLayerLocation(JuliusMod.id(name), "main");
	}

	public static void init() {
		EntityModelLayerRegistry.registerModelLayer(OUTFIT, () -> JuliusOutfitModel.createLayer(false));
		EntityModelLayerRegistry.registerModelLayer(OUTFIT_SLIM, () -> JuliusOutfitModel.createLayer(true));
		EntityModelLayerRegistry.registerModelLayer(AURA, () -> LayerDefinition.create(PlayerModel.createMesh(new CubeDeformation(0.6F), false), 64, 64));
		EntityModelLayerRegistry.registerModelLayer(AURA_SLIM, () -> LayerDefinition.create(PlayerModel.createMesh(new CubeDeformation(0.6F), true), 64, 64));
		EntityModelLayerRegistry.registerModelLayer(STONE_SPIKE, StoneSpikeModel::createLayer);
	}
}
