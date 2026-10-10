package net.earthscapes.test;

import com.mojang.datafixers.util.Pair;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.earthscapes.Earthscapes;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.InactivityFpsLimit;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.presets.WorldPreset;

/**
 * Renders screenshots of each Earthscapes world type: creates the world, finds characteristic
 * biomes, places a spectator camera at eye level or above, and takes pictures.
 * Configure with system properties earthscapes.shots (preset list), earthscapes.seed and
 * earthscapes.renderDistance.
 */
public class ScreenshotTest implements FabricClientGameTest {
	/** A camera placement: in a biome, at a height above ground, looking along yaw with pitch. */
	record Shot(String name, String biome, int lift, float pitch, String towards) {
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		String seed = System.getProperty("earthscapes.seed", "12345");
		int renderDistance = Integer.getInteger("earthscapes.renderDistance", 12);
		String[] presets = System.getProperty("earthscapes.shots", "african_savanna,sahara_desert,amazon_rainforest,mongolian_steppe").split(",");
		context.runOnClient(client -> {
			client.options.renderDistance().set(renderDistance);
			client.options.cutoutLeaves().set(true);
			client.options.cloudStatus().set(CloudStatus.FANCY);
			client.options.fov().set(75);
			client.options.hideGui = true;
			client.options.framerateLimit().set(260);
			client.options.enableVsync().set(false);
			client.options.inactivityFpsLimit().set(InactivityFpsLimit.MINIMIZED);
		});
		for (String preset : presets) {
			this.shootWorld(context, preset.trim(), seed);
		}
	}

	private List<Shot> shots(String preset) {
		List<Shot> list = new ArrayList<>();
		switch (preset) {
			case "african_savanna" -> {
				list.add(new Shot("plains", "serengeti_plains", 2, -4, null));
				list.add(new Shot("plains_high", "serengeti_plains", 14, 8, null));
				list.add(new Shot("highlands_view", "serengeti_plains", 2, -6, "rift_highlands"));
				list.add(new Shot("kopjes", "kopje_plains", 3, -2, null));
				list.add(new Shot("red_earth", "tsavo_red_earth", 2, 0, null));
				list.add(new Shot("baobab", "baobab_savanna", 3, -6, null));
				list.add(new Shot("river", "fever_tree_riverine", 10, 15, "savanna_river"));
			}
			case "sahara_desert" -> {
				list.add(new Shot("erg", "great_erg", 2, -4, null));
				list.add(new Shot("erg_high", "great_erg", 30, 12, null));
				list.add(new Shot("sand_sea", "sahara_sand_sea", 2, -2, null));
				list.add(new Shot("oasis", "sahara_oasis", 12, 25, "sahara_oasis"));
				list.add(new Shot("hamada", "hamada_plateau", 3, 0, null));
				list.add(new Shot("hoggar", "hoggar_mountains", 4, -8, null));
				list.add(new Shot("tassili", "tassili_stone_forest", 3, -4, null));
			}
			case "amazon_rainforest" -> {
				list.add(new Shot("forest_floor", "amazon_rainforest", 2, -6, null));
				list.add(new Shot("canopy", "emergent_rainforest", 45, 6, null));
				list.add(new Shot("river", "amazon_river", 6, 4, null));
				list.add(new Shot("varzea", "varzea_flooded_forest", 2, -4, null));
				list.add(new Shot("igapo", "igapo_flooded_forest", 2, -2, null));
				list.add(new Shot("palm_swamp", "buriti_palm_swamp", 3, -4, null));
				list.add(new Shot("hills", "rainforest_hills", 30, 10, null));
			}
			case "mongolian_steppe" -> {
				list.add(new Shot("steppe_mountain_view", "feather_grass_steppe", 2, -6, "altai_mountains"));
				list.add(new Shot("steppe", "feather_grass_steppe", 2, -3, null));
				list.add(new Shot("steppe_high", "feather_grass_steppe", 20, 10, null));
				list.add(new Shot("forest_steppe", "larch_forest_steppe", 3, -4, null));
				list.add(new Shot("valley", "steppe_river_valley", 8, 8, "steppe_river"));
				list.add(new Shot("tors", "granite_tors", 3, -4, null));
				list.add(new Shot("meadow", "alpine_meadow", 3, -8, "altai_mountains"));
				list.add(new Shot("peaks", "altai_mountains", 20, 0, null));
			}
			default -> {
			}
		}
		return list;
	}

	private void shootWorld(ClientGameTestContext context, String preset, String seed) {
		try (TestSingleplayerContext world = context.worldBuilder()
			.setUseConsistentSettings(false)
			.adjustSettings(settings -> {
				Holder<WorldPreset> holder = settings.getSettings().worldgenLoadContext().lookupOrThrow(Registries.WORLD_PRESET)
					.getOrThrow(ResourceKey.create(Registries.WORLD_PRESET, Earthscapes.id(preset)));
				settings.setWorldType(new WorldCreationUiState.WorldTypeEntry(holder));
				settings.setSeed(seed);
				settings.setGameMode(WorldCreationUiState.SelectedGameMode.CREATIVE);
				settings.getGameRules().set(GameRules.ADVANCE_TIME, false, null);
				settings.getGameRules().set(GameRules.ADVANCE_WEATHER, false, null);
				settings.getGameRules().set(GameRules.SPAWN_MOBS, false, null);
			})
			.create()) {
			world.getServer().runCommand("gamemode spectator @a");
			world.getServer().runCommand("time set " + System.getProperty("earthscapes.time", "1500"));
			world.getServer().runCommand("weather clear");
			world.getClientWorld().waitForChunksRender(true, 20 * 600);
			context.takeScreenshot(preset + "_00_spawn");
			int index = 1;
			for (Shot shot : this.shots(preset)) {
				String command = world.getServer().computeOnServer(server -> this.place(server.overworld(), shot));
				if (command == null) {
					Earthscapes.LOGGER.warn("No location found for shot {} of {}", shot.name(), preset);
					continue;
				}
				Earthscapes.LOGGER.info("Shot {}: {}", shot.name(), command);
				world.getServer().runCommand(command);
				context.waitTicks(5);
				world.getClientWorld().waitForChunksRender(true, 20 * 600);
				context.waitTicks(40);
				context.takeScreenshot(String.format(Locale.ROOT, "%s_%02d_%s", preset, index++, shot.name()));
			}
		}
	}

	private Holder<Biome> biome(ServerLevel level, String name) {
		return level.registryAccess().lookupOrThrow(Registries.BIOME).getOrThrow(ResourceKey.create(Registries.BIOME, Earthscapes.id(name)));
	}

	/** Builds the teleport command for a shot, or null if no suitable place was found. */
	private String place(ServerLevel level, Shot shot) {
		BlockPos origin = BlockPos.containing(level.getRespawnData().pos().getCenter());
		Holder<Biome> target = this.biome(level, shot.biome());
		Pair<BlockPos, Holder<Biome>> found = level.findClosestBiome3d(h -> h.is(target.unwrapKey().orElseThrow()), origin, 6400, 32, 64);
		if (found == null) {
			return null;
		}
		BlockPos at = found.getFirst();
		float yaw = 45.0F;
		if (shot.towards() != null) {
			Holder<Biome> look = this.biome(level, shot.towards());
			Pair<BlockPos, Holder<Biome>> lookAt = level.findClosestBiome3d(h -> h.is(look.unwrapKey().orElseThrow()), at, 3200, 16, 64);
			if (lookAt != null) {
				BlockPos m = lookAt.getFirst();
				if (shot.towards().equals(shot.biome())) {
					// look down into the feature from its rim
					at = m.offset(-28, 0, -28);
				} else if (m.distSqr(at) < 120 * 120 || m.distSqr(at) > 600 * 600) {
					// stand some way off so that the target fills the view
					double dx = at.getX() - m.getX();
					double dz = at.getZ() - m.getZ();
					double len = Math.max(1.0, Math.sqrt(dx * dx + dz * dz));
					at = m.offset((int) (dx / len * 260), 0, (int) (dz / len * 260));
				}
				yaw = (float) Math.toDegrees(Math.atan2(-(m.getX() - at.getX()), m.getZ() - at.getZ()));
			}
		}
		level.getChunk(at.getX() >> 4, at.getZ() >> 4);
		int ground = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, at.getX(), at.getZ());
		int y = Math.max(ground, level.getSeaLevel()) + shot.lift();
		return String.format(Locale.ROOT, "tp @a %d %d %d %.1f %.1f", at.getX(), y, at.getZ(), yaw, shot.pitch());
	}
}
