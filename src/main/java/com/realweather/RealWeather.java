package com.realweather;

import com.realweather.command.WeatherCommands;
import com.realweather.config.RealWeatherConfig;
import com.realweather.network.RealWeatherNetworking;
import com.realweather.weather.WeatherSimulator;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerPlayerEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class RealWeather implements ModInitializer {
	public static final String MOD_ID = "realweather";
	public static final Logger LOGGER = LoggerFactory.getLogger("RealWeather");

	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	@Override
	public void onInitialize() {
		RealWeatherConfig.load();
		RealWeatherNetworking.registerPayloads();

		CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> WeatherCommands.register(dispatcher));

		ServerLifecycleEvents.SERVER_STARTED.register(WeatherSimulator::start);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> WeatherSimulator.stop());
		ServerTickEvents.END_WORLD_TICK.register(level -> {
			WeatherSimulator simulator = WeatherSimulator.get();
			if (simulator != null && level == level.getServer().overworld()) {
				simulator.tick(level);
			}
		});

		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> sendSnapshot(handler.getPlayer()));
		ServerPlayerEvents.AFTER_RESPAWN.register((oldPlayer, newPlayer, alive) -> sendSnapshot(newPlayer));
		ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) -> sendSnapshot(player));

		LOGGER.info("RealWeather initialized");
	}

	private static void sendSnapshot(net.minecraft.server.level.ServerPlayer player) {
		WeatherSimulator simulator = WeatherSimulator.get();
		if (simulator != null) {
			simulator.sendTo(player, true);
		}
	}
}
