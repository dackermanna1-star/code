package dev.calibercraft.client;

import dev.calibercraft.CaliberCraft;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.client.fx.CCParticles;
import dev.calibercraft.client.fx.ClientEffects;
import dev.calibercraft.client.fx.TracerRenderer;
import dev.calibercraft.client.hud.GunHud;
import dev.calibercraft.client.input.Keybinds;
import dev.calibercraft.client.render.WeaponRenderData;
import dev.calibercraft.client.screen.GunsmithScreen;
import dev.calibercraft.client.screen.WeaponPreviewRenderer;
import dev.calibercraft.client.sound.GunSounds;
import dev.calibercraft.network.GunFeedbackPayload;
import dev.calibercraft.network.HitConfirmPayload;
import dev.calibercraft.network.ImpactPayload;
import dev.calibercraft.network.OpenGunsmithPayload;
import dev.calibercraft.network.ShotEventPayload;
import dev.calibercraft.network.SyncDataPayload;
import dev.calibercraft.network.WhizPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.SpecialGuiElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.minecraft.server.packs.PackType;

/** Client entrypoint: presentation only (rendering, input, HUD, audio). */
public final class CaliberCraftClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientConfig.load();
		Keybinds.init();
		CCParticles.register();
		ResourceLoader.get(PackType.CLIENT_RESOURCES).registerReloader(WeaponRenderData.Loader.ID, new WeaponRenderData.Loader());

		ClientPlayNetworking.registerGlobalReceiver(SyncDataPayload.TYPE, (p, ctx) -> ClientGunData.accept(p));
		ClientPlayNetworking.registerGlobalReceiver(ShotEventPayload.TYPE, (p, ctx) -> ClientEffects.remoteShot(p));
		ClientPlayNetworking.registerGlobalReceiver(ImpactPayload.TYPE, (p, ctx) -> ClientEffects.impacts(p));
		ClientPlayNetworking.registerGlobalReceiver(HitConfirmPayload.TYPE, (p, ctx) -> ClientEffects.hitConfirm(p));
		ClientPlayNetworking.registerGlobalReceiver(WhizPayload.TYPE, (p, ctx) -> ClientEffects.whiz(p));
		ClientPlayNetworking.registerGlobalReceiver(GunFeedbackPayload.TYPE, (p, ctx) -> GunController.INSTANCE.onFeedback(p));
		ClientPlayNetworking.registerGlobalReceiver(OpenGunsmithPayload.TYPE, (p, ctx) -> GunsmithScreen.open(p.bench()));

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			GunController.INSTANCE.tick(mc);
			GunSounds.tick();
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> {
			ClientGunData.reset();
			TracerRenderer.clear();
			GunSounds.clear();
			CCParticles.clear();
		});

		HudElementRegistry.addFirst(CaliberCraft.id("scope"), GunHud.SCOPE);
		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, CaliberCraft.id("ammo"), GunHud.AMMO);
		HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, vanilla -> (g, delta) -> {
			if (!GunHud.crosshair(g, delta)) {
				vanilla.render(g, delta);
			}
		});
		WorldRenderEvents.AFTER_ENTITIES.register(TracerRenderer::render);
		SpecialGuiElementRegistry.register(ctx -> new WeaponPreviewRenderer(ctx.vertexConsumers()));
		ItemTooltipCallback.EVENT.register(Tooltips::append);
	}
}
