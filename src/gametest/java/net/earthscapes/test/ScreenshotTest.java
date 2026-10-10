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
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.client.renderer.chunk.SectionRenderDispatcher;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.presets.WorldPreset;
import net.minecraft.world.phys.AABB;

/**
 * Renders screenshots of each Earthscapes world type: creates the world, finds characteristic
 * biomes, places a spectator camera at eye level or above, and takes pictures.
 * Configure with system properties earthscapes.shots (preset list), earthscapes.seed and
 * earthscapes.renderDistance.
 */
public class ScreenshotTest implements FabricClientGameTest {
	/**
	 * A camera placement: in a biome, at a height above ground, looking with pitch either along a
	 * fixed yaw or towards the nearest spot of another biome from the given distance.
	 */
	record Shot(String name, String biome, int lift, float pitch, String towards, int standoff, boolean peak, int renderDistance) {
		Shot(String name, String biome, int lift, float pitch, String towards, int standoff) {
			this(name, biome, lift, pitch, towards, standoff, false, 0);
		}

		Shot(String name, String biome, int lift, float pitch, String towards) {
			this(name, biome, lift, pitch, towards, 64);
		}
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
			client.options.menuBackgroundBlurriness().set(0);
		});
		for (String preset : presets) {
			// the steppe's massifs stand far off; everything else looks fine at the default distance
			int distance = preset.trim().equals("mongolian_steppe") ? Math.max(renderDistance, 16) : renderDistance;
			context.runOnClient(client -> client.options.renderDistance().set(distance));
			this.shootWorld(context, preset.trim(), seed, distance);
		}
	}

	private List<Shot> shots(String preset) {
		List<Shot> list = new ArrayList<>();
		switch (preset) {
			case "african_savanna" -> {
				list.add(new Shot("plains", "serengeti_plains", 2, -4, null));
				list.add(new Shot("plains_high", "serengeti_plains", 14, 8, null));
				list.add(new Shot("highlands_view", "serengeti_plains", 4, -8, "rift_highlands", 260, true, 18));
				list.add(new Shot("kopjes", "kopje_plains", 3, -2, null));
				list.add(new Shot("red_earth", "tsavo_red_earth", 2, 0, null));
				list.add(new Shot("baobab", "baobab_savanna", 3, -6, null));
				list.add(new Shot("river", "fever_tree_riverine", 10, 15, "savanna_river", 36));
			}
			case "sahara_desert" -> {
				list.add(new Shot("erg", "great_erg", 2, -4, null));
				list.add(new Shot("erg_high", "great_erg", 30, 12, null));
				list.add(new Shot("sand_sea", "sahara_sand_sea", 2, -2, null));
				list.add(new Shot("oasis", "sahara_oasis", 12, 25, "sahara_oasis"));
				list.add(new Shot("hamada", "hamada_plateau", 3, 0, null));
				list.add(new Shot("hoggar", "reg_plain", 4, -10, "hoggar_mountains", 220, true, 18));
				list.add(new Shot("tassili", "tassili_stone_forest", 3, -4, null));
			}
			case "amazon_rainforest" -> {
				list.add(new Shot("forest_floor", "amazon_rainforest", 2, -6, null));
				list.add(new Shot("canopy", "emergent_rainforest", 45, 6, null));
				list.add(new Shot("river", "amazon_river", 6, 4, null));
				list.add(new Shot("varzea", "varzea_flooded_forest", 2, -4, null));
				list.add(new Shot("igapo", "igapo_flooded_forest", 2, -2, null));
				list.add(new Shot("palm_swamp", "buriti_palm_swamp", 12, 14, null));
				list.add(new Shot("hills", "rainforest_hills", 30, 10, null));
			}
			case "mongolian_steppe" -> {
				list.add(new Shot("steppe_mountain_view", "feather_grass_steppe", 6, -14, "altai_mountains", 300, true, 22));
				list.add(new Shot("steppe", "feather_grass_steppe", 2, -3, null));
				list.add(new Shot("steppe_high", "feather_grass_steppe", 20, 10, null));
				list.add(new Shot("forest_steppe", "larch_forest_steppe", 3, -4, null));
				list.add(new Shot("valley", "steppe_river_valley", 8, 8, "steppe_river", 40));
				list.add(new Shot("tors", "granite_tors", 3, -4, null));
				list.add(new Shot("meadow", "alpine_meadow", 4, -16, "altai_mountains", 200, true, 18));
				list.add(new Shot("peaks", "altai_mountains", 20, 0, null));
			}
			default -> {
			}
		}
		return list;
	}

	private void shootWorld(ClientGameTestContext context, String preset, String seed, int defaultDistance) {
		// The world has to load within 1200 client ticks, and the test runs one tick per frame:
		// throttle frames while the spawn area generates so that worldgen gets the CPU and time.
		context.runOnClient(client -> client.options.framerateLimit().set(10));
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
			context.runOnClient(client -> client.options.framerateLimit().set(260));
			// The server ticks in lockstep with the (slow) client frames, so it always believes it is
			// behind schedule and then skips its main-thread chunk tasks; sprinting runs them anyway.
			world.getServer().runCommand("tick sprint 30d");
			world.getServer().runCommand("gamemode spectator @a");
			world.getServer().runCommand("time set " + System.getProperty("earthscapes.time", "1500"));
			world.getServer().runCommand("weather clear");
			waitForWorld(context, 20 * 600);
			if (Boolean.getBoolean("earthscapes.zoo")) {
				this.shootZoo(context, world, preset);
			} else {
				context.takeScreenshot(preset + "_00_spawn");
			}
			int index = 1;
			for (Shot shot : Boolean.getBoolean("earthscapes.zoo") ? List.<Shot>of() : this.shots(preset)) {
				String command = world.getServer().computeOnServer(server -> this.place(server.overworld(), shot));
				if (command == null) {
					Earthscapes.LOGGER.warn("No location found for shot {} of {}", shot.name(), preset);
					continue;
				}
				Earthscapes.LOGGER.info("Shot {}: {}", shot.name(), command);
				int distance = shot.renderDistance() > 0 ? shot.renderDistance() : defaultDistance;
				context.runOnClient(client -> {
					client.options.renderDistance().set(distance);
					// the server only sends chunks out to the view distance the client has told it about
					client.options.broadcastOptions();
				});
				world.getServer().runCommand(command);
				context.waitTicks(5);
				waitForWorld(context, 20 * 600);
				context.waitTicks(40);
				context.takeScreenshot(String.format(Locale.ROOT, "%s_%02d_%s", preset, index++, shot.name()));
			}
			// leave little work queued for the shutdown, which otherwise can overflow the stack
			world.getServer().runCommand("tick sprint stop");
			context.runOnClient(client -> {
				client.options.renderDistance().set(6);
				client.options.broadcastOptions();
			});
			context.waitTicks(100);
		}
	}

	/** Animals photographed in zoo mode, with optional extra NBT (variants, the young). */
	private static List<String[]> zoo(String preset) {
		return switch (preset) {
			case "african_savanna" -> List.of(new String[] {"elephant", ""}, new String[] {"elephant", "Age:-24000"}, new String[] {"giraffe", ""},
				new String[] {"zebra", ""}, new String[] {"wildebeest", ""}, new String[] {"thomsons_gazelle", ""}, new String[] {"hippo", ""},
				new String[] {"lion", "Variant:0"}, new String[] {"lion", "Variant:1"}, new String[] {"ostrich", "Variant:0"},
				new String[] {"ostrich", "Variant:1"}, new String[] {"nile_crocodile", ""});
			case "sahara_desert" -> List.of(new String[] {"fennec", ""}, new String[] {"addax", ""}, new String[] {"dorcas_gazelle", ""});
			case "amazon_rainforest" -> List.of(new String[] {"jaguar", ""}, new String[] {"capybara", ""}, new String[] {"tapir", ""},
				new String[] {"tapir", "Age:-24000"}, new String[] {"toucan", ""}, new String[] {"river_dolphin", ""}, new String[] {"black_caiman", ""});
			case "mongolian_steppe" -> List.of(new String[] {"yak", ""}, new String[] {"saiga", ""}, new String[] {"mongolian_gazelle", ""},
				new String[] {"snow_leopard", ""}, new String[] {"marmot", ""}, new String[] {"przewalski_horse", ""}, new String[] {"bactrian_camel", ""});
			default -> List.of();
		};
	}

	/** Photographs each animal of a world in a cleared patch of ground near the spawn. */
	private void shootZoo(ClientGameTestContext context, TestSingleplayerContext world, String preset) {
		world.getServer().runCommand("time set 6000");
		int[] origin = world.getServer().computeOnServer(server -> {
			ServerLevel level = server.overworld();
			BlockPos spawn = BlockPos.containing(level.getRespawnData().pos().getCenter());
			int y = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, spawn.getX(), spawn.getZ());
			return new int[] {spawn.getX(), y, spawn.getZ()};
		});
		int x = origin[0], y = origin[1], z = origin[2];
		int index = 0;
		for (String[] animal : zoo(preset)) {
			String id = animal[0];
			boolean water = id.equals("river_dolphin");
			world.getServer().runCommand(String.format(Locale.ROOT, "fill %d %d %d %d %d %d air", x - 14, y, z - 14, x + 14, y + 14, z + 14));
			world.getServer().runCommand(String.format(Locale.ROOT, "fill %d %d %d %d %d %d %s", x - 14, y - 1, z - 14, x + 14, y - 1, z + 14,
				preset.equals("sahara_desert") ? "earthscapes:sahara_sand" : "grass_block"));
			if (water) {
				world.getServer().runCommand(String.format(Locale.ROOT, "fill %d %d %d %d %d %d water", x - 8, y - 4, z - 8, x + 8, y - 1, z + 8));
			}
			// move the last subject away rather than killing it: no death puffs or dropped loot in the picture
			world.getServer().runCommand("tp @e[type=!player] ~ -250 ~");
			context.waitTicks(3);
			String nbt = "NoAI:1b,Silent:1b,PersistenceRequired:1b,Rotation:[90f,0f]" + (animal[1].isEmpty() ? "" : "," + animal[1]);
			int ay = water ? y - 2 : y;
			world.getServer().runCommand(String.format(Locale.ROOT, "summon earthscapes:%s %d %d %d {%s}", id, x, ay, z, nbt));
			double[] size = world.getServer().computeOnServer(server -> {
				var list = server.overworld().getEntities((Entity) null, new AABB(x - 3, ay - 3, z - 3, x + 3, ay + 6, z + 3), e -> !(e instanceof Player));
				return list.isEmpty() ? new double[] {1, 1} : new double[] {list.get(0).getBbWidth(), list.get(0).getBbHeight()};
			});
			// the animal faces west (-x): look at it from the front left
			double extent = Math.max(size[0] * 1.5, size[1]);
			double d = Math.max(2.6, extent * 1.35 + 1.2);
			double cx = x + 0.5 - d * 0.7;
			double cz = z + 0.5 + d * 0.71;
			double cy = ay + Math.max(0.6, size[1] * 0.55);
			double tx = x + 0.5 - cx;
			double tz = z + 0.5 - cz;
			float yaw = (float) Math.toDegrees(Math.atan2(-tx, tz));
			float pitch = (float) Math.toDegrees(Math.atan2(cy - (ay + size[1] * 0.45), Math.sqrt(tx * tx + tz * tz)));
			world.getServer().runCommand(String.format(Locale.ROOT, "tp @a %.2f %.2f %.2f %.1f %.1f", cx, cy, cz, yaw, pitch));
			context.waitTicks(5);
			waitForWorld(context, 20 * 120);
			context.waitTicks(30);
			context.takeScreenshot(String.format(Locale.ROOT, "%s_zoo_%02d_%s%s", preset, index++, id, animal[1].isEmpty() ? "" : "_" + animal[1].replace(':', '_')));
		}
	}

	/**
	 * Waits until the chunks within render distance are loaded and compiled, or the time limit passes.
	 * The stock waitForChunksRender wants the full square of chunks, but the server only sends a
	 * circle, so it never finishes at larger render distances; and with software rendering the
	 * compile queue rarely drains completely while random ticks keep changing blocks.
	 */
	private static void waitForWorld(ClientGameTestContext context, int maxTicks) {
		int loadedAt = -1;
		for (int tick = 0; tick < maxTicks; tick++) {
			int[] state = context.computeOnClient(ScreenshotTest::worldState);
			if (state[0] == 0) {
				if (loadedAt < 0) {
					loadedAt = tick;
				}
				if (state[1] + state[2] <= 2 || tick - loadedAt > 1200) {
					Earthscapes.LOGGER.info("World ready after {} ticks ({} sections still queued)", tick, state[1] + state[2]);
					return;
				}
			}
			if (tick % 400 == 0) {
				Earthscapes.LOGGER.info("Waiting for world: {} chunks missing, {} sections queued, {} to upload", state[0], state[1], state[2]);
			}
			context.waitTick();
		}
		Earthscapes.LOGGER.warn("Gave up waiting for chunks after {} ticks", maxTicks);
	}

	/** Missing chunks within render distance, sections waiting to compile, and sections waiting to upload. */
	private static int[] worldState(Minecraft client) {
		if (client.level == null || client.player == null) {
			return new int[] {Integer.MAX_VALUE, 0, 0};
		}
		int radius = client.options.getEffectiveRenderDistance() - 1;
		ChunkPos center = client.player.chunkPosition();
		int missing = 0;
		for (int dx = -radius; dx <= radius; dx++) {
			for (int dz = -radius; dz <= radius; dz++) {
				if (dx * dx + dz * dz <= radius * radius
					&& client.level.getChunkSource().getChunk(center.x + dx, center.z + dz, ChunkStatus.FULL, false) == null) {
					missing++;
				}
			}
		}
		SectionRenderDispatcher dispatcher = client.levelRenderer.getSectionRenderDispatcher();
		return new int[] {missing, dispatcher == null ? 0 : dispatcher.getCompileQueueSize(), dispatcher == null ? 0 : dispatcher.getToUpload()};
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
		BlockPos lookTarget = null;
		if (shot.towards() != null) {
			Holder<Biome> look = this.biome(level, shot.towards());
			Pair<BlockPos, Holder<Biome>> lookAt = level.findClosestBiome3d(h -> h.is(look.unwrapKey().orElseThrow()), at, 3200, 16, 64);
			if (lookAt != null) {
				BlockPos m = shot.peak() ? this.peak(level, lookAt.getFirst(), 384) : lookAt.getFirst();
				lookTarget = m;
				if (shot.towards().equals(shot.biome())) {
					// look down into the feature from its rim
					at = m.offset(-28, 0, -28);
				} else {
					// stand at the given distance on the line from the found spot, so the target fills the view
					double dx = at.getX() - m.getX();
					double dz = at.getZ() - m.getZ();
					double len = Math.max(1.0, Math.sqrt(dx * dx + dz * dz));
					at = m.offset((int) (dx / len * shot.standoff()), 0, (int) (dz / len * shot.standoff()));
				}
			}
		}
		if (shot.peak() && lookTarget != null) {
			BlockPos vantage = this.vantage(level, lookTarget, shot.standoff(), shot.lift());
			if (vantage != null) {
				at = vantage;
			}
		}
		at = this.openSpot(level, at, shot.lift(), shot.towards() != null || shot.lift() >= 8);
		float pitch = shot.pitch();
		if (lookTarget != null) {
			yaw = (float) Math.toDegrees(Math.atan2(-(lookTarget.getX() - at.getX()), lookTarget.getZ() - at.getZ()));
		}
		int y = this.ground(level, at) + shot.lift();
		if (shot.peak() && lookTarget != null) {
			// tilt up so that the summit sits in the upper part of the picture
			double elevation = Math.toDegrees(Math.atan2(lookTarget.getY() - (y + 1.6), Math.sqrt(lookTarget.distSqr(new BlockPos(at.getX(), lookTarget.getY(), at.getZ())))));
			pitch = (float) Mth.clamp(-elevation * 0.6, -28.0, 0.0);
		}
		return String.format(Locale.ROOT, "tp @a %d %d %d %.1f %.1f", at.getX(), y, at.getZ(), yaw, pitch);
	}

	/**
	 * A spot about the given distance from a summit with the least obstructed line of sight to it
	 * (preferring low ground on ties), judged from the generator's height estimate.
	 */
	private BlockPos vantage(ServerLevel level, BlockPos peak, int distance, int lift) {
		ChunkGenerator generator = level.getChunkSource().getGenerator();
		RandomState random = level.getChunkSource().randomState();
		BlockPos best = null;
		double bestScore = Double.MAX_VALUE;
		for (int a = 0; a < 32; a++) {
			double angle = a * Math.PI * 2.0 / 32.0;
			for (int d = distance - 80; d <= distance + 40; d += 40) {
				int x = peak.getX() + (int) (Math.cos(angle) * d);
				int z = peak.getZ() + (int) (Math.sin(angle) * d);
				int ground = generator.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, random);
				if (ground <= level.getSeaLevel()) {
					continue;
				}
				double eye = ground + lift + 1.6;
				// how far the terrain rises above the sight line, worst point along the way
				double obstruction = 0.0;
				for (int step = 1; step < 32; step++) {
					double t = step / 32.0;
					int sx = (int) Mth.lerp(t, x, peak.getX());
					int sz = (int) Mth.lerp(t, z, peak.getZ());
					double h = generator.getBaseHeight(sx, sz, Heightmap.Types.WORLD_SURFACE_WG, level, random);
					obstruction = Math.max(obstruction, h - (Mth.lerp(t, eye, peak.getY()) - 4.0));
				}
				double score = obstruction * 10.0 + ground * 0.2;
				if (score < bestScore) {
					bestScore = score;
					best = new BlockPos(x, ground, z);
				}
			}
		}
		Earthscapes.LOGGER.info("Vantage for summit {}: {} (score {})", peak, best, bestScore);
		return best;
	}

	/** The highest terrain within the radius, from the generator's height estimate (does not generate chunks). */
	private BlockPos peak(ServerLevel level, BlockPos around, int radius) {
		ChunkGenerator generator = level.getChunkSource().getGenerator();
		RandomState random = level.getChunkSource().randomState();
		BlockPos best = around;
		int bestHeight = Integer.MIN_VALUE;
		for (int dx = -radius; dx <= radius; dx += 16) {
			for (int dz = -radius; dz <= radius; dz += 16) {
				int x = around.getX() + dx;
				int z = around.getZ() + dz;
				int h = generator.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, random);
				if (h > bestHeight) {
					bestHeight = h;
					best = new BlockPos(x, h, z);
				}
			}
		}
		return best;
	}

	/** Highest ground (ignoring trees and plants) around a spot, so that the camera does not drop into holes and cave mouths. */
	private int ground(ServerLevel level, BlockPos at) {
		int ground = level.getSeaLevel();
		for (int dx = -3; dx <= 3; dx += 3) {
			for (int dz = -3; dz <= 3; dz += 3) {
				int x = at.getX() + dx;
				int z = at.getZ() + dz;
				level.getChunk(x >> 4, z >> 4);
				BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos(x, level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z), z);
				while (p.getY() > level.getMinY()) {
					BlockState below = level.getBlockState(p.below());
					// stop on water or on solid ground that is not part of a tree
					if (!below.getFluidState().isEmpty()
						|| !below.isAir() && !below.is(BlockTags.LOGS) && !below.is(BlockTags.LEAVES) && !below.canBeReplaced()) {
						break;
					}
					p.move(0, -1, 0);
				}
				ground = Math.max(ground, p.getY());
			}
		}
		return ground;
	}

	/** The nearest column (spiralling out up to 24 blocks) where the camera would not sit inside leaves or rock, optionally under open sky. */
	private BlockPos openSpot(ServerLevel level, BlockPos at, int lift, boolean needSky) {
		for (int r = 0; r <= 24; r += 2) {
			for (int dx = -r; dx <= r; dx += 2) {
				for (int dz = -r; dz <= r; dz += 2) {
					if (Math.max(Math.abs(dx), Math.abs(dz)) != r) {
						continue;
					}
					BlockPos p = at.offset(dx, 0, dz);
					level.getChunk(p.getX() >> 4, p.getZ() >> 4);
					int y = this.ground(level, p) + lift;
					boolean open = true;
					for (int k = 0; k <= 2 && open; k++) {
						BlockPos q = new BlockPos(p.getX(), y + k, p.getZ());
						open = level.getBlockState(q).getCollisionShape(level, q).isEmpty() && !level.getBlockState(q).is(BlockTags.LEAVES);
					}
					// views need open sky, not a canopy overhead
					for (int sx = -2; sx <= 2 && open && needSky; sx += 2) {
						for (int sz = -2; sz <= 2 && open; sz += 2) {
							open = level.getHeight(Heightmap.Types.MOTION_BLOCKING, p.getX() + sx, p.getZ() + sz) <= y + 1;
						}
					}
					if (open) {
						return p;
					}
				}
			}
		}
		return at;
	}
}
