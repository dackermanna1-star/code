package dev.portalgun.client;

import dev.portalgun.PortalGunMod;
import dev.portalgun.client.hud.PortalGunHud;
import dev.portalgun.client.particle.PortalSparkParticle;
import dev.portalgun.client.render.PortalRenderer;
import dev.portalgun.client.render.PortalShotRenderer;
import dev.portalgun.client.screen.DimensionDialScreen;
import dev.portalgun.item.PortalGunItem;
import dev.portalgun.registry.ModEntities;
import dev.portalgun.registry.ModParticles;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.Minecraft;

public class PortalGunClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityRendererRegistry.register(ModEntities.PORTAL, PortalRenderer::new);
		EntityRendererRegistry.register(ModEntities.PORTAL_SHOT, PortalShotRenderer::new);
		ParticleFactoryRegistry.getInstance().register(ModParticles.PORTAL_SPARK, PortalSparkParticle.Provider::new);
		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, PortalGunMod.id("portal_gun_hud"), PortalGunHud::render);
		PortalGunItem.openDialHook = hand -> {
			Minecraft mc = Minecraft.getInstance();
			if (mc.player != null) {
				mc.setScreen(new DimensionDialScreen(hand, mc.player.getItemInHand(hand)));
			}
		};
		ClientContent.init();
	}
}
