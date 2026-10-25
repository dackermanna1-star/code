package com.godforge.client;

import com.godforge.Godforge;
import com.godforge.client.fx.ClientFx;
import com.godforge.client.fx.ScreenEffects;
import com.godforge.client.fx.WorldFx;
import com.godforge.client.hud.WeaponHud;
import com.godforge.client.input.Keybinds;
import com.godforge.client.particle.ModParticleProviders;
import com.godforge.client.render.GfRenderTypes;
import com.godforge.client.render.entity.ArtificialSunRenderer;
import com.godforge.client.render.entity.AsteroidRenderer;
import com.godforge.client.render.entity.DebrisRenderer;
import com.godforge.client.render.entity.EnergyOrbRenderer;
import com.godforge.client.render.entity.FractureChunkRenderer;
import com.godforge.client.render.entity.KineticFistRenderer;
import com.godforge.client.render.entity.LaserBeamRenderer;
import com.godforge.client.render.entity.MiniSunRenderer;
import com.godforge.client.render.entity.OrbitalStrikeRenderer;
import com.godforge.client.render.entity.RealityCutRenderer;
import com.godforge.client.render.entity.RiftRenderer;
import com.godforge.client.render.entity.RiftSlashRenderer;
import com.godforge.client.render.entity.SingularityRenderer;
import com.godforge.client.render.entity.TargetMarkerRenderer;
import com.godforge.client.sound.EntityLoopSound;
import com.godforge.entity.ArtificialSunEntity;
import com.godforge.entity.DimensionalRiftEntity;
import com.godforge.entity.LaserBeamEntity;
import com.godforge.entity.SingularityEntity;
import com.godforge.network.CooldownPayload;
import com.godforge.network.FxPayload;
import com.godforge.registry.ModEntities;
import com.godforge.registry.ModSounds;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.Minecraft;

/** Client entry point: renderers, particles, screen effects, HUD, input and audio. */
public final class GodforgeClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientConfig.load();
		GfRenderTypes.init();
		ModParticleProviders.init();
		Keybinds.init();
		this.registerRenderers();

		ClientPlayNetworking.registerGlobalReceiver(FxPayload.TYPE, (payload, context) -> ClientFx.handle(payload));
		ClientPlayNetworking.registerGlobalReceiver(CooldownPayload.TYPE, (payload, context) -> ClientState.onCooldown(payload));

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			Keybinds.tick(client);
			if (!client.isPaused()) {
				ScreenEffects.tick();
				WorldFx.tick();
			}
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			ScreenEffects.reset();
			WorldFx.clear();
			ClientState.reset();
		});
		WorldRenderEvents.AFTER_ENTITIES.register(WorldFx::render);
		HudElementRegistry.attachElementAfter(VanillaHudElements.MISC_OVERLAYS, Godforge.id("screen_effects"),
			(graphics, delta) -> ScreenEffects.renderOverlay(graphics, delta.getGameTimeDeltaPartialTick(false)));
		HudElementRegistry.attachElementAfter(VanillaHudElements.HOTBAR, Godforge.id("weapon_status"), WeaponHud::render);

		ClientEntityEvents.ENTITY_LOAD.register((entity, level) -> {
			var sounds = Minecraft.getInstance().getSoundManager();
			if (entity instanceof LaserBeamEntity beam) {
				sounds.play(new EntityLoopSound(beam, ModSounds.LASER_LOOP,
					e -> 0.5 + ((LaserBeamEntity) e).power() * 0.09 * (0.5 + ((LaserBeamEntity) e).intensity() * 0.5) + (((LaserBeamEntity) e).overloaded() ? 1.5 : 0.0),
					e -> 0.6 + ((LaserBeamEntity) e).power() * 0.07 + (((LaserBeamEntity) e).overloaded() ? 0.3 : 0.0)));
			} else if (entity instanceof SingularityEntity hole) {
				sounds.play(new EntityLoopSound(hole, ModSounds.BLACKHOLE_LOOP, e -> 2.0 + ((SingularityEntity) e).size() * 1.2, e -> 1.1 - Math.min(0.5, ((SingularityEntity) e).size() * 0.06)));
			} else if (entity instanceof DimensionalRiftEntity rift) {
				sounds.play(new EntityLoopSound(rift, ModSounds.RIFT_LOOP, e -> 1.5, e -> 0.9));
			} else if (entity instanceof ArtificialSunEntity sun) {
				sounds.play(new EntityLoopSound(sun, ModSounds.SUN_LOOP, e -> 8.0 + ((ArtificialSunEntity) e).eruption(0.0F) * 8.0, e -> 0.7 + ((ArtificialSunEntity) e).eruption(0.0F) * 0.6));
			}
		});
		Godforge.LOGGER.info("Godforge Arsenal client effects ready");
	}

	private void registerRenderers() {
		EntityRendererRegistry.register(ModEntities.RIFT_SLASH, RiftSlashRenderer::new);
		EntityRendererRegistry.register(ModEntities.REALITY_CUT, RealityCutRenderer::new);
		EntityRendererRegistry.register(ModEntities.LASER_BEAM, LaserBeamRenderer::new);
		EntityRendererRegistry.register(ModEntities.PRISM_ORB, ctx -> new EnergyOrbRenderer<>(ctx, EnergyOrbRenderer.Style.PRISM));
		EntityRendererRegistry.register(ModEntities.ASTEROID, AsteroidRenderer::new);
		EntityRendererRegistry.register(ModEntities.TARGET_MARKER, TargetMarkerRenderer::new);
		EntityRendererRegistry.register(ModEntities.SINGULARITY, SingularityRenderer::new);
		EntityRendererRegistry.register(ModEntities.FLYING_DEBRIS, DebrisRenderer::new);
		EntityRendererRegistry.register(ModEntities.FRACTURE_CHUNK, FractureChunkRenderer::new);
		EntityRendererRegistry.register(ModEntities.DIMENSIONAL_RIFT, RiftRenderer::new);
		EntityRendererRegistry.register(ModEntities.STAR_BOLT, ctx -> new EnergyOrbRenderer<>(ctx, EnergyOrbRenderer.Style.STAR));
		EntityRendererRegistry.register(ModEntities.KINETIC_FIST, KineticFistRenderer::new);
		EntityRendererRegistry.register(ModEntities.SOLAR_BOLT, ctx -> new EnergyOrbRenderer<>(ctx, EnergyOrbRenderer.Style.SUN));
		EntityRendererRegistry.register(ModEntities.MINI_SUN, MiniSunRenderer::new);
		EntityRendererRegistry.register(ModEntities.ARTIFICIAL_SUN, ArtificialSunRenderer::new);
		EntityRendererRegistry.register(ModEntities.CRACKER_SHELL, ctx -> new EnergyOrbRenderer<>(ctx, EnergyOrbRenderer.Style.CRACKER));
		EntityRendererRegistry.register(ModEntities.ORBITAL_STRIKE, OrbitalStrikeRenderer::new);
	}
}
