package com.realweather.gametest;

import com.realweather.client.config.ClientConfig;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.server.MinecraftServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Development-only showcase driver (enabled with {@code -Drealweather.demo=true}, see the {@code runDemo} Gradle
 * task). After the quick-play world has loaded it walks through every weather type, letting each transition settle,
 * and saves a screenshot of each. Unlike the lockstep client game tests this runs in real time, which keeps world
 * loading fast even on software OpenGL.
 */
public final class WeatherDemo implements ClientModInitializer {
	private static final Logger LOGGER = LoggerFactory.getLogger("RealWeatherDemo");

	private sealed interface Step permits Command, Wait, Shot, Config {
	}

	private record Command(String command) implements Step {
	}

	private record Wait(int ticks) implements Step {
	}

	private record Shot(String name) implements Step {
	}

	private record Config(Runnable action) implements Step {
	}

	private final List<Step> steps = new ArrayList<>();
	private int index;
	private int waiting;
	private int loadedTicks;

	@Override
	public void onInitializeClient() {
		if (!Boolean.getBoolean("realweather.demo")) {
			return;
		}
		this.buildScript();
		ClientTickEvents.END_CLIENT_TICK.register(this::tick);
	}

	private void buildScript() {
		// "x z yaw pitch": the player is dropped onto the surface at x/z and looks in the given direction.
		String[] spot = System.getProperty("realweather.demo.pos", "0 0 0 0").trim().split("\\s+");
		int settle = Integer.getInteger("realweather.demo.settle", 300);
		String only = System.getProperty("realweather.demo.only", "");
		this.steps.add(new Config(() -> {
			ClientConfig config = ClientConfig.get();
			config.quality = System.getProperty("realweather.demo.quality", "medium");
			config.debugOverlay = Boolean.getBoolean("realweather.demo.debug");
			Minecraft.getInstance().options.hideGui = !config.debugOverlay;
		}));
		this.steps.add(new Command("gamerule advance_time false"));
		this.steps.add(new Command("gamerule advance_weather false"));
		this.steps.add(new Command("gamemode creative @a"));
		this.steps.add(new Command("spreadplayers " + spot[0] + " " + spot[1] + " 0 1 false @a"));
		this.steps.add(new Wait(40));
		this.steps.add(new Command("execute as @a at @s run tp @s ~ ~ ~ " + spot[2] + " " + spot[3]));
		this.steps.add(new Command("time set " + System.getProperty("realweather.demo.time", "2000")));
		this.steps.add(new Wait(160));

		String[][] scenes = {
			{"01_clear", "weather clear 100000 0.55", "weather wind 3 w"},
			{"02_overcast", "weather overcast 100000 0.9", "weather wind 6 sw"},
			{"03_fog", "weather fog 100000 1.0", "weather wind 1 w"},
			{"04_rain", "weather rain 100000 0.65", "weather wind 7 w"},
			{"05_thunderstorm", "weather thunder 100000 1.0", "weather wind 14 sw"},
			{"07_snow", "weather snow 100000 0.7", "weather wind 4 n"},
			{"09_blizzard", "weather blizzard 100000 1.0", "weather wind 22 nw"},
		};
		for (String[] scene : scenes) {
			if (!only.isEmpty() && !scene[0].contains(only)) {
				continue;
			}
			this.steps.add(new Command(scene[1]));
			this.steps.add(new Command(scene[2]));
			this.steps.add(new Wait(settle));
			this.steps.add(new Shot(scene[0]));
			if (scene[0].equals("05_thunderstorm")) {
				this.steps.add(new Command("execute at @p rotated ~ 0 run summon minecraft:lightning_bolt ^-25 ~ ^70"));
				this.steps.add(new Wait(2));
				this.steps.add(new Shot("06_lightning"));
			}
			if (scene[0].equals("07_snow")) {
				this.steps.add(new Wait(settle * 2));
				this.steps.add(new Shot("08_snow_accumulated"));
			}
		}
		String diagnose = System.getProperty("realweather.demo.diagnose", "");
		if (!diagnose.isEmpty()) {
			// Isolates the contribution of each effect: one screenshot per disabled feature.
			this.steps.add(new Command("weather " + diagnose + " 100000 0.65"));
			this.steps.add(new Wait(settle));
			this.steps.add(new Shot("diag_" + diagnose + "_all"));
			for (int i = 0; i < 6; i++) {
				this.steps.add(new Wait(15));
				this.steps.add(new Shot("diag_" + diagnose + "_burst" + i));
			}
			for (String option : new String[] {"customPrecipitation", "rainCurtains", "weatherFog", "volumetricClouds", "wetSurfaces", "skyEffects"}) {
				this.steps.add(new Config(() -> setOption(option, false)));
				this.steps.add(new Wait(30));
				this.steps.add(new Shot("diag_" + diagnose + "_no_" + option));
				this.steps.add(new Config(() -> setOption(option, true)));
			}
			return;
		}
		if (only.isEmpty()) {
			this.steps.add(new Command("time set 14000"));
			this.steps.add(new Command("weather thunder 100000 1.0"));
			this.steps.add(new Command("weather wind 12 w"));
			this.steps.add(new Wait(settle));
			this.steps.add(new Shot("10_night_storm"));
		}
	}

	private static void setOption(String name, boolean value) {
		try {
			ClientConfig.class.getField(name).setBoolean(ClientConfig.get(), value);
		} catch (ReflectiveOperationException e) {
			throw new IllegalArgumentException(name, e);
		}
	}

	private void tick(Minecraft client) {
		if (this.index >= this.steps.size()) {
			if (this.index == this.steps.size()) {
				LOGGER.info("Demo finished");
				this.index++;
				client.stop();
			}
			return;
		}
		MinecraftServer server = client.getSingleplayerServer();
		if (client.level == null || client.player == null || server == null || client.screen != null) {
			return;
		}
		if (++this.loadedTicks < 100) {
			return;
		}
		if (this.waiting > 0) {
			this.waiting--;
			return;
		}
		Step step = this.steps.get(this.index++);
		switch (step) {
			case Command command -> {
				LOGGER.info("Demo command: {}", command.command());
				server.execute(() -> server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), command.command()));
			}
			case Wait wait -> this.waiting = wait.ticks();
			case Shot shot -> {
				LOGGER.info("Demo screenshot: {} [{}] fps {}", shot.name(), String.join(" | ", com.realweather.client.render.DebugOverlay.lines(1.0F)),
					client.getFps());
				File directory = new File(client.gameDirectory, "demo");
				new File(directory, "screenshots").mkdirs();
				Screenshot.grab(directory, shot.name() + ".png", client.getMainRenderTarget(), 1,
					message -> LOGGER.info("Saved {}", message.getString()));
			}
			case Config config -> config.action().run();
		}
	}
}
