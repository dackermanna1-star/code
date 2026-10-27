package com.realweather.client;

import com.realweather.RealWeather;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.particle.WeatherParticles;
import com.realweather.client.render.DebugOverlay;
import com.realweather.client.render.DistantLightning;
import com.realweather.client.render.RealisticLightningRenderer;
import com.realweather.client.render.VolumetricClouds;
import com.realweather.client.sound.WeatherSounds;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.weather.CloudLayer;
import com.realweather.network.LightningPayload;
import com.realweather.network.WeatherSyncPayload;
import com.realweather.weather.Climate;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.resource.v1.pack.PackActivationType;
import net.fabricmc.fabric.api.resource.v1.ResourceLoader;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.phys.Vec3;

public final class RealWeatherClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientConfig.load();
		Climate.setClientColdSnapSource(level -> ClientWeather.get().coldSnap());

		ClientPlayNetworking.registerGlobalReceiver(WeatherSyncPayload.TYPE, (payload, context) -> ClientWeather.get().onSync(payload));
		ClientPlayNetworking.registerGlobalReceiver(LightningPayload.TYPE, (payload, context) -> onLightning(payload));

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			ClientWeather.get().tick(client);
			WeatherParticles.get().tick(client);
			WeatherSounds.get().tick(client);
		});
		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> resetState());
		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> VolumetricClouds.shutdown());

		EntityRendererRegistry.register(EntityType.LIGHTNING_BOLT, RealisticLightningRenderer::new);
		HudElementRegistry.addLast(RealWeather.id("debug"), DebugOverlay::render);
		ClientCommandRegistrationCallback.EVENT.register((dispatcher, registryAccess) -> ClientCommands.register(dispatcher));

		FabricLoader.getInstance().getModContainer(RealWeather.MOD_ID).ifPresent(container -> ResourceLoader.registerBuiltinPack(
			RealWeather.id("terrain_effects"), container, Component.translatable("realweather.pack.terrain_effects"), PackActivationType.DEFAULT_ENABLED));
	}

	private static void resetState() {
		ClientWeather.get().reset();
		WeatherSounds.get().reset();
		WeatherParticles.get().reset();
		DistantLightning.clear();
	}

	private static void onLightning(LightningPayload payload) {
		Minecraft minecraft = Minecraft.getInstance();
		if (minecraft.level == null) {
			return;
		}
		ClientWeather weather = ClientWeather.get();
		boolean bolt = payload.kind() == LightningPayload.KIND_DISTANT_BOLT;
		float cloudBase = CloudLayer.baseHeight(minecraft.level, weather.state());
		double y = bolt ? payload.y() : cloudBase + 20.0;
		weather.addFlash(payload.x(), y, payload.z(), payload.intensity() * (bolt ? 1.0F : 0.7F), bolt, payload.seed());
		ClientWeather.Flash flash = weather.flashes().getLast();
		if (bolt) {
			DistantLightning.add(flash, payload.x(), payload.y(), payload.z(), Math.max(60.0F, cloudBase - (float) payload.y()));
		}
		WeatherSounds.get().onLightning(new Vec3(payload.x(), bolt ? payload.y() + 40.0 : cloudBase + 20.0, payload.z()), payload.intensity(), bolt);
	}
}
