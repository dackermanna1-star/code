package dev.visceral.client;

import dev.visceral.Visceral;
import dev.visceral.client.anim.ClipLibrary;
import dev.visceral.client.camera.ShoulderCamera;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.config.ConfigScreen;
import dev.visceral.client.dev.AutoTest;
import dev.visceral.client.fx.BloodDecals;
import dev.visceral.client.fx.BloodFx;
import dev.visceral.client.fx.BloodParticles;
import dev.visceral.client.fx.WoundLayer;
import dev.visceral.client.hud.LockOnHud;
import dev.visceral.client.input.CombatInput;
import dev.visceral.client.input.ControlPreset;
import dev.visceral.client.input.Keybinds;
import dev.visceral.client.net.ClientNet;
import dev.visceral.client.physics.RagdollManager;
import dev.visceral.client.render.CorpseManager;
import dev.visceral.registry.VisceralRegistry;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientEntityEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.particle.v1.ParticleFactoryRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.world.entity.LivingEntity;

/** Client entry point: animation, ragdolls, camera, input, effects. */
public class VisceralClient implements ClientModInitializer {
	@Override
	@SuppressWarnings({"unchecked", "rawtypes"})
	public void onInitializeClient() {
		ClientConfig.load();
		Keybinds.register();
		ClipLibrary.init();
		ClientNet.init();

		ParticleFactoryRegistry particles = ParticleFactoryRegistry.getInstance();
		particles.register(VisceralRegistry.BLOOD_DROP, BloodParticles::dropProvider);
		particles.register(VisceralRegistry.BLOOD_MIST, BloodParticles::mistProvider);
		particles.register(VisceralRegistry.BONE_CHIP, BloodParticles::chipProvider);

		LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
			if (renderer.getModel() instanceof HumanoidModel<?>) helper.register(new WoundLayer(renderer));
		});

		ClientLifecycleEvents.CLIENT_STARTED.register(ControlPreset::applyOnFirstLaunch);

		ClientTickEvents.START_CLIENT_TICK.register(client -> ShoulderCamera.tick());
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			CombatInput.tick();
			CorpseManager.tick();
			BloodFx.tick();
			BloodDecals.tick();
			while (Keybinds.swapShoulder.consumeClick()) ShoulderCamera.swapShoulder();
			while (Keybinds.openConfig.consumeClick()) client.setScreen(new ConfigScreen(client.screen));
		});

		ClientEntityEvents.ENTITY_UNLOAD.register((entity, level) -> {
			if (entity instanceof LivingEntity living) CorpseManager.onRemoved(living);
		});

		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			CorpseManager.clear();
			RagdollManager.clear();
			BloodDecals.clear();
			BloodFx.clear();
			CombatInput.reset();
		});

		WorldRenderEvents.BEFORE_TRANSLUCENT.register(context -> BloodDecals.render(context.matrices(), context.consumers(),
			context.worldState().cameraRenderState.pos));

		HudElementRegistry.attachElementAfter(VanillaHudElements.CROSSHAIR, Visceral.id("lock_on"), LockOnHud::render);
		AutoTest.init();
		Visceral.LOGGER.info("Visceral client initialised");
	}
}
