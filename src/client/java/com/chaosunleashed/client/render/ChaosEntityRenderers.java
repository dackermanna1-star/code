package com.chaosunleashed.client.render;

import com.chaosunleashed.client.render.entity.AlienSoldierRenderer;
import com.chaosunleashed.client.render.entity.BisonRenderer;
import com.chaosunleashed.client.render.entity.BlackHoleRenderer;
import com.chaosunleashed.client.render.entity.KaijuRenderer;
import com.chaosunleashed.client.render.entity.KaijuWeakPointRenderer;
import com.chaosunleashed.client.render.entity.RiftRenderer;
import com.chaosunleashed.client.render.entity.ShadeStalkerRenderer;
import com.chaosunleashed.client.render.entity.UfoRenderer;
import com.chaosunleashed.registry.ModEntities;
import net.minecraft.client.render.entity.EntityRendererFactories;
import net.minecraft.client.render.entity.FlyingItemEntityRenderer;

/** Registers every entity renderer and model layer. */
public final class ChaosEntityRenderers {
	private ChaosEntityRenderers() {
	}

	public static void register() {
		ChaosModelLayers.register();
		EntityRendererFactories.register(ModEntities.SHADE_STALKER, ShadeStalkerRenderer::new);
		EntityRendererFactories.register(ModEntities.BISON, BisonRenderer::new);
		EntityRendererFactories.register(ModEntities.DIMENSION_RIFT, RiftRenderer::new);
		EntityRendererFactories.register(ModEntities.BLACK_HOLE, BlackHoleRenderer::new);
		EntityRendererFactories.register(ModEntities.STABILIZER_CORE, FlyingItemEntityRenderer::new);
		EntityRendererFactories.register(ModEntities.UFO, UfoRenderer::new);
		EntityRendererFactories.register(ModEntities.KAIJU, KaijuRenderer::new);
		EntityRendererFactories.register(ModEntities.KAIJU_WEAK_POINT, KaijuWeakPointRenderer::new);
		EntityRendererFactories.register(ModEntities.ALIEN_SOLDIER, AlienSoldierRenderer::new);
		EntityRendererFactories.register(ModEntities.PLASMA_BOLT, context -> new FlyingItemEntityRenderer<>(context, 1.2F, true));
	}
}
