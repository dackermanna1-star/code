package com.realweather.gametest;

import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.weather.WeatherSimulator;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;

/**
 * Drives a real client through every weather type and captures screenshots (saved under
 * {@code build/run/clientGameTest/screenshots}). Also asserts the simulator reacts to commands.
 */
public final class RealWeatherClientGameTest implements FabricClientGameTest {
	private static final String QUALITY = System.getProperty("realweather.test.quality", "medium");
	private static final int SETTLE = Integer.getInteger("realweather.test.settle", 260);

	@Override
	public void runTest(ClientGameTestContext context) {
		context.runOnClient(client -> {
			ClientConfig.get().quality = QUALITY;
			ClientConfig.get().debugOverlay = Boolean.getBoolean("realweather.test.debug");
			client.options.cloudRange().set(32);
		});

		try (TestSingleplayerContext world = context.worldBuilder()
			.adjustSettings(creator -> creator.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE))
			.create()) {
			world.getClientWorld().waitForChunksRender();
			buildScene(world);
			world.getServer().runCommand("tp @a 0.5 -60 0.5 10 2");
			world.getServer().runCommand("time set 2500");
			context.waitTicks(40);
			world.getClientWorld().waitForChunksRender();

			shoot(context, world, "01_clear", "weather clear 100000 0.5", null);
			shoot(context, world, "02_overcast", "weather overcast 100000 0.9", null);
			shoot(context, world, "03_fog", "weather fog 100000 1.0", null);
			shoot(context, world, "04_rain", "weather rain 100000 0.6", "weather wind 7 w");
			shoot(context, world, "05_thunderstorm", "weather thunder 100000 1.0", "weather wind 14 sw");
			// Catch a lightning strike while the bolt is alive.
			world.getServer().runCommand("summon minecraft:lightning_bolt 18 -60 46");
			context.waitTicks(2);
			context.takeScreenshot("06_lightning");
			shoot(context, world, "07_snow", "weather snow 100000 0.7", "weather wind 4 n");
			context.waitTicks(400);
			context.takeScreenshot("08_snow_accumulated");
			shoot(context, world, "09_blizzard", "weather blizzard 100000 1.0", "weather wind 20 nw");
			world.getServer().runCommand("time set 13500");
			shoot(context, world, "10_night_storm", "weather thunder 100000 1.0", "weather wind 12 w");

			boolean synced = context.computeOnClient(client -> ClientWeather.get().isServerSynced());
			if (!synced) {
				throw new AssertionError("Client never received a weather sync from the integrated server");
			}
			String type = world.getServer().computeOnServer(server -> WeatherSimulator.get().state().type.id());
			if (!"thunder".equals(type)) {
				throw new AssertionError("Simulator did not follow the /weather command, current type " + type);
			}
		}
	}

	/** A small landscape on the superflat test world: a pond, trees, tall grass and flowers. */
	private static void buildScene(TestSingleplayerContext world) {
		var server = world.getServer();
		server.runCommand("fill -7 -62 9 7 -61 23 minecraft:water");
		server.runCommand("fill -9 -61 7 9 -61 7 minecraft:grass_block");
		server.runCommand("place feature minecraft:patch_waterlily 0 -61 16");
		String[] trees = {"oak -14 -60 18", "fancy_oak 13 -60 27", "birch 16 -60 12", "oak -21 -60 31", "fancy_oak -8 -60 38",
			"birch 4 -60 44", "oak 22 -60 40", "fancy_oak -26 -60 52", "oak 10 -60 58", "birch -14 -60 62", "oak 28 -60 66",
			"fancy_oak -3 -60 72", "oak -30 -60 80", "birch 18 -60 84"};
		for (String tree : trees) {
			server.runCommand("place feature minecraft:" + tree);
		}
		String[] plants = {"patch_grass 4 -60 4", "patch_grass -6 -60 5", "patch_grass 10 -60 6", "patch_grass -12 -60 10",
			"patch_grass 12 -60 18", "patch_grass -12 -60 24", "patch_grass 2 -60 28", "patch_grass 9 -60 34", "patch_grass -10 -60 44",
			"patch_tall_grass 6 -60 8", "patch_tall_grass -9 -60 16", "patch_tall_grass 14 -60 22", "flower_plain -3 -60 6",
			"flower_plain 8 -60 26", "flower_meadow -14 -60 28", "flower_meadow 3 -60 36", "patch_grass 0 -60 50", "patch_grass -18 -60 40"};
		for (String plant : plants) {
			server.runCommand("place feature minecraft:" + plant);
		}
	}

	private static void shoot(ClientGameTestContext context, TestSingleplayerContext world, String name, String weather, String wind) {
		world.getServer().runCommand(weather);
		world.getServer().runCommand(wind != null ? wind : "weather wind auto");
		context.waitTicks(SETTLE);
		context.takeScreenshot(name);
	}
}
