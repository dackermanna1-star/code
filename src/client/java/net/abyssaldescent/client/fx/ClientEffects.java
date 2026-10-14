package net.abyssaldescent.client.fx;

import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.dungeon.loot.Rarity;
import net.abyssaldescent.item.GearItem;
import net.abyssaldescent.item.combat.ProjectileTraits;
import net.abyssaldescent.item.effect.WeaponEffect;
import net.abyssaldescent.item.relic.RelicKind;
import net.abyssaldescent.item.relic.Relics;
import net.abyssaldescent.registry.ModBlocks;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Purely cosmetic client-side effects: sparkles over valuable dropped loot, trails behind projectiles fired from
 * dungeon weapons, and the Vigil Candle's reveal of false walls and traps.
 */
public final class ClientEffects {
	private static final int REVEAL_RADIUS = 10;

	private ClientEffects() {
	}

	public static void tick(Minecraft minecraft) {
		ClientLevel level = minecraft.level;
		LocalPlayer player = minecraft.player;
		if (level == null || player == null || minecraft.isPaused()) {
			return;
		}
		double density = AdConfig.get().client.particleDensity;
		if (density <= 0) {
			return;
		}
		RandomSource random = level.getRandom();
		for (Entity entity : level.entitiesForRendering()) {
			if (entity.distanceToSqr(player) > 48 * 48) {
				continue;
			}
			if (entity instanceof ItemEntity item) {
				lootSparkle(level, item, random, density);
			} else if (entity instanceof Projectile projectile) {
				projectileTrail(level, projectile, random, density);
			}
		}
		if (DungeonDimension.isDungeon(level) && player.tickCount % 10 == 0 && Relics.carries(player, RelicKind.VIGIL_CANDLE)) {
			reveal(level, player, random, density);
		}
	}

	private static void lootSparkle(ClientLevel level, ItemEntity item, RandomSource random, double density) {
		Rarity rarity = Rarity.of(item.getItem());
		SimpleParticleType sparkle = rarity.sparkle();
		if (sparkle == null) {
			return;
		}
		// Rarer drops sparkle more often and rise higher, so a legendary is visible across a dark hall.
		float chance = (float) (density * switch (rarity) {
			case UNCOMMON -> 0.08;
			case RARE -> 0.18;
			case EPIC -> 0.3;
			default -> 0.45;
		});
		if (random.nextFloat() >= chance) {
			return;
		}
		double x = item.getX() + (random.nextDouble() - 0.5) * 0.4;
		double y = item.getY() + 0.25 + random.nextDouble() * 0.3;
		double z = item.getZ() + (random.nextDouble() - 0.5) * 0.4;
		double rise = 0.02 + rarity.ordinal() * 0.015;
		level.addParticle(sparkle, x, y, z, 0.0, rise, 0.0);
		if (rarity == Rarity.LEGENDARY && random.nextFloat() < 0.15F * density) {
			level.addParticle(ModParticles.LOOT_GLINT, item.getX(), item.getY() + 0.6, item.getZ(), 0.0, 0.05, 0.0);
		}
	}

	private static void projectileTrail(ClientLevel level, Projectile projectile, RandomSource random, double density) {
		GearItem gear = ProjectileTraits.source(projectile);
		if (gear == null) {
			return;
		}
		Vec3 motion = projectile.getDeltaMovement();
		if (motion.lengthSqr() < 0.01) {
			// Stuck in a wall or the floor: no trail.
			return;
		}
		ParticleOptions particle = trailParticle(gear);
		int count = Math.max(1, (int) Math.round(2 * density));
		for (int i = 0; i < count; i++) {
			double t = random.nextDouble();
			double x = projectile.xo + (projectile.getX() - projectile.xo) * t;
			double y = projectile.yo + (projectile.getY() - projectile.yo) * t + projectile.getBbHeight() / 2;
			double z = projectile.zo + (projectile.getZ() - projectile.zo) * t;
			level.addParticle(particle, x, y, z, -motion.x * 0.02, -motion.y * 0.02 + 0.005, -motion.z * 0.02);
		}
	}

	private static ParticleOptions trailParticle(GearItem gear) {
		for (WeaponEffect effect : gear.spec().effects()) {
			ParticleOptions particle = switch (effect.id()) {
				case "soul_pierce", "soul_flare" -> ModParticles.SOUL_EMBER;
				case "chain_lightning" -> ModParticles.ARC_SPARK;
				case "bone_shrapnel" -> ModParticles.BONE_SHARD;
				case "bleed" -> ModParticles.BLOOD_MOTE;
				default -> null;
			};
			if (particle != null) {
				return particle;
			}
		}
		SimpleParticleType sparkle = gear.spec().rarity().sparkle();
		return sparkle != null ? sparkle : ModParticles.DUST_MOTE;
	}

	private static void reveal(ClientLevel level, LocalPlayer player, RandomSource random, double density) {
		BlockPos center = player.blockPosition();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int dy = -3; dy <= 5; dy++) {
			for (int dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
				for (int dz = -REVEAL_RADIUS; dz <= REVEAL_RADIUS; dz++) {
					pos.set(center.getX() + dx, center.getY() + dy, center.getZ() + dz);
					BlockState state = level.getBlockState(pos);
					ParticleOptions particle = revealParticle(state.getBlock());
					if (particle == null || random.nextFloat() >= 0.6F * density) {
						continue;
					}
					Direction face = exposedFace(level, pos, random);
					if (face == null) {
						continue;
					}
					double x = pos.getX() + 0.5 + face.getStepX() * 0.52 + (face.getStepX() == 0 ? random.nextDouble() - 0.5 : 0) * 0.8;
					double y = pos.getY() + 0.5 + face.getStepY() * 0.52 + (face.getStepY() == 0 ? random.nextDouble() - 0.5 : 0) * 0.8;
					double z = pos.getZ() + 0.5 + face.getStepZ() * 0.52 + (face.getStepZ() == 0 ? random.nextDouble() - 0.5 : 0) * 0.8;
					level.addParticle(particle, x, y, z, face.getStepX() * 0.01, 0.01, face.getStepZ() * 0.01);
				}
			}
		}
	}

	@Nullable
	private static ParticleOptions revealParticle(Block block) {
		if (block == ModBlocks.CRUMBLING_STONE_BRICKS) {
			return ModParticles.RUNE_GLYPH;
		}
		if (block == ModBlocks.SPIKE_TRAP || block == ModBlocks.DART_TRAP) {
			return ModParticles.CURSE_MOTE;
		}
		return null;
	}

	@Nullable
	private static Direction exposedFace(ClientLevel level, BlockPos pos, RandomSource random) {
		Direction[] all = Direction.values();
		int start = random.nextInt(all.length);
		for (int i = 0; i < all.length; i++) {
			Direction dir = all[(start + i) % all.length];
			if (level.getBlockState(pos.relative(dir)).isAir()) {
				return dir;
			}
		}
		return null;
	}
}
