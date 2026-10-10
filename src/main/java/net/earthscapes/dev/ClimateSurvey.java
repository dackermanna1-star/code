package net.earthscapes.dev;

import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import net.earthscapes.Earthscapes;
import net.minecraft.core.QuartPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.RandomState;

/**
 * Development aid, inactive unless {@code earthscapes.dev.survey} is set: samples the terrain height
 * function and the surface biome on a coarse grid over a large area without generating chunks,
 * for tuning biome proportions and landform scales (rendered by tools/dev/render_survey.py).
 */
public final class ClimateSurvey {
	private ClimateSurvey() {
	}

	static void run(MinecraftServer server, int extent, int step) throws IOException {
		ServerLevel level = server.overworld();
		RandomState random = level.getChunkSource().randomState();
		Climate.Sampler sampler = random.sampler();
		DensityFunction prelim = random.router().preliminarySurfaceLevel();
		BiomeSource source = level.getChunkSource().getGenerator().getBiomeSource();
		int n = extent / step;
		int origin = -extent / 2;
		float[] height = new float[n * n];
		short[] biome = new short[n * n];
		float[][] climate = new float[5][n * n];
		Map<String, Integer> biomes = new LinkedHashMap<>();
		long start = System.currentTimeMillis();
		for (int j = 0; j < n; j++) {
			for (int i = 0; i < n; i++) {
				int x = origin + i * step;
				int z = origin + j * step;
				int idx = j * n + i;
				float h = (float) prelim.compute(new DensityFunction.SinglePointContext(x, 0, z));
				height[idx] = h;
				int y = Math.max(63, (int) h);
				Climate.TargetPoint t = sampler.sample(QuartPos.fromBlock(x), QuartPos.fromBlock(y), QuartPos.fromBlock(z));
				climate[0][idx] = Climate.unquantizeCoord(t.temperature());
				climate[1][idx] = Climate.unquantizeCoord(t.humidity());
				climate[2][idx] = Climate.unquantizeCoord(t.continentalness());
				climate[3][idx] = Climate.unquantizeCoord(t.erosion());
				climate[4][idx] = Climate.unquantizeCoord(t.weirdness());
				String b = source.getNoiseBiome(QuartPos.fromBlock(x), QuartPos.fromBlock(y), QuartPos.fromBlock(z), sampler)
					.unwrapKey().map(k -> k.identifier().toString()).orElse("?");
				biome[idx] = (short) (int) biomes.computeIfAbsent(b, s -> biomes.size());
			}
		}
		Path out = Path.of(System.getProperty("earthscapes.dev.out", "survey.bin"));
		try (DataOutputStream data = new DataOutputStream(Files.newOutputStream(out))) {
			data.writeInt(n);
			data.writeInt(step);
			data.writeInt(origin);
			for (int i = 0; i < n * n; i++) {
				data.writeFloat(height[i]);
				data.writeShort(biome[i]);
			}
			for (float[] c : climate) {
				for (float v : c) {
					data.writeFloat(v);
				}
			}
			data.writeInt(biomes.size());
			for (String s : biomes.keySet()) {
				data.writeUTF(s);
			}
		}
		Earthscapes.LOGGER.info("Survey of {}x{} samples written to {} in {} s", n, n, out.toAbsolutePath(), (System.currentTimeMillis() - start) / 1000);
	}
}
