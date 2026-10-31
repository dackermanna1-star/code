package com.jjkshowdown.client;

import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.input.InputHandler;
import com.jjkshowdown.client.qte.QteClient;
import com.jjkshowdown.client.screen.CharacterSelectScreen;
import com.jjkshowdown.client.sound.ClientSounds;
import com.jjkshowdown.network.Payloads;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;

/** Client-side packet handlers. */
public final class ClientNet {
	private ClientNet() {
	}

	public static void init() {
		ClientPlayNetworking.registerGlobalReceiver(Payloads.SorcererSync.TYPE, (p, ctx) -> {
			boolean wasSorcerer = ClientState.character().isSorcerer();
			ClientState.self = p;
			ClientState.selfSyncTick = ctx.client().level == null ? 0 : ctx.client().level.getGameTime();
			if (wasSorcerer && !ClientState.character().isSorcerer()) InputHandler.releaseAll();
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.EntityVisual.TYPE, (p, ctx) -> ClientState.acceptVisual(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Cinematic.TYPE, (p, ctx) -> {
			InputHandler.releaseAll();
			CameraDirector.start(p);
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.CinematicEnd.TYPE, (p, ctx) -> CameraDirector.end(p.sessionId()));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.QteStart.TYPE, (p, ctx) -> QteClient.start(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.QteEnd.TYPE, (p, ctx) -> QteClient.end(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ScreenEffect.TYPE, (p, ctx) -> ScreenFx.accept(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Voice.TYPE, (p, ctx) -> ClientSounds.voice(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Clash.TYPE, (p, ctx) -> {
			ClientState.clash = p;
			ClientState.clashTick = ctx.client().level == null ? 0 : ctx.client().level.getGameTime();
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.Notify.TYPE, (p, ctx) -> ClientState.notify(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.OpenSelection.TYPE, (p, ctx) -> {
			Minecraft mc = ctx.client();
			if (!p.firstTime()) {
				mc.setScreen(new CharacterSelectScreen(false));
			} else {
				// the first-join prompt usually arrives while the world is still loading: open it once that screen is gone
				ClientState.pendingFirstSelection = true;
			}
		});
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ComboEvent.TYPE, (p, ctx) -> ClientState.acceptCombo(p));
		ClientPlayNetworking.registerGlobalReceiver(Payloads.ConfigSync.TYPE, (p, ctx) -> ClientState.acceptConfig(p));
	}

	public static void sendSettings() {
		ClientConfig c = ClientConfig.get();
		if (ClientPlayNetworking.canSend(Payloads.ClientSettings.TYPE)) {
			ClientPlayNetworking.send(new Payloads.ClientSettings(c.quickTimeEvents, c.cinematics, c.autoSkipCinematics));
		}
	}
}
