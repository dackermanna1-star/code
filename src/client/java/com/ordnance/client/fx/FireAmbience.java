package com.ordnance.client.fx;

import com.ordnance.client.particle.OrdnanceParticle;
import com.ordnance.client.particle.ParticleSprites;
import com.ordnance.config.ConfigManager;
import com.ordnance.util.Wind;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/** Extra fire visuals: embers riding the wind, licks of flame and thick rising smoke. */
public final class FireAmbience {
	private FireAmbience() {
	}

	/** Whether the enhanced fire visuals are on; they replace vanilla's fire smoke. */
	public static boolean isActive() {
		return ConfigManager.get().visuals.fireEmbers && ParticleSprites.ready();
	}

	public static void fireTick(BlockState state, World world, BlockPos pos, Random random) {
		if (!(world instanceof ClientWorld clientWorld) || !isActive()) {
			return;
		}

		boolean soul = state.isOf(Blocks.SOUL_FIRE);
		Vec3d wind = Wind.velocity(world, 0.06);
		double x = pos.getX() + 0.2 + random.nextDouble() * 0.6;
		double y = pos.getY() + 0.3 + random.nextDouble() * 0.5;
		double z = pos.getZ() + 0.2 + random.nextDouble() * 0.6;
		OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F).life(30, 80).size(0.045F, 0.02F)
			.colors(soul ? 0xFFB0F0FF : 0xFFFFD080, soul ? 0xFF40C8FF : 0xFFFF6010)
			.velocity((random.nextDouble() - 0.5) * 0.04, 0.05 + random.nextDouble() * 0.06, (random.nextDouble() - 0.5) * 0.04)
			.buoyancy(0.003F).drag(0.96F).wind(wind, 1.0F).spin(0.2F)
			.spawn(clientWorld, x, y, z);
		if (random.nextBoolean()) {
			OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F).life(10, 18).size(0.22F, 0.42F)
				.colors(soul ? 0xFFC0F8FF : 0xFFFFE6A0, soul ? 0xFF40B0FF : 0xFFFF8A30, 0x00802010)
				.velocity(0.0, 0.04, 0.0).buoyancy(0.004F).drag(0.9F)
				.spawn(clientWorld, x, pos.getY() + 0.15, z);
		}

		if (random.nextInt(3) == 0) {
			// Fades in while it grows: small, dark, opaque puffs read as specks of soot rather than smoke.
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(60, 120).size(0.6F, 2.3F).sizeCurve(0.6F)
				.colors(0xB0221E1A, 0x904A443E, 0x20706A64).alpha(0.7F).fade(0.25F, 0.5F)
				.velocity(0.0, 0.05 + random.nextDouble() * 0.04, 0.0).buoyancy(0.002F).drag(0.96F).wind(wind, 0.7F).spin(0.01F)
				.spawn(clientWorld, x, pos.getY() + 0.9, z);
		}
	}
}
