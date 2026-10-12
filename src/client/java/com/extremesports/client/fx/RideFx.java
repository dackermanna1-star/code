package com.extremesports.client.fx;

import com.extremesports.client.ClientConfig;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.registry.ModSounds;
import com.extremesports.sport.SportType;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickCategory;
import com.extremesports.trick.TrickDef;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/** One-shot sounds and particle bursts for ride events, used for the local rider and other players alike. */
public final class RideFx {
	private RideFx() {
	}

	private static void play(SportEquipmentEntity entity, SoundEvent sound, float volume, float pitch) {
		Level level = entity.level();
		level.playLocalSound(entity.getX(), entity.getY(), entity.getZ(), sound, SoundSource.PLAYERS, volume, pitch, false);
	}

	private static float jitter(RandomSource random) {
		return 0.92F + random.nextFloat() * 0.16F;
	}

	public static void pop(SportEquipmentEntity entity) {
		RandomSource random = entity.getRandom();
		switch (entity.sport()) {
			case SKATEBOARD -> play(entity, ModSounds.POP, 0.9F, jitter(random));
			case BMX -> play(entity, ModSounds.BMX_LAND, 0.4F, 1.35F * jitter(random));
			case SCOOTER -> play(entity, ModSounds.SCOOTER_LAND, 0.35F, 1.4F * jitter(random));
			case SKATES -> play(entity, ModSounds.SKATES_STRIDE, 0.6F, 1.2F * jitter(random));
		}
		dust(entity, 4, 0.06);
	}

	public static void push(SportEquipmentEntity entity) {
		RandomSource random = entity.getRandom();
		switch (entity.sport()) {
			case SKATEBOARD -> play(entity, ModSounds.PUSH, 0.5F, jitter(random));
			case BMX -> play(entity, ModSounds.BMX_PEDAL, 0.35F, jitter(random));
			case SCOOTER -> play(entity, ModSounds.SCOOTER_KICK, 0.55F, jitter(random));
			case SKATES -> play(entity, ModSounds.SKATES_STRIDE, 0.55F, jitter(random));
		}
	}

	public static void trick(SportEquipmentEntity entity, TrickDef def) {
		RandomSource random = entity.getRandom();
		if (def.category() == TrickCategory.FLIP && !def.isBodyFlip() || entity.sport() == SportType.SKATEBOARD) {
			play(entity, ModSounds.FLIP, 0.7F, jitter(random));
		} else if (def.category() == TrickCategory.WHIP && entity.sport() != SportType.SKATES) {
			play(entity, ModSounds.BMX_SPIN, 0.7F, jitter(random));
		} else {
			play(entity, ModSounds.FLIP, 0.6F, 0.7F * jitter(random));
		}
	}

	public static void land(SportEquipmentEntity entity, float impact, LandingQuality quality) {
		RandomSource random = entity.getRandom();
		boolean hard = impact > 0.45F || quality == LandingQuality.SKETCHY;
		float volume = Mth.clamp(0.4F + impact, 0.4F, 1.0F);
		switch (entity.sport()) {
			case SKATEBOARD -> play(entity, hard ? ModSounds.LAND_HARD : ModSounds.LAND, volume, jitter(random));
			case BMX -> play(entity, ModSounds.BMX_LAND, volume, jitter(random));
			case SCOOTER -> play(entity, ModSounds.SCOOTER_LAND, volume, jitter(random));
			case SKATES -> play(entity, ModSounds.SKATES_LAND, volume, jitter(random));
		}
		dust(entity, 6 + (int) (impact * 18), 0.08 + impact * 0.1);
	}

	public static void bail(SportEquipmentEntity entity) {
		play(entity, ModSounds.BAIL, 0.9F, jitter(entity.getRandom()));
		dust(entity, 14, 0.15);
	}

	public static void brake(SportEquipmentEntity entity, boolean powerslide) {
		RandomSource random = entity.getRandom();
		if (entity.sport() == SportType.BMX || entity.sport() == SportType.SCOOTER) {
			play(entity, ModSounds.BMX_BRAKE, 0.45F, jitter(random));
		} else {
			play(entity, ModSounds.BRAKE, powerslide ? 0.8F : 0.5F, jitter(random));
		}
	}

	public static void bonk(SportEquipmentEntity entity, float impact) {
		play(entity, ModSounds.LAND_HARD, Mth.clamp(impact * 2.0F, 0.3F, 0.9F), 0.75F);
	}

	/** Dust of the ground block kicked up around the wheels. */
	public static void dust(SportEquipmentEntity entity, int count, double spread) {
		Level level = entity.level();
		BlockPos below = BlockPos.containing(entity.getX(), entity.getY() - 0.1, entity.getZ());
		BlockState state = level.getBlockState(below);
		if (state.isAir()) {
			state = level.getBlockState(below.below());
		}
		if (state.isAir()) {
			return;
		}
		ParticleOptions particle = new BlockParticleOption(ParticleTypes.BLOCK, state);
		RandomSource random = entity.getRandom();
		for (int i = 0; i < count; i++) {
			double angle = random.nextDouble() * Math.PI * 2.0;
			double speed = spread * (0.5 + random.nextDouble());
			level.addParticle(particle, entity.getX() + Math.cos(angle) * 0.3, entity.getY() + 0.05, entity.getZ() + Math.sin(angle) * 0.3,
				Math.cos(angle) * speed, 0.05 + random.nextDouble() * 0.08, Math.sin(angle) * speed);
		}
	}

	/** Per-tick effects: grind sparks, powerslide spray, rough-ground dust and cosmetic trails. */
	public static void tick(SportEquipmentEntity entity, boolean grinding, boolean powerslide, boolean airborne, float speed) {
		Level level = entity.level();
		RandomSource random = entity.getRandom();
		Vec3 pos = entity.position();
		if (grinding && speed > 0.05F) {
			for (int i = 0; i < 2; i++) {
				level.addParticle(ParticleTypes.ELECTRIC_SPARK, pos.x + (random.nextDouble() - 0.5) * 0.3, pos.y + 0.05, pos.z + (random.nextDouble() - 0.5) * 0.3,
					(random.nextDouble() - 0.5) * 0.2, 0.08 + random.nextDouble() * 0.1, (random.nextDouble() - 0.5) * 0.2);
			}
			if (random.nextInt(3) == 0) {
				level.addParticle(ParticleTypes.CRIT, pos.x, pos.y + 0.05, pos.z, (random.nextDouble() - 0.5) * 0.3, 0.12, (random.nextDouble() - 0.5) * 0.3);
			}
		}
		if (powerslide && speed > 0.08F) {
			dust(entity, 3, 0.12);
			level.addParticle(ParticleTypes.POOF, pos.x, pos.y + 0.05, pos.z, 0.0, 0.02, 0.0);
		}
		if (!airborne && !grinding && speed > 0.25F && random.nextFloat() < 0.15F) {
			dust(entity, 1, 0.03);
		}
		String effect = entity.config().part(entity.sport(), "effect");
		if (!"none".equals(effect) && speed > 0.12F && random.nextFloat() < Math.min(1.0F, speed * 2.2F)) {
			trail(entity, effect, random, airborne);
		}
	}

	private static void trail(SportEquipmentEntity entity, String effect, RandomSource random, boolean airborne) {
		Level level = entity.level();
		Vec3 back = RideController.forward(entity.getYRot()).scale(-0.45);
		double x = entity.getX() + back.x + (random.nextDouble() - 0.5) * 0.2;
		double y = entity.getY() + 0.15 + (airborne ? 0.2 : 0.0);
		double z = entity.getZ() + back.z + (random.nextDouble() - 0.5) * 0.2;
		switch (effect) {
			case "dust" -> level.addParticle(ParticleTypes.POOF, x, y, z, 0.0, 0.01, 0.0);
			case "sparks" -> level.addParticle(ParticleTypes.ELECTRIC_SPARK, x, y, z, 0.0, 0.05, 0.0);
			case "flames" -> {
				level.addParticle(ParticleTypes.FLAME, x, y, z, 0.0, 0.02, 0.0);
				if (random.nextInt(3) == 0) {
					level.addParticle(ParticleTypes.SMOKE, x, y + 0.1, z, 0.0, 0.03, 0.0);
				}
			}
			case "rainbow" -> {
				float hue = (entity.tickCount % 60) / 60.0F;
				int color = Mth.hsvToRgb(hue, 0.85F, 1.0F);
				level.addParticle(new DustParticleOptions(color, 1.1F), x, y, z, 0.0, 0.0, 0.0);
			}
			case "hearts" -> {
				if (random.nextInt(4) == 0) {
					level.addParticle(ParticleTypes.HEART, x, y + 0.2, z, 0.0, 0.05, 0.0);
				}
			}
			case "notes" -> {
				if (random.nextInt(3) == 0) {
					level.addParticle(ParticleTypes.NOTE, x, y + 0.3, z, random.nextDouble(), 0.0, 0.0);
				}
			}
			case "snow" -> level.addParticle(ParticleTypes.SNOWFLAKE, x, y, z, 0.0, 0.02, 0.0);
			case "ender" -> level.addParticle(ParticleTypes.REVERSE_PORTAL, x, y, z, 0.0, 0.03, 0.0);
			default -> {
			}
		}
	}

	public static boolean rollEnabled() {
		return ClientConfig.get().rollVolume > 0.0F;
	}
}
