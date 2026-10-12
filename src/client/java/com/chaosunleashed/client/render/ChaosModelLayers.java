package com.chaosunleashed.client.render;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.model.AlienSoldierModel;
import com.chaosunleashed.client.model.BisonModel;
import com.chaosunleashed.client.model.KaijuModel;
import com.chaosunleashed.client.model.UfoModel;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.render.entity.model.EntityModelLayer;

/** Model layers for the mod's custom entity models. */
public final class ChaosModelLayers {
	public static final EntityModelLayer BISON = layer("bison");
	public static final EntityModelLayer UFO = layer("ufo");
	public static final EntityModelLayer ALIEN_SOLDIER = layer("alien_soldier");
	public static final EntityModelLayer KAIJU = layer("kaiju");

	private ChaosModelLayers() {
	}

	private static EntityModelLayer layer(String name) {
		return new EntityModelLayer(ChaosUnleashed.id(name), "main");
	}

	public static void register() {
		EntityModelLayerRegistry.registerModelLayer(BISON, BisonModel::getTexturedModelData);
		EntityModelLayerRegistry.registerModelLayer(UFO, UfoModel::getTexturedModelData);
		EntityModelLayerRegistry.registerModelLayer(ALIEN_SOLDIER, AlienSoldierModel::getTexturedModelData);
		EntityModelLayerRegistry.registerModelLayer(KAIJU, KaijuModel::getTexturedModelData);
	}
}
