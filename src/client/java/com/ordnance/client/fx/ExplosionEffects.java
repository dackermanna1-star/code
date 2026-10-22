package com.ordnance.client.fx;

import com.ordnance.client.particle.BlockChunkParticle;
import com.ordnance.client.particle.OrdnanceParticle;
import com.ordnance.client.particle.ParticleBudget;
import com.ordnance.client.particle.ParticleSprites;
import com.ordnance.config.ConfigManager;
import com.ordnance.explosion.ExplosionProfile;
import com.ordnance.util.Wind;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.FluidTags;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;
import org.jspecify.annotations.Nullable;

/**
 * Builds the visual sequence of a detonation: flash, expanding fireball, sparks, block debris, ground dust ring,
 * shockwave rings, billowing and lingering smoke, plus screen flash, delayed sound and shake, smoke obstruction
 * and heat haze. Each warhead style has its own recipe; counts scale with distance and the particle budget.
 */
public final class ExplosionEffects {
	private static final int HE_SMOKE_START = 0xE0342F2A;
	private static final int HE_SMOKE_MID = 0xD05E5852;
	private static final int HE_SMOKE_END = 0xB0857E77;
	private static final int FIRE_START = 0xFFFFF6D8;
	private static final int FIRE_MID = 0xFFFF9C3A;
	private static final int FIRE_END = 0x80502616;
	/** Smoke rolls in a few ticks after the fireball; spawned together it would hide the fireball completely. */
	private static final int SMOKE_DELAY = 3;

	private ExplosionEffects() {
	}

	/** Entry point for Ordnance warheads (from the server's explosion packet). */
	public static void play(ClientWorld world, Vec3d pos, ExplosionProfile profile, float scale, Vec3d direction, long seed) {
		if (!ParticleSprites.ready()) {
			return;
		}

		Ctx ctx = Ctx.create(world, pos, profile, scale, direction, seed);
		if (ctx.underwater) {
			underwater(ctx);
			return;
		}

		switch (profile.style()) {
			case FRAG -> frag(ctx);
			case HEAT -> heat(ctx);
			case INCENDIARY -> incendiary(ctx);
			case SMOKE -> smokePop(ctx);
			case THERMOBARIC -> thermobaric(ctx);
			case MISSILE -> missile(ctx);
			case VANILLA -> vanilla(ctx);
		}
	}

	/** Vanilla explosions (TNT, creepers...) re-rendered with the Ordnance effects. */
	public static void playVanilla(ClientWorld world, Vec3d pos, float power) {
		play(world, pos, ExplosionProfile.VANILLA, Math.max(0.6F, power / 2.5F), new Vec3d(0.0, -1.0, 0.0), world.getRandom().nextLong());
	}

	// ------------------------------------------------------------------ recipes

	private static void frag(Ctx c) {
		float s = c.scale;
		flash(c, 2.4F * s, 0xFFFFF4D8, 4);
		fireball(c, 14.0F * (float)Math.pow(s, 1.2), 0.65F * s, 0.6F * s, 1.7F * s, 8, 15, 0.004F);
		sparks(c, 36.0F * s, 0.55 * MathHelper.sqrt(s), 1.1 * MathHelper.sqrt(s), null);
		chunks(c, 18.0F * s, 0.25 * MathHelper.sqrt(s), 0.65 * MathHelper.sqrt(s));
		groundDust(c, 16.0F * s, 0.4F * s, 0.25 * MathHelper.sqrt(s), 0.42 * MathHelper.sqrt(s), 0.5F * s, 1.9F * s);
		shockRing(c, 0.3F, 6.0F * s, 6, 0.35F);
		FxScheduler.schedule(SMOKE_DELAY, () -> smoke(c, 12.0F * s, 1.0F * s, 0.9F * s, 3.0F * s, 70, 140, HE_SMOKE_START, HE_SMOKE_MID, HE_SMOKE_END, 0.85F, 0.0015F));
		embers(c, 10.0F * s, 0.3);
		common(c, 0.55F, 0xFFF4D8, 2.5F, 0.7F, 30);
	}

	private static void heat(Ctx c) {
		frag(c);
		// Spall and debris jet thrown back out of the struck surface.
		Vec3d jet = c.direction.multiply(-1.0);
		sparks(c, 26.0F * c.scale, 0.7, 1.5, jet);
		cone(c, jet, 12.0F * c.scale);
		flash(c, 1.4F * c.scale, 0xFFFFFFFF, 2);
	}

	private static void incendiary(Ctx c) {
		float s = c.scale;
		flash(c, 2.0F * s, 0xFFFFC890, 4);
		fireball(c, 16.0F * s, 0.9F * s, 0.5F * s, 1.7F * s, 16, 28, 0.006F);
		Random r = c.random;
		int flames = c.count(28.0F * s);
		for (int i = 0; i < flames; i++) {
			double angle = r.nextDouble() * MathHelper.TAU;
			double speed = 0.15 + r.nextDouble() * 0.22;
			OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F)
				.life(18, 34).size(0.3F * c.sizeComp, 0.8F * c.sizeComp)
				.colors(0xFFFFE0A0, 0xFFFF8030, 0x00A02008)
				.velocity(Math.cos(angle) * speed, 0.1 + r.nextDouble() * 0.2, Math.sin(angle) * speed)
				.gravity(0.02F).drag(0.92F).collide()
				.spawn(c.world, c.pos.add(0.0, 0.2, 0.0));
		}

		int droplets = c.count(20.0F * s);
		for (int i = 0; i < droplets; i++) {
			Vec3d v = randomUnit(r).multiply(0.22 + r.nextDouble() * 0.3).add(0.0, 0.25 + r.nextDouble() * 0.2, 0.0);
			OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F)
				.life(25, 40).size(0.14F, 0.1F).colors(0xFFFFE8B0, 0xFFFF7020)
				.velocity(v).gravity(0.035F).drag(0.99F).collide()
				.onTick(p -> {
					if (p.getAge() % 3 == 0) {
						trailSmoke(c.world, p.getPos(), 0.25F, 0xB0201A16);
					}
				})
				.onDeath(p -> groundFlame(c.world, p.getPos()))
				.spawn(c.world, c.pos);
		}

		FxScheduler.schedule(SMOKE_DELAY, () -> smoke(c, 16.0F * s, 1.2F * s, 1.0F * s, 3.4F * s, 100, 180, 0xF0161210, 0xE0221E1A, 0xC0403A34, 0.9F, 0.003F));
		embers(c, 24.0F * s, 0.35);
		ScreenEffects.explosionFlash(c.pos, s * 0.8F, 0xFFB060);
		HeatHaze.addSource(c.pos, 1.0F, 9.0F * s, 70);
		SmokeVolumes.add(c.pos.add(0.0, 1.0, 0.0), 3.0F * s, 0.65F, 140, 0x2A2522);
		ExplosionSounds.play(c.pos, c.profile.style(), s, false, c.random);
		shakeLater(c, 0.3F, 0.0F);
	}

	private static void smokePop(Ctx c) {
		int puffs = c.count(10.0F);
		for (int i = 0; i < puffs; i++) {
			Vec3d v = randomUnit(c.random).multiply(0.05 + c.random.nextDouble() * 0.06).add(0.0, 0.04, 0.0);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(40, 70).size(0.4F, 1.6F).sizeCurve(0.5F)
				.colors(0xF0F0F0EE, 0xE0D8D8D4, 0xC0C8C8C4).alpha(0.9F).velocity(v).drag(0.92F).buoyancy(0.001F).wind(c.wind, 0.5F)
				.spawn(c.world, c.pos.add(0.0, 0.2, 0.0));
		}

		ExplosionSounds.play(c.pos, c.profile.style(), c.scale, false, c.random);
	}

	private static void thermobaric(Ctx c) {
		float s = c.scale;
		// Fuel dispersal cloud, then ignition a moment later.
		int mist = c.count(14.0F);
		for (int i = 0; i < mist; i++) {
			Vec3d v = randomUnit(c.random).multiply(0.2 + c.random.nextDouble() * 0.25);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(5, 7).size(0.6F * s, 1.6F * s).color(0x90D8D2C8).velocity(v).drag(0.85F)
				.spawn(c.world, c.pos);
		}

		FxScheduler.schedule(2, () -> {
			flash(c, 3.5F * s, 0xFFFFEFC8, 5);
			fireball(c, 34.0F, 1.3F * s, 0.7F * s, 2.4F * s, 18, 34, 0.007F);
			shockRing(c, 0.5F, 7.0F * s, 9, 0.45F);
			shockSphere(c, 4.5F * s, 7, 0.22F);
			sparks(c, 50.0F, 0.6, 1.4, null);
			chunks(c, 30.0F, 0.35, 0.9);
			groundDust(c, 30.0F, 0.6F * s, 0.45, 0.8, 1.0F * s, 3.0F * s);
			FxScheduler.schedule(SMOKE_DELAY, () -> smoke(c, 22.0F, 1.6F * s, 1.2F * s, 4.0F * s, 120, 220, 0xF0201C18, 0xE0403A34, 0xB0706A64, 0.9F, 0.003F));
			embers(c, 40.0F, 0.6);
			common(c, 0.9F, 0xFFE0B0, 5.0F, 1.0F, 100);
		});
		FxScheduler.repeat(4, 1, 7, i -> {
			int rolls = c.count(4.0F);
			for (int k = 0; k < rolls; k++) {
				Vec3d offset = randomUnit(c.random).multiply(1.5 * s);
				OrdnanceParticle.builder(ParticleSprites.FIREBALL).animated().life(14, 24).size(0.7F * s, 1.8F * s)
					.colors(FIRE_START, FIRE_MID, FIRE_END).colorMidPoint(0.35F).emissive(1.0F, 0.3F)
					.velocity(offset.multiply(0.03).add(0.0, 0.05, 0.0)).buoyancy(0.006F).drag(0.92F)
					.spawn(c.world, c.pos.add(offset.x, Math.abs(offset.y) * 0.6, offset.z));
			}
		});
	}

	private static void missile(Ctx c) {
		float s = c.scale;
		MinecraftClient client = MinecraftClient.getInstance();
		flash(c, 5.0F * s, 0xFFFFFAF0, 6);
		if (ConfigManager.get().visuals.skyFlash && c.distance < 260.0) {
			c.world.setLightningTicksLeft(3);
		}

		fireball(c, 60.0F, 0.9F * s, 1.2F * s, 2.8F * s, 30, 55, 0.01F);
		shockRing(c, 1.0F, 14.0F * s, 12, 0.5F);
		shockRing(c, 0.5F, 8.0F * s, 18, 0.3F);
		shockSphere(c, 9.0F * s, 9, 0.25F);
		sparks(c, 140.0F, 0.8, 2.2, null);
		chunks(c, 110.0F, 0.6, 1.6);
		fieryDebris(c, 30.0F);
		groundDust(c, 80.0F, 3.0F, 1.0, 1.8, 2.0F, 7.0F);
		FxScheduler.schedule(SMOKE_DELAY + 2, () -> smoke(c, 40.0F, 1.2F * s, 2.0F * s, 4.0F * s, 160, 260, 0xF0221C18, 0xE04A423A, 0xC0747068, 0.95F, 0.004F));

		// Mushroom cloud: a rising stem, then a rolling cap spreading outward.
		double groundY = c.groundY != null ? c.groundY : c.pos.y - 1.0;
		FxScheduler.repeat(2, 1, 60, i -> {
			int puffs = c.count(3.0F);
			for (int k = 0; k < puffs; k++) {
				double angle = c.random.nextDouble() * MathHelper.TAU;
				double rr = c.random.nextDouble() * 2.5;
				double rise = MathHelper.lerp(i / 60.0, 0.6, 0.18);
				OrdnanceParticle.builder(ParticleSprites.SMOKE).life(200, 320).size(3.0F, 8.0F).sizeCurve(0.6F)
					.colors(0xF0544036, 0xE0605852, 0xC0807A74).colorMidPoint(0.2F).alpha(0.9F).fade(0.05F, 0.65F)
					.velocity(Math.cos(angle) * 0.03, rise, Math.sin(angle) * 0.03).drag(0.975F).wind(c.wind, 0.2F)
					.emissive(0.6F, 0.0F)
					.spawn(c.world, c.pos.x + Math.cos(angle) * rr, groundY + 1.0 + c.random.nextDouble() * 2.0, c.pos.z + Math.sin(angle) * rr);
			}
		});
		FxScheduler.repeat(14, 1, 50, i -> {
			int puffs = c.count(5.0F);
			double capY = groundY + 26.0 + i * 0.12;
			for (int k = 0; k < puffs; k++) {
				double angle = c.random.nextDouble() * MathHelper.TAU;
				double rr = 4.0 + c.random.nextDouble() * 5.0;
				OrdnanceParticle.builder(ParticleSprites.SMOKE).life(240, 400).size(6.0F, 14.0F).sizeCurve(0.6F)
					.colors(0xF09A6038, 0xE0706258, 0xC08A847C).colorMidPoint(0.15F).alpha(0.9F).fade(0.08F, 0.7F)
					.velocity(Math.cos(angle) * (0.12 + c.random.nextDouble() * 0.08), 0.02 + c.random.nextDouble() * 0.03, Math.sin(angle) * (0.12 + c.random.nextDouble() * 0.08))
					.drag(0.985F).wind(c.wind, 0.15F).emissive(0.5F, 0.0F)
					.spawn(c.world, c.pos.x + Math.cos(angle) * rr, capY + c.random.nextDouble() * 4.0, c.pos.z + Math.sin(angle) * rr);
			}
		});
		lingeringFires(c, 0.8F * s, 420);
		common(c, 1.2F, 0xFFFAF0, 4.0F * s, 1.0F, 600);
		if (c.distance < 200.0) {
			FxScheduler.schedule(ExplosionSounds.travelTicks(c.distance), () -> CameraShake.addRumble((float)MathHelper.clamp(1.0 - c.distance / 220.0, 0.0, 1.0)));
		}

		if (client.player != null) {
			HeatHaze.addSource(c.pos, 1.0F, 40.0F, 200);
		}
	}

	private static void vanilla(Ctx c) {
		float s = c.scale;
		flash(c, 1.7F * s, 0xFFFFF0D0, 3);
		fireball(c, 10.0F * s, 0.7F * s, 0.5F * s, 1.5F * s, 8, 16, 0.004F);
		sparks(c, 16.0F * s, 0.4, 0.9, null);
		chunks(c, 22.0F * s, 0.25, 0.7);
		groundDust(c, 18.0F * s, 0.5F * s, 0.25, 0.45, 0.6F * s, 2.0F * s);
		shockRing(c, 0.3F, 5.0F * s, 6, 0.3F);
		FxScheduler.schedule(SMOKE_DELAY, () -> smoke(c, 16.0F * s, 1.1F * s, 0.9F * s, 3.2F * s, 80, 160, 0xE04A4540, 0xD0807A74, 0xB0A8A29C, 0.85F, 0.002F));
		common(c, 0.5F, 0xFFF0D0, 2.6F * s, 0.6F, 40);
	}

	private static void underwater(Ctx c) {
		float s = c.scale;
		flash(c, 1.4F * s, 0x90D8F0FF, 3);
		int bubbles = c.count(60.0F * s);
		for (int i = 0; i < bubbles; i++) {
			Vec3d p = c.pos.add(randomUnit(c.random).multiply(c.random.nextDouble() * 1.5 * s));
			c.world.addParticleClient(ParticleTypes.BUBBLE, p.x, p.y, p.z, (c.random.nextDouble() - 0.5) * 0.3, 0.2 + c.random.nextDouble() * 0.4, (c.random.nextDouble() - 0.5) * 0.3);
		}

		BlockPos.Mutable mutable = BlockPos.ofFloored(c.pos).mutableCopy();
		for (int i = 0; i < 10 && c.world.getFluidState(mutable).isIn(FluidTags.WATER); i++) {
			mutable.move(Direction.UP);
		}

		if (!c.world.getFluidState(mutable).isIn(FluidTags.WATER)) {
			Vec3d surface = new Vec3d(c.pos.x, mutable.getY(), c.pos.z);
			int spray = c.count(40.0F * s);
			for (int i = 0; i < spray; i++) {
				double angle = c.random.nextDouble() * MathHelper.TAU;
				double spread = c.random.nextDouble() * 0.12 * s;
				OrdnanceParticle.builder(ParticleSprites.DUST).life(25, 45).size(0.3F, 1.0F).colors(0xE8F0F8FF, 0xA0D8E8F0).alpha(0.85F)
					.velocity(Math.cos(angle) * spread, 0.35 + c.random.nextDouble() * 0.5 * MathHelper.sqrt(s), Math.sin(angle) * spread)
					.gravity(0.045F).drag(0.98F)
					.spawn(c.world, surface.x, surface.y + 0.2, surface.z);
				c.world.addParticleClient(ParticleTypes.SPLASH, surface.x + Math.cos(angle) * 1.5, surface.y + 0.1, surface.z + Math.sin(angle) * 1.5, 0.0, 0.2, 0.0);
			}
		}

		ExplosionSounds.play(c.pos, c.profile.style(), s, true, c.random);
		shakeLater(c, 0.35F, 0.0F);
	}

	// ------------------------------------------------------------------ building blocks

	/** Shared tail: screen flash, delayed shake, smoke obstruction, heat and sound. */
	private static void common(Ctx c, float shake, int flashRgb, float smokeRadius, float heat, int heatTicks) {
		ScreenEffects.explosionFlash(c.pos, c.scale, flashRgb);
		ExplosionSounds.play(c.pos, c.profile.style(), c.scale, false, c.random);
		shakeLater(c, shake, 0.0F);
		SmokeVolumes.add(c.pos.add(0.0, 1.0, 0.0), smokeRadius, 0.55F, (int)(160 * ConfigManager.get().visuals.lingeringSmokeMultiplier) + 40, 0x5A5550);
		if (heat > 0.0F) {
			HeatHaze.addSource(c.pos, heat, 6.0F * c.scale + 4.0F, heatTicks);
		}
	}

	/** Shake arrives with the blast wave, i.e. with the sound when realistic delay is on. */
	private static void shakeLater(Ctx c, float base, float rumble) {
		float reach = c.scale * 7.0F + 6.0F;
		float amount = (float)(base * Math.pow(c.scale, 0.7) / (1.0 + Math.pow(c.distance / reach, 2.0)));
		if (amount > 0.01F) {
			FxScheduler.schedule(ExplosionSounds.travelTicks(c.distance), () -> CameraShake.add(amount));
		}
	}

	private static void flash(Ctx c, float size, int argb, int life) {
		OrdnanceParticle.builder(ParticleSprites.FLASH).glow().emissive(1.0F, 1.0F).life(life, life)
			.size(size * 0.7F, size).color(argb).fade(0.0F, 0.3F)
			.spawn(c.world, c.pos.add(0.0, 0.4, 0.0));
	}

	private static void fireball(Ctx c, float count, float radius, float sizeStart, float sizeEnd, int lifeMin, int lifeMax, float buoyancy) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d offset = randomUnit(c.random).multiply(radius * Math.cbrt(c.random.nextDouble()));
			Vec3d velocity = offset.multiply(0.12 + c.random.nextDouble() * 0.1).add(0.0, 0.02, 0.0);
			if (c.groundY != null && c.pos.y + offset.y < c.groundY + 0.3) {
				offset = new Vec3d(offset.x, c.groundY + 0.3 - c.pos.y, offset.z);
			}

			OrdnanceParticle.builder(ParticleSprites.FIREBALL).animated().life(lifeMin, lifeMax)
				.size(sizeStart * c.sizeComp, sizeEnd * c.sizeComp).sizeCurve(0.55F)
				.colors(FIRE_START, FIRE_MID, FIRE_END).colorMidPoint(0.3F).fade(0.0F, 0.55F)
				.emissive(1.0F, 0.35F).velocity(velocity).buoyancy(buoyancy).drag(0.88F).spin(0.05F)
				.onDeath(p -> trailSmoke(c.world, p.getPos(), sizeEnd * 0.6F, HE_SMOKE_MID))
				.spawn(c.world, c.pos.add(offset));
		}
	}

	private static void sparks(Ctx c, float count, double minSpeed, double maxSpeed, @Nullable Vec3d coneAxis) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d dir = coneAxis == null ? randomUnit(c.random) : jitter(coneAxis, 0.55, c.random);
			if (c.groundY != null && dir.y < -0.2) {
				dir = new Vec3d(dir.x, -dir.y * 0.5, dir.z);
			}

			Vec3d velocity = dir.multiply(minSpeed + c.random.nextDouble() * (maxSpeed - minSpeed));
			OrdnanceParticle.builder(ParticleSprites.SPARK).glow().emissive(1.0F, 1.0F).life(8, 22)
				.size(0.07F, 0.02F).colors(0xFFFFFFF0, 0xFFFFD070, 0xFFFF6020).alpha(1.0F).fade(0.0F, 0.7F)
				.velocity(velocity).gravity(0.045F).drag(0.94F).bounce(0.45F)
				.onTick(p -> {
					if (p.getAge() < 7 && p.getAge() % 2 == 0) {
						OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F).life(3, 5).size(0.035F, 0.01F)
							.colors(0xFFFFE0A0, 0xFFFF6010).spawn(c.world, p.getPos());
					}
				})
				.spawn(c.world, c.pos);
		}
	}

	private static void cone(Ctx c, Vec3d axis, float count) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d velocity = jitter(axis, 0.6, c.random).multiply(0.4 + c.random.nextDouble() * 0.6);
			BlockChunkParticle.spawn(c.world, c.pos, velocity, c.palette(), 0.06F + c.random.nextFloat() * 0.08F, 40 + c.random.nextInt(30));
		}
	}

	private static void chunks(Ctx c, float count, double minSpeed, double maxSpeed) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d dir = randomUnit(c.random);
			dir = new Vec3d(dir.x, Math.abs(dir.y) * 0.8 + 0.35, dir.z).normalize();
			Vec3d velocity = dir.multiply(minSpeed + c.random.nextDouble() * (maxSpeed - minSpeed));
			Vec3d start = c.pos.add((c.random.nextDouble() - 0.5) * c.scale, 0.1, (c.random.nextDouble() - 0.5) * c.scale);
			BlockChunkParticle.spawn(c.world, start, velocity, c.palette(), 0.06F + c.random.nextFloat() * 0.1F, 40 + c.random.nextInt(40));
		}
	}

	private static void fieryDebris(Ctx c, float count) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d dir = randomUnit(c.random);
			Vec3d velocity = new Vec3d(dir.x * (0.3 + c.random.nextDouble() * 0.6), 0.6 + c.random.nextDouble() * 0.8, dir.z * (0.3 + c.random.nextDouble() * 0.6));
			OrdnanceParticle.builder(ParticleSprites.FIREBALL).animated().glow().emissive(1.0F, 1.0F).life(40, 70)
				.size(0.35F, 0.2F).colors(0xFFFFE0A0, 0xFFFF8030, 0xFFA03010).fade(0.0F, 0.85F)
				.velocity(velocity).gravity(0.04F).drag(0.99F).collide()
				.onTick(p -> {
					if (p.getAge() % 2 == 0) {
						trailSmoke(c.world, p.getPos(), 0.6F, 0xC0302A26);
					}
				})
				.onDeath(p -> groundFlame(c.world, p.getPos()))
				.spawn(c.world, c.pos.add(0.0, 0.5, 0.0));
		}
	}

	private static void groundDust(Ctx c, float count, float ringRadius, double minSpeed, double maxSpeed, float sizeStart, float sizeEnd) {
		if (c.groundY == null || c.pos.y - c.groundY > 2.5 + c.scale) {
			return;
		}

		int n = c.count(count);
		int dust = c.dustColor;
		for (int i = 0; i < n; i++) {
			double angle = c.random.nextDouble() * MathHelper.TAU;
			double speed = minSpeed + c.random.nextDouble() * (maxSpeed - minSpeed);
			OrdnanceParticle.builder(ParticleSprites.DUST).life(30, 60).size(sizeStart * c.sizeComp, sizeEnd * c.sizeComp).sizeCurve(0.6F)
				.colors(0xE0000000 | dust, 0xA0000000 | dust, 0x60000000 | dust).alpha(0.75F).fade(0.0F, 0.4F)
				.velocity(Math.cos(angle) * speed, 0.02 + c.random.nextDouble() * 0.05, Math.sin(angle) * speed)
				.drag(0.9F).buoyancy(0.001F).wind(c.wind, 0.3F)
				.spawn(c.world, c.pos.x + Math.cos(angle) * ringRadius, c.groundY + 0.25, c.pos.z + Math.sin(angle) * ringRadius);
		}
	}

	private static void shockRing(Ctx c, float sizeStart, float sizeEnd, int life, float alpha) {
		double y = c.groundY != null && c.pos.y - c.groundY < 3.0 ? c.groundY + 0.15 : c.pos.y;
		OrdnanceParticle.builder(ParticleSprites.SHOCKWAVE).horizontal().life(life, life).size(sizeStart, sizeEnd).sizeCurve(0.5F)
			.color(0xFFFFFFFF).alpha(alpha).fade(0.0F, 0.15F).emissive(0.6F, 0.2F)
			.spawn(c.world, c.pos.x, y, c.pos.z);
	}

	private static void shockSphere(Ctx c, float sizeEnd, int life, float alpha) {
		OrdnanceParticle.builder(ParticleSprites.SHOCKWAVE).life(life, life).size(0.5F, sizeEnd).sizeCurve(0.5F)
			.color(0xFFFFFFFF).alpha(alpha).fade(0.0F, 0.2F).emissive(0.5F, 0.2F)
			.spawn(c.world, c.pos);
	}

	private static void smoke(Ctx c, float count, float radius, float sizeStart, float sizeEnd, int lifeMin, int lifeMax,
		int colorStart, int colorMid, int colorEnd, float alpha, float buoyancy) {
		int n = c.count(count);
		float linger = ConfigManager.get().visuals.lingeringSmokeMultiplier;
		for (int i = 0; i < n; i++) {
			Vec3d offset = randomUnit(c.random).multiply(radius * c.random.nextDouble());
			if (c.groundY != null && c.pos.y + offset.y < c.groundY + 0.5) {
				offset = new Vec3d(offset.x, c.groundY + 0.5 - c.pos.y, offset.z);
			}

			Vec3d velocity = offset.normalize().multiply(0.04 + c.random.nextDouble() * 0.1).add(0.0, 0.02 + c.random.nextDouble() * 0.04, 0.0);
			OrdnanceParticle.builder(ParticleSprites.SMOKE)
				.life((int)(lifeMin * linger) + 10, (int)(lifeMax * linger) + 20)
				.size(sizeStart * c.sizeComp, sizeEnd * c.sizeComp).sizeCurve(0.55F)
				.colors(colorStart, colorMid, colorEnd).colorMidPoint(0.35F).alpha(alpha).fade(0.12F, 0.55F)
				.velocity(velocity).buoyancy(buoyancy).drag(0.95F).wind(c.wind, 0.6F).spin(0.01F)
				.emissive(0.45F, 0.0F)
				.spawn(c.world, c.pos.add(offset));
		}
	}

	private static void embers(Ctx c, float count, double speed) {
		int n = c.count(count);
		for (int i = 0; i < n; i++) {
			Vec3d velocity = randomUnit(c.random).multiply(speed * c.random.nextDouble()).add(0.0, 0.08, 0.0);
			OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F).life(40, 90).size(0.05F, 0.025F)
				.colors(0xFFFFD080, 0xFFFF7020, 0xFFB02008).fade(0.0F, 0.75F)
				.velocity(velocity).buoyancy(0.0035F).drag(0.95F).wind(c.wind, 0.8F)
				.spawn(c.world, c.pos.add(randomUnit(c.random).multiply(0.5 * c.scale)));
		}
	}

	/** Smoke and flames rising from the crater for a while after big blasts. */
	private static void lingeringFires(Ctx c, float radius, int ticks) {
		float linger = ConfigManager.get().visuals.lingeringSmokeMultiplier;
		int count = (int)(ticks * linger / 3);
		double groundY = c.groundY != null ? c.groundY : c.pos.y;
		FxScheduler.repeat(20, 3, count, i -> {
			float fade = 1.0F - i / (float)Math.max(1, count);
			if (c.random.nextFloat() > fade + 0.2F) {
				return;
			}

			double angle = c.random.nextDouble() * MathHelper.TAU;
			double rr = Math.sqrt(c.random.nextDouble()) * radius;
			double x = c.pos.x + Math.cos(angle) * rr;
			double z = c.pos.z + Math.sin(angle) * rr;
			Vec3d at = new Vec3d(x, groundY + 0.3, z);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(120, 220).size(1.2F, 4.5F).sizeCurve(0.6F)
				.colors(0xE0201A16, 0xD0403A34, 0xB06E6862).alpha(0.85F).fade(0.08F, 0.6F)
				.velocity(0.0, 0.08 + c.random.nextDouble() * 0.06, 0.0).drag(0.97F).buoyancy(0.002F).wind(c.wind, 0.6F)
				.spawn(c.world, at);
			if (c.random.nextInt(2) == 0) {
				groundFlame(c.world, at);
			}

			if (c.random.nextInt(3) == 0) {
				OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F).life(40, 80).size(0.05F, 0.02F)
					.colors(0xFFFFC060, 0xFFFF5010).velocity(0.0, 0.1, 0.0).buoyancy(0.002F).wind(c.wind, 1.0F)
					.spawn(c.world, at);
			}
		});
	}

	public static void groundFlame(ClientWorld world, Vec3d pos) {
		OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F).life(16, 30)
			.size(0.25F, 0.45F).colors(0xFFFFE0A0, 0xFFFF8030, 0x00A02008).buoyancy(0.003F).drag(0.9F)
			.spawn(world, pos.x, pos.y + 0.1, pos.z);
	}

	public static void trailSmoke(ClientWorld world, Vec3d pos, float size, int argb) {
		OrdnanceParticle.builder(ParticleSprites.SMOKE).life(30, 60).size(size * 0.6F, size * 1.8F).sizeCurve(0.6F)
			.colors(argb, argb & 0x00FFFFFF | 0x60000000).alpha(0.7F).fade(0.2F, 0.45F)
			.velocity(0.0, 0.02, 0.0).drag(0.95F).buoyancy(0.001F)
			.spawn(world, pos);
	}

	public static Vec3d randomUnit(Random random) {
		double z = random.nextDouble() * 2.0 - 1.0;
		double angle = random.nextDouble() * Math.PI * 2.0;
		double r = Math.sqrt(1.0 - z * z);
		return new Vec3d(r * Math.cos(angle), z, r * Math.sin(angle));
	}

	public static Vec3d jitter(Vec3d axis, double amount, Random random) {
		return axis.normalize().add(randomUnit(random).multiply(amount)).normalize();
	}

	/** Per-explosion context: distance-based particle density, local terrain, palette for debris. */
	private static final class Ctx {
		final ClientWorld world;
		final Vec3d pos;
		final ExplosionProfile profile;
		final float scale;
		final Vec3d direction;
		final Random random;
		final double distance;
		final float density;
		final float sizeComp;
		final boolean underwater;
		@Nullable
		final Double groundY;
		final List<BlockState> palette = new ArrayList<>();
		final int dustColor;
		final Vec3d wind;

		private Ctx(ClientWorld world, Vec3d pos, ExplosionProfile profile, float scale, Vec3d direction, long seed) {
			this.world = world;
			this.pos = pos;
			this.profile = profile;
			this.scale = scale;
			this.direction = direction.lengthSquared() < 1.0E-6 ? new Vec3d(0.0, -1.0, 0.0) : direction.normalize();
			this.random = Random.create(seed);
			MinecraftClient client = MinecraftClient.getInstance();
			this.distance = client.gameRenderer.getCamera().getCameraPos().distanceTo(pos);
			this.density = ParticleBudget.scale(this.distance);
			this.sizeComp = ParticleBudget.sizeCompensation(this.density);
			this.underwater = world.getFluidState(BlockPos.ofFloored(pos)).isIn(FluidTags.WATER);
			this.wind = Wind.velocity(world, 0.08);

			Double ground = null;
			BlockPos.Mutable mutable = BlockPos.ofFloored(pos).mutableCopy();
			int depth = 3 + MathHelper.ceil(scale);
			for (int i = 0; i <= depth; i++) {
				BlockState state = world.getBlockState(mutable);
				if (!state.isAir() && state.isSideSolidFullSquare(world, mutable, Direction.UP)) {
					ground = (double)(mutable.getY() + 1);
					break;
				}

				mutable.move(Direction.DOWN);
			}

			this.groundY = ground;
			int range = MathHelper.ceil(Math.min(4.0F, 1.0F + scale));
			for (int i = 0; i < 24 && this.palette.size() < 8; i++) {
				BlockPos sample = BlockPos.ofFloored(pos).add(this.random.nextInt(range * 2 + 1) - range, -this.random.nextInt(range + 1), this.random.nextInt(range * 2 + 1) - range);
				BlockState state = world.getBlockState(sample);
				if (!state.isAir() && state.getFluidState().isEmpty() && state.hasBlockBreakParticles()) {
					this.palette.add(state);
				}
			}

			if (this.palette.isEmpty()) {
				this.palette.add(Blocks.DIRT.getDefaultState());
			}

			int tint = this.palette.getFirst().getMapColor(world, BlockPos.ofFloored(pos)).color;
			this.dustColor = blend(tint == 0 ? 0x8C7A64 : tint, 0x8C8278, 0.55F);
		}

		static Ctx create(ClientWorld world, Vec3d pos, ExplosionProfile profile, float scale, Vec3d direction, long seed) {
			return new Ctx(world, pos, profile, scale, direction, seed);
		}

		int count(float base) {
			return ParticleBudget.count(base, this.density);
		}

		BlockState palette() {
			return this.palette.get(this.random.nextInt(this.palette.size()));
		}

		private static int blend(int a, int b, float t) {
			int r = (int)MathHelper.lerp(t, a >> 16 & 0xFF, b >> 16 & 0xFF);
			int g = (int)MathHelper.lerp(t, a >> 8 & 0xFF, b >> 8 & 0xFF);
			int bl = (int)MathHelper.lerp(t, a & 0xFF, b & 0xFF);
			return r << 16 | g << 8 | bl;
		}
	}
}
