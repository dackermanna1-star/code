package com.jjkshowdown.client;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.cinematic.CameraDirector;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.hud.JjkHud;
import com.jjkshowdown.client.hud.OverlayRenderer;
import com.jjkshowdown.client.input.InputHandler;
import com.jjkshowdown.client.input.Keybinds;
import com.jjkshowdown.client.particle.JjkParticle;
import com.jjkshowdown.client.qte.QteClient;
import com.jjkshowdown.client.render.DomainClientState;
import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.client.render.entity.BladeRenderers;
import com.jjkshowdown.client.render.entity.DebrisRenderer;
import com.jjkshowdown.client.render.entity.DomainRenderer;
import com.jjkshowdown.client.render.entity.OrbRenderers;
import com.jjkshowdown.client.render.model.EmissiveLayer;
import com.jjkshowdown.client.render.model.SorcererBossRenderer;
import com.jjkshowdown.client.render.model.SorcererModel;
import com.jjkshowdown.client.render.model.TechniqueAuraLayer;
import com.jjkshowdown.client.sound.ClientSounds;
import com.jjkshowdown.registry.ModEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.resources.Identifier;

import java.util.List;

public class JjkShowdownClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientConfig.load();
		JjkRenderTypes.init();
		Keybinds.init();
		ClientNet.init();
		JjkParticle.registerAll();

		EntityModelLayerRegistry.registerModelLayer(SorcererModel.LAYER, SorcererModel::createLayer);
		EntityRendererRegistry.register(ModEntities.GOJO, SorcererBossRenderer::new);
		EntityRendererRegistry.register(ModEntities.SUKUNA, SorcererBossRenderer::new);
		EntityRendererRegistry.register(ModEntities.BLUE, OrbRenderers.Blue::new);
		EntityRendererRegistry.register(ModEntities.RED, OrbRenderers.Red::new);
		EntityRendererRegistry.register(ModEntities.HOLLOW_PURPLE, OrbRenderers.Purple::new);
		EntityRendererRegistry.register(ModEntities.DISMANTLE, BladeRenderers.Dismantle::new);
		EntityRendererRegistry.register(ModEntities.WORLD_SLASH, BladeRenderers.WorldSlash::new);
		EntityRendererRegistry.register(ModEntities.FUGA, BladeRenderers.Fuga::new);
		EntityRendererRegistry.register(ModEntities.DEBRIS, DebrisRenderer::new);
		EntityRendererRegistry.register(ModEntities.DOMAIN, DomainRenderer::new);

		// sorcerer layers on players: technique auras and glowing eyes
		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, ctx) -> {
			if (renderer instanceof AvatarRenderer<?> avatar) {
				helper.register(new TechniqueAuraLayer<>(avatar));
				helper.register(new EmissiveLayer<>(avatar, true));
			}
		});

		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, JjkShowdown.id("hud"), JjkHud::render);
		HudElementRegistry.addLast(JjkShowdown.id("overlay"), OverlayRenderer::render);
		// hide vanilla HUD during cinematics
		for (Identifier id : List.of(VanillaHudElements.CROSSHAIR, VanillaHudElements.HOTBAR, VanillaHudElements.ARMOR_BAR, VanillaHudElements.HEALTH_BAR,
				VanillaHudElements.FOOD_BAR, VanillaHudElements.AIR_BAR, VanillaHudElements.MOUNT_HEALTH, VanillaHudElements.INFO_BAR,
				VanillaHudElements.EXPERIENCE_LEVEL, VanillaHudElements.HELD_ITEM_TOOLTIP, VanillaHudElements.STATUS_EFFECTS, VanillaHudElements.BOSS_BAR,
				VanillaHudElements.SCOREBOARD, VanillaHudElements.OVERLAY_MESSAGE)) {
			HudElementRegistry.replaceElement(id, old -> (g, delta) -> {
				if (!CameraDirector.isActive()) old.render(g, delta);
			});
		}

		ClientTickEvents.START_CLIENT_TICK.register(InputHandler::tick);
		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			if (ClientState.pendingFirstSelection && mc.screen == null && mc.player != null && mc.level != null) {
				ClientState.pendingFirstSelection = false;
				mc.setScreen(new com.jjkshowdown.client.screen.CharacterSelectScreen(true));
			}
			ScreenFx.tick();
			CameraDirector.tick();
			QteClient.tick();
			DomainClientState.tick();
		});
		ClientEntityEvents.ENTITY_LOAD.register((entity, level) -> ClientSounds.onEntityLoad(entity));
		ClientEntityEvents.ENTITY_UNLOAD.register((entity, level) -> ClientState.forget(entity.getId()));
		ClientPlayConnectionEvents.JOIN.register((handler, sender, mc) -> ClientNet.sendSettings());
		ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> {
			ClientState.reset();
			CameraDirector.reset();
			QteClient.reset();
			ScreenFx.clear();
		});
	}
}
