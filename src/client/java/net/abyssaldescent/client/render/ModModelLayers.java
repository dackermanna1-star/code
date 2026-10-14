package net.abyssaldescent.client.render;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.client.model.BarrowKnightModel;
import net.abyssaldescent.client.model.CryptGhoulModel;
import net.abyssaldescent.client.model.HollowWardenModel;
import net.abyssaldescent.client.model.WailingSkullModel;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.LayerDefinition;

public final class ModModelLayers {
	public static final ModelLayerLocation CRYPT_GHOUL = layer("crypt_ghoul");
	public static final ModelLayerLocation WAILING_SKULL = layer("wailing_skull");
	public static final ModelLayerLocation BARROW_KNIGHT = layer("barrow_knight");
	public static final ModelLayerLocation HOLLOW_WARDEN = layer("hollow_warden");
	public static final ModelLayerLocation DELVER_MERCHANT = layer("delver_merchant");

	private ModModelLayers() {
	}

	private static ModelLayerLocation layer(String name) {
		return new ModelLayerLocation(AbyssalDescent.id(name), "main");
	}

	public static void init() {
		EntityModelLayerRegistry.registerModelLayer(CRYPT_GHOUL, CryptGhoulModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(WAILING_SKULL, WailingSkullModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(BARROW_KNIGHT, BarrowKnightModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(HOLLOW_WARDEN, HollowWardenModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(DELVER_MERCHANT,
			() -> LayerDefinition.create(HumanoidModel.createMesh(CubeDeformation.NONE, 0.0F), 64, 64));
	}
}
