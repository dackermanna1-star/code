package com.chaosunleashed.client;

import com.chaosunleashed.client.effect.ScreenShake;
import com.chaosunleashed.client.screen.ChaosPanelScreen;
import com.chaosunleashed.core.ChaosEnvironment;
import com.chaosunleashed.network.ChaosStatusPayload;
import com.chaosunleashed.network.OpenPanelPayload;
import com.chaosunleashed.network.ScreenShakePayload;
import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.render.ChaosHudOverlay;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;

public class ChaosUnleashedClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ChaosEnvironment.clientProvider = world -> ClientChaosState.SOURCE;
		com.chaosunleashed.client.particle.ChaosParticle.register();
		com.chaosunleashed.client.render.ChaosEntityRenderers.register();
		com.chaosunleashed.client.dev.AutoTest.init();
		HudElementRegistry.addFirst(ChaosUnleashed.id("event_overlay"), new ChaosHudOverlay());

		ClientPlayNetworking.registerGlobalReceiver(ChaosStatusPayload.ID, (payload, context) -> ClientChaosState.apply(payload));
		ClientPlayNetworking.registerGlobalReceiver(ScreenShakePayload.ID, (payload, context) -> ScreenShake.add(payload.strength(), payload.ticks()));
		ClientPlayNetworking.registerGlobalReceiver(OpenPanelPayload.ID, (payload, context) ->
			context.client().setScreen(new ChaosPanelScreen(payload.pos())));
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> ClientChaosState.reset());

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			if (client.world != null && !client.isPaused()) {
				ClientChaosState.tick(client);
				ScreenShake.tick();
			}
		});
	}
}
