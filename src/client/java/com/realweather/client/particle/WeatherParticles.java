package com.realweather.client.particle;

import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.weather.Climate;
import com.realweather.weather.CloudNoise;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.particle.Particle;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ParticleStatus;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.CampfireBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Spawns all weather particles around the camera each client tick: rain splashes with thrown droplets, ripples on
 * water, falling snowflakes, rain spray, blizzard spindrift, desert dust and wind-torn leaves. Counts scale with
 * local intensity, the particle setting and the quality preset.
 */
public final class WeatherParticles {
	private static final WeatherParticles INSTANCE = new WeatherParticles();
	private static final int SPLASH_RADIUS = 14;
	private static final int SNOW_RADIUS = 13;

	private final RandomSource random = RandomSource.create();
	private final BlockPos.MutableBlockPos cursor = new BlockPos.MutableBlockPos();
	private final List<SnowflakeParticle> flakes = new ArrayList<>();
	private final List<LeafParticle> leaves = new ArrayList<>();

	public static WeatherParticles get() {
		return INSTANCE;
	}

	public void reset() {
		this.flakes.clear();
		this.leaves.clear();
	}

	public void tick(Minecraft minecraft) {
		ClientLevel level = minecraft.level;
		ClientWeather weather = ClientWeather.get();
		ClientConfig config = ClientConfig.get();
		if (level == null || !weather.hasWeather() || minecraft.isPaused()) {
			return;
		}
		ParticleStatus status = minecraft.options.particles().get();
		float statusScale = switch (status) {
			case ALL -> 1.0F;
			case DECREASED -> 0.45F;
			case MINIMAL -> 0.12F;
		};
		float scale = config.effectiveParticleScale() * statusScale;
		if (scale <= 0.0F) {
			return;
		}
		Camera camera = minecraft.gameRenderer.getMainCamera();
		if (!camera.isInitialized()) {
			return;
		}
		Vec3 cam = camera.position();
		float precipitation = weather.precipitation(1.0F);
		float[] wind = weather.windVector(1.0F, cam.y, level.getSeaLevel());
		this.updateWind(wind);

		if (precipitation > 0.01F) {
			if (config.splashes || config.ripples) {
				this.spawnSplashes(level, weather, cam, precipitation, scale, config);
			}
			if (config.snowflakes) {
				this.spawnSnow(level, weather, cam, precipitation, scale, wind);
			}
		}
		if (config.windDebris) {
			this.spawnWindDebris(level, weather, cam, wind, scale, precipitation);
		}
	}

	private void updateWind(float[] wind) {
		this.flakes.removeIf(flake -> !flake.isAlive());
		for (SnowflakeParticle flake : this.flakes) {
			flake.setWind(wind[0], wind[1]);
		}
		this.leaves.removeIf(leaf -> !leaf.isAlive());
		for (LeafParticle leaf : this.leaves) {
			leaf.setWind(wind[0], wind[1]);
		}
	}

	private float localPrecipitation(ClientLevel level, ClientWeather weather, Biome biome, int x, int z, float precipitation) {
		double nx = CloudNoise.wrap(x - weather.cloudOffsetX(1.0F));
		double nz = CloudNoise.wrap(z - weather.cloudOffsetZ(1.0F));
		return precipitation * Climate.localIntensity(biome, nx, nz, weather.cloudCover(1.0F));
	}

	private void spawnSplashes(ClientLevel level, ClientWeather weather, Vec3 cam, float precipitation, float scale, ClientConfig config) {
		int diameter = SPLASH_RADIUS * 2 + 1;
		float expected = 0.32F * diameter * diameter * precipitation * precipitation * scale;
		int attempts = Math.min(400, stochastic(expected));
		float coldSnap = weather.coldSnap(1.0F);
		int cameraY = Mth.floor(cam.y);
		for (int i = 0; i < attempts; i++) {
			int x = Mth.floor(cam.x) + this.random.nextInt(diameter) - SPLASH_RADIUS;
			int z = Mth.floor(cam.z) + this.random.nextInt(diameter) - SPLASH_RADIUS;
			int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, x, z);
			if (top <= level.getMinY() || Math.abs(top - cameraY) > 12) {
				continue;
			}
			this.cursor.set(x, top, z);
			Biome biome = level.getBiome(this.cursor).value();
			Climate.Precipitation type = Climate.precipitationFor(level, biome, this.cursor, coldSnap);
			if (type != Climate.Precipitation.RAIN && !(type == Climate.Precipitation.SLEET && this.random.nextBoolean())) {
				continue;
			}
			float local = this.localPrecipitation(level, weather, biome, x, z, precipitation);
			if (this.random.nextFloat() > local / Math.max(precipitation, 0.05F)) {
				continue;
			}
			BlockPos below = this.cursor.below();
			BlockState state = level.getBlockState(below);
			FluidState fluid = level.getFluidState(below);
			double dx = this.random.nextDouble();
			double dz = this.random.nextDouble();
			VoxelShape shape = state.getCollisionShape(level, below);
			double surface = Math.max(shape.isEmpty() ? 0.0 : shape.max(Direction.Axis.Y, dx, dz), fluid.getHeight(level, below));
			double px = x + dx;
			double py = below.getY() + surface;
			double pz = z + dz;

			if (fluid.is(FluidTags.LAVA) || state.is(Blocks.MAGMA_BLOCK) || CampfireBlock.isLitCampfire(state)) {
				if (this.random.nextInt(4) == 0) {
					level.addParticle(ParticleTypes.SMOKE, px, py, pz, 0.0, 0.0, 0.0);
				}
				continue;
			}
			if (fluid.is(FluidTags.WATER) && fluid.isSource() || fluid.is(FluidTags.WATER) && surface > 0.8) {
				if (config.ripples) {
					this.add(new RippleParticle(level, px, below.getY() + fluid.getHeight(level, below) + 0.012, pz, 0.28F + 0.3F * this.random.nextFloat() * (0.5F + local)));
					if (local > 0.55F && this.random.nextInt(3) == 0 && config.splashes) {
						this.add(new DropletParticle(level, px, py + 0.02, pz, (this.random.nextFloat() - 0.5F) * 0.03F, 0.06F + this.random.nextFloat() * 0.05F,
							(this.random.nextFloat() - 0.5F) * 0.03F));
					}
				}
				continue;
			}
			if (!config.splashes) {
				continue;
			}
			float size = 0.07F + 0.06F * this.random.nextFloat() + 0.06F * Math.min(local, 1.0F);
			float brightness = 0.85F + 0.15F * this.random.nextFloat();
			this.add(new RainSplashParticle(level, px, py + size * 0.5F, pz, size, brightness));
			if (local > 0.45F && this.random.nextFloat() < local * 0.5F) {
				int droplets = 1 + this.random.nextInt(2);
				for (int d = 0; d < droplets; d++) {
					float angle = this.random.nextFloat() * Mth.TWO_PI;
					float speed = 0.02F + this.random.nextFloat() * 0.035F;
					this.add(new DropletParticle(level, px, py + 0.02, pz, Mth.cos(angle) * speed, 0.07F + this.random.nextFloat() * 0.07F,
						Mth.sin(angle) * speed));
				}
			}
			// Heavy downpours raise a fine spray just above the ground.
			if (local > 0.7F && this.random.nextFloat() < (local - 0.7F) * 0.05F) {
				float[] wind = ClientWeather.get().windVector(1.0F, py, level.getSeaLevel());
				this.add(new MistParticle(level, px, py + 0.25, pz, 0.9F + this.random.nextFloat() * 0.8F, 0.08F + 0.06F * local, 0.85F, 0.88F, 0.92F,
					wind[0], wind[1], 30 + this.random.nextInt(25), 0.6F));
			}
		}
	}

	private void spawnSnow(ClientLevel level, ClientWeather weather, Vec3 cam, float precipitation, float scale, float[] wind) {
		Climate.Precipitation localType = weather.localType();
		float coldSnap = weather.coldSnap(1.0F);
		boolean snowZone = localType.isSnowy();
		float expected = (snowZone ? 18.0F : 7.0F) * precipitation * scale;
		int count = Math.min(80, stochastic(expected));
		int diameter = SNOW_RADIUS * 2 + 1;
		float windSpeed = Mth.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		for (int i = 0; i < count; i++) {
			double x = cam.x + this.random.nextInt(diameter) - SNOW_RADIUS + this.random.nextDouble();
			double z = cam.z + this.random.nextInt(diameter) - SNOW_RADIUS + this.random.nextDouble();
			// Upwind bias: flakes drift in from where the wind comes from.
			x -= wind[0] * 0.25;
			z -= wind[1] * 0.25;
			double y = cam.y - 3.0 + this.random.nextDouble() * 16.0;
			int bx = Mth.floor(x);
			int bz = Mth.floor(z);
			int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, bx, bz);
			if (y < top + 0.5) {
				continue;
			}
			this.cursor.set(bx, Math.max(top, Mth.floor(y)), bz);
			Biome biome = level.getBiome(this.cursor).value();
			Climate.Precipitation type = Climate.precipitationFor(level, biome, this.cursor, coldSnap);
			if (!type.isSnowy() || type == Climate.Precipitation.SLEET && this.random.nextBoolean()) {
				continue;
			}
			float local = this.localPrecipitation(level, weather, biome, bx, bz, precipitation);
			if (this.random.nextFloat() > local / Math.max(precipitation, 0.05F)) {
				continue;
			}
			SnowflakeParticle flake = new SnowflakeParticle(level, x, y, z, wind[0], wind[1], 0.8F + 0.5F * Math.min(local, 1.0F));
			this.add(flake);
			this.flakes.add(flake);
		}

		// Spindrift: snow swept off the ground in strong wind, the hallmark of a blizzard.
		if (snowZone && windSpeed > 7.0F) {
			float drift = (windSpeed - 7.0F) * 0.25F * scale * Math.min(1.0F, precipitation * 1.5F);
			int puffs = Math.min(6, stochastic(drift));
			for (int i = 0; i < puffs; i++) {
				double x = cam.x + (this.random.nextDouble() - 0.5) * 30.0;
				double z = cam.z + (this.random.nextDouble() - 0.5) * 30.0;
				int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, Mth.floor(x), Mth.floor(z));
				if (Math.abs(top - cam.y) > 10.0) {
					continue;
				}
				this.add(new MistParticle(level, x, top + 0.3 + this.random.nextDouble() * 0.8, z, 1.2F + this.random.nextFloat() * 1.5F,
					0.12F + 0.1F * this.random.nextFloat(), 0.95F, 0.97F, 1.0F, wind[0], wind[1], 25 + this.random.nextInt(25), 1.0F));
			}
		}
	}

	private void spawnWindDebris(ClientLevel level, ClientWeather weather, Vec3 cam, float[] wind, float scale, float precipitation) {
		float windSpeed = Mth.sqrt(wind[0] * wind[0] + wind[1] * wind[1]);
		if (windSpeed < 5.5F) {
			return;
		}
		// Leaves torn from nearby canopies.
		float leafRate = (windSpeed - 5.5F) * 0.12F * scale;
		int attempts = Math.min(12, stochastic(leafRate * 4.0F));
		for (int i = 0; i < attempts; i++) {
			int x = Mth.floor(cam.x) + this.random.nextInt(25) - 12;
			int z = Mth.floor(cam.z) + this.random.nextInt(25) - 12;
			int y = Mth.floor(cam.y) + this.random.nextInt(17) - 4;
			this.cursor.set(x, y, z);
			BlockState state = level.getBlockState(this.cursor);
			if (!state.is(BlockTags.LEAVES) || this.random.nextFloat() > 0.25F) {
				continue;
			}
			BlockPos below = this.cursor.below();
			if (!level.getBlockState(below).isAir()) {
				continue;
			}
			int color = Minecraft.getInstance().getBlockColors().getColor(state, level, this.cursor, 0);
			if (color == -1) {
				color = 0xFF6A9A3A;
			}
			LeafParticle leaf = new LeafParticle(level, x + this.random.nextDouble(), y - 0.05, z + this.random.nextDouble(), color, wind[0], wind[1]);
			this.add(leaf);
			this.leaves.add(leaf);
		}

		// Dust and sand blown across dry, open ground.
		if (windSpeed > 9.0F && precipitation < 0.05F) {
			int puffs = Math.min(4, stochastic((windSpeed - 9.0F) * 0.18F * scale));
			for (int i = 0; i < puffs; i++) {
				double x = cam.x + (this.random.nextDouble() - 0.5) * 34.0;
				double z = cam.z + (this.random.nextDouble() - 0.5) * 34.0;
				int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING, Mth.floor(x), Mth.floor(z));
				if (Math.abs(top - cam.y) > 10.0) {
					continue;
				}
				this.cursor.set(Mth.floor(x), top - 1, Mth.floor(z));
				BlockState ground = level.getBlockState(this.cursor);
				if (!ground.is(BlockTags.SAND) && !ground.is(Blocks.RED_SAND) && !ground.is(BlockTags.TERRACOTTA)) {
					continue;
				}
				boolean red = ground.is(Blocks.RED_SAND) || ground.is(BlockTags.TERRACOTTA);
				this.add(new MistParticle(level, x, top + 0.2 + this.random.nextDouble() * 0.9, z, 1.0F + this.random.nextFloat() * 1.4F,
					0.1F + 0.08F * this.random.nextFloat(), red ? 0.78F : 0.86F, red ? 0.55F : 0.78F, red ? 0.38F : 0.58F, wind[0], wind[1],
					30 + this.random.nextInt(30), 0.9F));
			}
		}
	}

	private void add(Particle particle) {
		Minecraft.getInstance().particleEngine.add(particle);
	}

	private int stochastic(float expected) {
		if (expected <= 0.0F) {
			return 0;
		}
		int whole = (int) expected;
		return whole + (this.random.nextFloat() < expected - whole ? 1 : 0);
	}
}
