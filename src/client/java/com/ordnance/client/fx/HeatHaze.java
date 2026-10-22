package com.ordnance.client.fx;

import com.ordnance.Ordnance;
import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import net.minecraft.block.AbstractFireBlock;
import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.fluid.Fluids;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * Heat distortion intensity around the camera: nearby fire and lava blocks, recent fireballs and active
 * flamethrower streams. The intensity selects one of four post-processing passes ({@code heat_haze_1..4}); post
 * effect uniforms are fixed at load time, so strength is quantised into levels.
 */
public final class HeatHaze {
	private static final int SCAN_RADIUS = 5;
	private static final Identifier[] EFFECTS = {
		Ordnance.id("heat_haze_1"), Ordnance.id("heat_haze_2"), Ordnance.id("heat_haze_3"), Ordnance.id("heat_haze_4")
	};
	private static final List<Source> SOURCES = new ArrayList<>();
	private static float intensity;
	private static float fireNearby;
	private static int scanCooldown;
	private static long now;

	private HeatHaze() {
	}

	public static void addSource(Vec3d pos, float strength, float radius, int ticks) {
		SOURCES.add(new Source(pos, strength, radius, now, ticks));
	}

	public static void tick(MinecraftClient client) {
		now++;
		ClientWorld world = client.world;
		if (world == null || client.gameRenderer == null) {
			intensity = 0.0F;
			return;
		}

		Vec3d camera = client.gameRenderer.getCamera().getCameraPos();
		if (--scanCooldown <= 0) {
			scanCooldown = 10;
			fireNearby = scanFires(world, BlockPos.ofFloored(camera));
		}

		float target = fireNearby;
		for (Iterator<Source> it = SOURCES.iterator(); it.hasNext(); ) {
			Source source = it.next();
			long age = now - source.born;
			if (age > source.life) {
				it.remove();
				continue;
			}

			double d = camera.distanceTo(source.pos);
			if (d < source.radius) {
				float remaining = 1.0F - age / (float)source.life;
				target = Math.max(target, source.strength * (float)(1.0 - d / source.radius) * remaining);
			}
		}

		if (client.player != null && client.player.isSubmergedInWater()) {
			target = 0.0F;
		}

		intensity += (target - intensity) * 0.12F;
	}

	public static void clear() {
		SOURCES.clear();
		intensity = 0.0F;
	}

	private static float scanFires(ClientWorld world, BlockPos center) {
		float heat = 0.0F;
		BlockPos.Mutable mutable = new BlockPos.Mutable();
		for (int dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
			for (int dy = -SCAN_RADIUS + 2; dy <= SCAN_RADIUS; dy++) {
				for (int dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz++) {
					mutable.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
					BlockState state = world.getBlockState(mutable);
					boolean hot = state.getBlock() instanceof AbstractFireBlock || state.getFluidState().isOf(Fluids.LAVA) || state.getFluidState().isOf(Fluids.FLOWING_LAVA);
					if (hot) {
						float d = MathHelper.sqrt(dx * dx + dy * dy + dz * dz);
						heat += 1.0F / (1.0F + d * 0.5F);
					}
				}
			}
		}

		return MathHelper.clamp(heat / 6.0F, 0.0F, 0.85F);
	}

	/** Post effect to apply this frame, or null for none. */
	public static Identifier effect() {
		OrdnanceConfig.Visuals visuals = ConfigManager.get().visuals;
		if (!visuals.heatDistortion || visuals.heatDistortionStrength <= 0.0F) {
			return null;
		}

		float value = intensity * visuals.heatDistortionStrength;
		int level = MathHelper.clamp(MathHelper.ceil(value * 4.0F - 0.3F), 0, 4);
		return level == 0 ? null : EFFECTS[level - 1];
	}

	private record Source(Vec3d pos, float strength, float radius, long born, int life) {
	}
}
