package com.chaosunleashed.client.render;

import com.chaosunleashed.client.render.entity.AlienSoldierRenderer;
import com.chaosunleashed.client.render.entity.BisonRenderer;
import com.chaosunleashed.client.render.entity.UfoRenderer;
import com.chaosunleashed.client.render.entity.BlackHoleRenderer;
import com.chaosunleashed.client.render.entity.KaijuRenderer;
import com.chaosunleashed.client.render.entity.KaijuWeakPointRenderer;
import com.chaosunleashed.client.render.entity.RiftRenderer;
import com.chaosunleashed.client.render.entity.ShadeStalkerRenderer;
import com.chaosunleashed.registry.ModEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.render.entity.FlyingItemEntityRenderer;

/** Registers every entity renderer and model layer. */
public final class ChaosEntityRenderers {
	private ChaosEntityRenderers() {
	}

	public static void register() {
		ChaosModelLayers.register();
		EntityRendererRegistry.register(ModEntities.SHADE_STALKER, ShadeStalkerRenderer::new);
		EntityRendererRegistry.register(ModEntities.BISON, BisonRenderer::new);
		EntityRendererRegistry.register(ModEntities.DIMENSION_RIFT, RiftRenderer::new);
		EntityRendererRegistry.register(ModEntities.BLACK_HOLE, BlackHoleRenderer::new);
		EntityRendererRegistry.register(ModEntities.STABILIZER_CORE, FlyingItemEntityRenderer::new);
		EntityRendererRegistry.register(ModEntities.UFO, UfoRenderer::new);
		EntityRendererRegistry.register(ModEntities.KAIJU, KaijuRenderer::new);
		EntityRendererRegistry.register(ModEntities.KAIJU_WEAK_POINT, KaijuWeakPointRenderer::new);
		EntityRendererRegistry.register(ModEntities.ALIEN_SOLDIER, AlienSoldierRenderer::new);
		EntityRendererRegistry.register(ModEntities.PLASMA_BOLT, context -> new FlyingItemEntityRenderer<>(context, 1.2F, true));
	}
}
