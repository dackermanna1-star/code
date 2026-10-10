package dev.overkill.client;

import dev.overkill.client.fx.CameraShake;
import dev.overkill.client.fx.FxClient;
import dev.overkill.client.fx.HeldWeaponEffects;
import dev.overkill.client.particle.ModParticleStyles;
import dev.overkill.network.FxPayload;
import dev.overkill.network.ShakePayload;
import dev.overkill.registry.ModEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.client.renderer.entity.NoopRenderer;
import net.minecraft.client.renderer.entity.ThrownItemRenderer;

public class OverkillArsenalClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ModParticleStyles.register();
		WeaponTooltips.register();

		EntityRenderers.register(ModEntities.WORLDBREAKER_ORB, NoopRenderer::new);
		EntityRenderers.register(ModEntities.RIFT, NoopRenderer::new);
		EntityRenderers.register(ModEntities.SINGULARITY, NoopRenderer::new);
		EntityRenderers.register(ModEntities.SINGULARITY_ROUND, context -> new ThrownItemRenderer<>(context, 1.4F, true));

		ClientPlayNetworking.registerGlobalReceiver(FxPayload.TYPE, (payload, context) -> FxClient.handle(payload));
		ClientPlayNetworking.registerGlobalReceiver(ShakePayload.TYPE, (payload, context) -> CameraShake.add(payload.strength(), payload.ticks()));

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			CameraShake.tick();
			HeldWeaponEffects.tick(client);
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> CameraShake.clear());
	}
}
