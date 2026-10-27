package com.realweather.world;

import com.realweather.config.RealWeatherConfig;
import com.realweather.network.LightningPayload;
import com.realweather.network.RealWeatherNetworking;
import com.realweather.weather.CloudNoise;
import com.realweather.weather.WeatherState;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LightningBolt;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

/**
 * Directs the storm's electrical activity on the server so it is identical for everyone:
 * <ul>
 * <li>visual in-cloud flashes and distant cloud-to-ground bolts (sent to modded clients only),</li>
 * <li>a few extra real strikes near players during the most intense part of a thunderstorm.</li>
 * </ul>
 * Vanilla's own random strikes keep happening unchanged.
 */
public final class LightningDirector {
	private static final double BROADCAST_RANGE = 1200.0;
	private static final float CLOUD_FLASHES_PER_MINUTE = 10.0F;
	private static final float DISTANT_BOLTS_PER_MINUTE = 5.0F;
	private static final float EXTRA_STRIKES_PER_MINUTE = 1.6F;

	private final RandomSource random = RandomSource.create();

	public void tick(ServerLevel level, WeatherState state) {
		if (state.storm <= 0.05F || !level.isThundering()) {
			return;
		}
		RealWeatherConfig config = RealWeatherConfig.get();
		List<ServerPlayer> players = level.players();
		if (players.isEmpty()) {
			return;
		}
		float activity = (float) Math.pow(state.storm, 1.5) * config.lightningFrequency;
		// Spread the budget over the players so crowded areas do not get proportionally more lightning.
		float perPlayer = activity / Math.max(1.0F, (float) Math.sqrt(players.size()));
		for (ServerPlayer player : players) {
			if (config.distantLightning) {
				if (this.chance(CLOUD_FLASHES_PER_MINUTE * perPlayer)) {
					this.spawnVisual(level, state, player, LightningPayload.KIND_CLOUD_FLASH);
				}
				if (this.chance(DISTANT_BOLTS_PER_MINUTE * perPlayer)) {
					this.spawnVisual(level, state, player, LightningPayload.KIND_DISTANT_BOLT);
				}
			}
			if (config.extraLightning && state.storm > 0.6F && this.chance(EXTRA_STRIKES_PER_MINUTE * (state.storm - 0.6F) / 0.4F * perPlayer)) {
				this.strikeNear(level, player);
			}
		}
	}

	private boolean chance(float perMinute) {
		return this.random.nextFloat() < perMinute / 1200.0F;
	}

	private void spawnVisual(ServerLevel level, WeatherState state, ServerPlayer player, int kind) {
		boolean flash = kind == LightningPayload.KIND_CLOUD_FLASH;
		double x = 0.0;
		double z = 0.0;
		boolean found = false;
		// Prefer the thick parts of the storm for realism.
		for (int attempt = 0; attempt < 6 && !found; attempt++) {
			double angle = this.random.nextDouble() * Math.PI * 2.0;
			double minDist = flash ? 40.0 : 170.0;
			double maxDist = flash ? 900.0 : 760.0;
			double distance = minDist + (maxDist - minDist) * Math.sqrt(this.random.nextDouble());
			x = player.getX() + Math.cos(angle) * distance;
			z = player.getZ() + Math.sin(angle) * distance;
			float cover = CloudNoise.coverageAt(x - state.cloudOffsetX, z - state.cloudOffsetZ, Math.max(state.cloudCover, 0.75F));
			found = cover > 0.45F || attempt == 5;
		}
		double y;
		if (flash) {
			y = 0.0;
		} else {
			BlockPos column = BlockPos.containing(x, 0.0, z);
			y = level.isLoaded(column) ? level.getHeight(Heightmap.Types.MOTION_BLOCKING, column.getX(), column.getZ()) : level.getSeaLevel();
		}
		float intensity = 0.45F + 0.55F * this.random.nextFloat();
		LightningPayload payload = new LightningPayload(x, y, z, this.random.nextLong(), kind, intensity);
		for (ServerPlayer receiver : level.players()) {
			if (receiver.distanceToSqr(x, receiver.getY(), z) < BROADCAST_RANGE * BROADCAST_RANGE) {
				RealWeatherNetworking.sendIfSupported(receiver, payload);
			}
		}
	}

	private void strikeNear(ServerLevel level, ServerPlayer player) {
		double angle = this.random.nextDouble() * Math.PI * 2.0;
		double distance = Mth.lerp(this.random.nextDouble(), 24.0, 110.0);
		BlockPos around = BlockPos.containing(player.getX() + Math.cos(angle) * distance, player.getY(), player.getZ() + Math.sin(angle) * distance);
		if (!level.isLoaded(around)) {
			return;
		}
		BlockPos target = level.findLightningTargetAround(around);
		if (!level.isRainingAt(target)) {
			return;
		}
		LightningBolt bolt = EntityType.LIGHTNING_BOLT.create(level, EntitySpawnReason.EVENT);
		if (bolt != null) {
			bolt.snapTo(Vec3.atBottomCenterOf(target));
			level.addFreshEntity(bolt);
		}
	}
}
