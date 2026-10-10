package net.earthscapes.dev;

import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import net.earthscapes.Earthscapes;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.QuartPos;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ChunkResult;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.Heightmap;

/**
 * Development aid, inactive unless the {@code earthscapes.dev.map} system property is set: once the
 * server has started it generates a square of chunks around the spawn point, writes the surface
 * (heights, blocks, biomes) to a compact binary file for tools/render_map.py, and stops the server.
 */
public final class MapDumper {
	private static volatile boolean done;

	private MapDumper() {
	}

	public static void init() {
		String radius = System.getProperty("earthscapes.dev.map");
		String survey = System.getProperty("earthscapes.dev.survey");
		if (radius == null && survey == null) {
			return;
		}
		ServerLifecycleEvents.SERVER_STARTED.register(server -> {
			try {
				if (survey != null && !survey.isEmpty()) {
					ClimateSurvey.run(server, Integer.parseInt(survey), Integer.parseInt(System.getProperty("earthscapes.dev.step", "16")));
				} else {
					dump(server, Integer.parseInt(radius));
				}
			} catch (Exception e) {
				Earthscapes.LOGGER.error("Map dump failed", e);
			}
			done = true;
		});
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			if (done) {
				done = false;
				server.halt(false);
			}
		});
	}

	private static void dump(MinecraftServer server, int radius) throws IOException {
		ServerLevel level = server.overworld();
		BlockPos centre = level.getRespawnData().pos();
		String centreProp = System.getProperty("earthscapes.dev.center");
		if (centreProp != null) {
			String[] parts = centreProp.split(",");
			centre = new BlockPos(Integer.parseInt(parts[0].trim()), 0, Integer.parseInt(parts[1].trim()));
		}
		int cx0 = (centre.getX() >> 4) - radius;
		int cz0 = (centre.getZ() >> 4) - radius;
		int size = radius * 2 + 1;
		int width = size * 16;
		short[] top = new short[width * width];
		short[] ground = new short[width * width];
		int[] topBlock = new int[width * width];
		int[] groundBlock = new int[width * width];
		int[] biome = new int[width * width];
		Map<String, Integer> blocks = new LinkedHashMap<>();
		Map<String, Integer> biomes = new LinkedHashMap<>();
		long start = System.currentTimeMillis();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();

		List<int[]> order = new ArrayList<>();
		for (int i = 0; i < size; i++) {
			for (int j = 0; j < size; j++) {
				order.add(new int[] {cx0 + i, cz0 + j});
			}
		}
		int batch = 96;
		for (int b = 0; b < order.size(); b += batch) {
			List<CompletableFuture<ChunkResult<ChunkAccess>>> futures = new ArrayList<>();
			List<int[]> coords = order.subList(b, Math.min(order.size(), b + batch));
			for (int[] c : coords) {
				futures.add(level.getChunkSource().getChunkFuture(c[0], c[1], ChunkStatus.FULL, true));
			}
			server.managedBlock(() -> futures.stream().allMatch(CompletableFuture::isDone));
			for (int k = 0; k < coords.size(); k++) {
				ChunkAccess chunk = futures.get(k).join().orElse(null);
				if (chunk == null) {
					continue;
				}
				int[] c = coords.get(k);
				for (int x = 0; x < 16; x++) {
					for (int z = 0; z < 16; z++) {
						int wx = c[0] * 16 + x;
						int wz = c[1] * 16 + z;
						int idx = (wz - cz0 * 16) * width + (wx - cx0 * 16);
						int yTop = chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x, z);
						// terrain: skip trees, plants and water
						int yGround = yTop;
						int yWater = Integer.MIN_VALUE;
						while (yGround > level.getMinY()) {
							BlockState st = chunk.getBlockState(pos.set(wx, yGround, wz));
							if (!st.getFluidState().isEmpty() && yWater == Integer.MIN_VALUE) {
								yWater = yGround;
							}
							boolean skip = st.isAir() || st.is(net.minecraft.tags.BlockTags.LEAVES) || st.is(net.minecraft.tags.BlockTags.LOGS)
								|| st.canBeReplaced() || !st.getFluidState().isEmpty() || !st.isSolid()
								|| st.getBlock() instanceof net.minecraft.world.level.block.VegetationBlock;
							if (!skip) {
								break;
							}
							yGround--;
						}
						top[idx] = (short) (yWater != Integer.MIN_VALUE ? yWater : yTop);
						ground[idx] = (short) yGround;
						BlockState t = chunk.getBlockState(pos.set(wx, yWater != Integer.MIN_VALUE ? yWater : yTop, wz));
						BlockState g = chunk.getBlockState(pos.set(wx, yGround, wz));
						topBlock[idx] = blocks.computeIfAbsent(BuiltInRegistries.BLOCK.getKey(t.getBlock()).toString(), s -> blocks.size());
						groundBlock[idx] = blocks.computeIfAbsent(BuiltInRegistries.BLOCK.getKey(g.getBlock()).toString(), s -> blocks.size());
						String bio = level.getBiome(pos.set(wx, yGround + 1, wz)).unwrapKey().map(key -> key.identifier().toString()).orElse("?");
						biome[idx] = biomes.computeIfAbsent(bio, s -> biomes.size());
					}
				}
			}
			if ((b / batch) % 10 == 0) {
				Earthscapes.LOGGER.info("Map dump: {}/{} chunks", Math.min(order.size(), b + batch), order.size());
			}
		}

		// climate parameters and the preliminary surface, sampled every 4 blocks
		int q = width / 4;
		float[][] climate = new float[6][q * q];
		Climate.Sampler sampler = level.getChunkSource().randomState().sampler();
		DensityFunction prelim = level.getChunkSource().randomState().router().preliminarySurfaceLevel();
		for (int i = 0; i < q; i++) {
			for (int j = 0; j < q; j++) {
				int wx = cx0 * 16 + i * 4;
				int wz = cz0 * 16 + j * 4;
				int idx = j * q + i;
				int y = ground[(j * 4) * width + i * 4];
				Climate.TargetPoint t = sampler.sample(QuartPos.fromBlock(wx), QuartPos.fromBlock(y), QuartPos.fromBlock(wz));
				climate[0][idx] = Climate.unquantizeCoord(t.temperature());
				climate[1][idx] = Climate.unquantizeCoord(t.humidity());
				climate[2][idx] = Climate.unquantizeCoord(t.continentalness());
				climate[3][idx] = Climate.unquantizeCoord(t.erosion());
				climate[4][idx] = Climate.unquantizeCoord(t.weirdness());
				climate[5][idx] = (float) prelim.compute(new DensityFunction.SinglePointContext(wx, 0, wz));
			}
		}

		Path out = Path.of(System.getProperty("earthscapes.dev.out", "earthscapes_map.bin"));
		try (DataOutputStream data = new DataOutputStream(Files.newOutputStream(out))) {
			data.writeInt(width);
			data.writeInt(cx0 * 16);
			data.writeInt(cz0 * 16);
			for (int i = 0; i < width * width; i++) {
				data.writeShort(top[i]);
				data.writeShort(ground[i]);
				data.writeShort(topBlock[i]);
				data.writeShort(groundBlock[i]);
				data.writeShort(biome[i]);
			}
			data.writeInt(blocks.size());
			for (String s : blocks.keySet()) {
				data.writeUTF(s);
			}
			data.writeInt(biomes.size());
			for (String s : biomes.keySet()) {
				data.writeUTF(s);
			}
			data.writeInt(q);
			for (float[] channel : climate) {
				for (float v : channel) {
					data.writeFloat(v);
				}
			}
		}
		Earthscapes.LOGGER.info("Map dump of {}x{} blocks written to {} in {} s", width, width, out.toAbsolutePath(),
			(System.currentTimeMillis() - start) / 1000);
	}
}
