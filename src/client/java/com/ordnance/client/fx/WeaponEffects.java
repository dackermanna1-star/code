package com.ordnance.client.fx;

import com.ordnance.ClientBridge;
import com.ordnance.client.particle.OrdnanceParticle;
import com.ordnance.client.particle.ParticleBudget;
import com.ordnance.client.particle.ParticleSprites;
import com.ordnance.client.sound.EntityLoopSound;
import com.ordnance.config.ConfigManager;
import com.ordnance.entity.DebrisEntity;
import com.ordnance.entity.GrenadeEntity;
import com.ordnance.entity.HypersonicMissileEntity;
import com.ordnance.entity.LauncherGrenadeEntity;
import com.ordnance.entity.RocketEntity;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModSounds;
import com.ordnance.util.Wind;
import com.ordnance.weapon.FlamethrowerItem;
import com.ordnance.weapon.GrenadeLauncherItem;
import com.ordnance.weapon.RocketLauncherItem;
import com.ordnance.weapon.StrikeDesignatorItem;
import com.ordnance.weapon.WeaponHelper;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.Camera;
import net.minecraft.client.world.ClientWorld;
import net.minecraft.entity.Entity;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.sound.SoundCategory;
import net.minecraft.util.Arm;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.util.math.random.Random;

/**
 * Client visuals for weapons and projectiles: muzzle flash, backblast, recoil, rocket exhaust and smoke trails,
 * missile plasma and contrail, smoke canisters, burning debris, flamethrower streams and the designator laser.
 * Installed as the {@link ClientBridge} implementation.
 */
public final class WeaponEffects implements ClientBridge.Effects {
	public static final WeaponEffects INSTANCE = new WeaponEffects();
	private static final Random RANDOM = Random.create();
	private static final Map<Integer, EntityLoopSound> FLAME_SOUNDS = new HashMap<>();

	private WeaponEffects() {
	}

	// ------------------------------------------------------------------ bridge

	@Override
	public void weaponFired(PlayerEntity shooter, ItemStack weapon) {
		MinecraftClient client = MinecraftClient.getInstance();
		if (client.world == null || shooter != client.player) {
			return;
		}

		boolean rpg = weapon.getItem() instanceof RocketLauncherItem;
		Vec3d look = shooter.getRotationVec(1.0F);
		Vec3d muzzle = localMuzzle(client, rpg ? 1.3 : 0.9);
		if (rpg) {
			Recoil.fire(3.2F, (RANDOM.nextFloat() - 0.5F) * 1.2F, 1.0F);
			CameraShake.add(0.25F);
			muzzleFlash(client.world, muzzle, look, OrdnanceNetworking.MuzzleFlash.Kind.ROCKET);
			backblast(client.world, shooter.getEyePos().subtract(look.multiply(0.8)), look);
		} else if (weapon.getItem() instanceof GrenadeLauncherItem) {
			Recoil.fire(2.0F, (RANDOM.nextFloat() - 0.5F) * 0.8F, 0.7F);
			CameraShake.add(0.08F);
			muzzleFlash(client.world, muzzle, look, OrdnanceNetworking.MuzzleFlash.Kind.GRENADE_LAUNCHER);
		}
	}

	@Override
	public void entityTick(Entity entity) {
		if (!ParticleSprites.ready() || !(entity.getEntityWorld() instanceof ClientWorld world)) {
			return;
		}

		switch (entity) {
			case RocketEntity rocket -> this.rocketTrail(world, rocket);
			case HypersonicMissileEntity missile -> this.missileTrail(world, missile);
			case GrenadeEntity grenade -> {
				if (grenade.isEmitting()) {
					this.smokeEmitter(world, grenade);
				}
			}
			case LauncherGrenadeEntity round -> {
				if (round.isEmitting()) {
					this.smokeEmitter(world, round);
				} else if (round.getVelocity().lengthSquared() > 0.04) {
					OrdnanceParticle.builder(ParticleSprites.SMOKE).life(20, 34).size(0.08F, 0.45F).colors(0xA0C8C4C0, 0x40B0ACA8)
						.velocity(0.0, 0.01, 0.0).drag(0.95F).spawn(world, round.getEntityPos());
				}
			}
			case DebrisEntity debris -> this.debrisTrail(world, debris);
			default -> {
			}
		}
	}

	// ------------------------------------------------------------------ muzzle

	/** Muzzle position of the local first-person weapon (or the body-relative one in third person). */
	public static Vec3d localMuzzle(MinecraftClient client, double forward) {
		Camera camera = client.gameRenderer.getCamera();
		if (camera.isThirdPerson() || client.player == null) {
			return client.player == null ? camera.getCameraPos() : WeaponHelper.muzzle(client.player, forward, 0.25, 0.2);
		}

		return viewPoint(camera, client.player.getMainArm() == Arm.LEFT ? -0.28 : 0.28, -0.2, forward);
	}

	/** A point in camera space (right, up, forward) converted to world space. */
	public static Vec3d viewPoint(Camera camera, double right, double up, double forward) {
		float yaw = camera.getYaw() * MathHelper.RADIANS_PER_DEGREE;
		Vec3d fwd = Vec3d.fromPolar(camera.getPitch(), camera.getYaw());
		Vec3d rightVec = new Vec3d(-MathHelper.cos(yaw), 0.0, -MathHelper.sin(yaw));
		Vec3d upVec = rightVec.crossProduct(fwd);
		return camera.getCameraPos().add(fwd.multiply(forward)).add(rightVec.multiply(right)).add(upVec.multiply(up));
	}

	public static void remoteMuzzleFlash(ClientWorld world, Entity shooter, OrdnanceNetworking.MuzzleFlash.Kind kind) {
		if (!ParticleSprites.ready() || !(shooter instanceof LivingEntity living)) {
			return;
		}

		Vec3d look = living.getRotationVec(1.0F);
		Vec3d muzzle = WeaponHelper.muzzle(living, kind == OrdnanceNetworking.MuzzleFlash.Kind.ROCKET ? 1.2 : 0.8, 0.25, 0.2);
		muzzleFlash(world, muzzle, look, kind);
		if (kind == OrdnanceNetworking.MuzzleFlash.Kind.ROCKET) {
			backblast(world, living.getEyePos().subtract(look.multiply(0.8)), look);
		}
	}

	private static void muzzleFlash(ClientWorld world, Vec3d muzzle, Vec3d look, OrdnanceNetworking.MuzzleFlash.Kind kind) {
		if (!ConfigManager.get().visuals.muzzleFlash) {
			return;
		}

		boolean rocket = kind == OrdnanceNetworking.MuzzleFlash.Kind.ROCKET;
		OrdnanceParticle.builder(ParticleSprites.MUZZLE_FLASH).glow().emissive(1.0F, 1.0F).life(2, 2)
			.size(rocket ? 0.55F : 0.4F, rocket ? 0.9F : 0.6F).color(0xFFFFE8B0).fade(0.0F, 0.3F).spin(1.0F)
			.spawn(world, muzzle);
		OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 3)
			.size(rocket ? 1.3F : 0.8F, 0.4F).color(0xFFFFB060).alpha(0.8F)
			.spawn(world, muzzle);
		int smoke = rocket ? 8 : 4;
		for (int i = 0; i < smoke; i++) {
			Vec3d v = look.multiply(0.05 + RANDOM.nextDouble() * 0.15).add(ExplosionEffects.randomUnit(RANDOM).multiply(0.03));
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(25, 50).size(0.15F, rocket ? 1.1F : 0.6F).sizeCurve(0.6F)
				.colors(0xC0D8D4D0, 0x50C0BCB8).alpha(0.8F).velocity(v).drag(0.9F).buoyancy(0.001F)
				.spawn(world, muzzle);
		}

		for (int i = 0; i < (rocket ? 6 : 3); i++) {
			Vec3d v = ExplosionEffects.jitter(look, 0.35, RANDOM).multiply(0.4 + RANDOM.nextDouble() * 0.4);
			OrdnanceParticle.builder(ParticleSprites.SPARK).glow().emissive(1.0F, 1.0F).life(3, 7).size(0.04F, 0.01F)
				.colors(0xFFFFF0C0, 0xFFFF8030).velocity(v).gravity(0.02F).spawn(world, muzzle);
		}

		HeatHaze.addSource(muzzle, rocket ? 0.6F : 0.3F, 4.0F, 8);
	}

	/** RPG-7 exhaust venting behind the shooter: a cloud of smoke and dust. */
	private static void backblast(ClientWorld world, Vec3d origin, Vec3d look) {
		int puffs = ParticleBudget.count(16.0F, 1.0F);
		for (int i = 0; i < puffs; i++) {
			Vec3d v = ExplosionEffects.jitter(look.multiply(-1.0), 0.4, RANDOM).multiply(0.2 + RANDOM.nextDouble() * 0.35);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(40, 80).size(0.3F, 2.0F).sizeCurve(0.5F)
				.colors(0xD0D0CAC2, 0xB0B4ACA2, 0x40A89E92).alpha(0.85F).velocity(v).drag(0.88F).buoyancy(0.0015F)
				.spawn(world, origin);
		}

		OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F).life(3, 4).size(0.4F, 0.7F)
			.colors(0xFFFFE8B0, 0x00FF7020).velocity(look.multiply(-0.3)).spawn(world, origin);
	}

	// ------------------------------------------------------------------ projectiles

	private static Vec3d lastPos(Entity entity) {
		return new Vec3d(entity.lastX, entity.lastY, entity.lastZ);
	}

	private void rocketTrail(ClientWorld world, RocketEntity rocket) {
		Vec3d velocity = rocket.getVelocity();
		if (velocity.lengthSquared() < 1.0E-6) {
			return;
		}

		Vec3d dir = velocity.normalize();
		Vec3d tail = rocket.getEntityPos().subtract(dir.multiply(0.45));
		Vec3d lastTail = lastPos(rocket).subtract(dir.multiply(0.45));
		if (rocket.isMotorBurning()) {
			OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F).life(2, 3).size(0.32F, 0.12F)
				.colors(0xFFFFFFE0, 0xFFFFA040).velocity(dir.multiply(-0.15)).spawn(world, tail);
			OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 2).size(0.55F, 0.4F)
				.color(0xFFFFC070).alpha(0.7F).spawn(world, tail);
			int puffs = Math.max(1, ParticleBudget.count(3.0F, ParticleBudget.scale(distanceToCamera(tail))));
			for (int i = 0; i < puffs; i++) {
				Vec3d at = lastTail.lerp(tail, (i + RANDOM.nextDouble()) / puffs);
				OrdnanceParticle.builder(ParticleSprites.SMOKE).life(50, 90).size(0.22F, 1.4F).sizeCurve(0.5F)
					.colors(0xD8C8C2BA, 0xA8B8B2AA, 0x60A8A29C).alpha(0.8F).fade(0.0F, 0.45F)
					.velocity(ExplosionEffects.randomUnit(RANDOM).multiply(0.015)).drag(0.96F).buoyancy(0.0008F)
					.wind(Wind.velocity(world, 0.05), 0.4F).spin(0.01F)
					.spawn(world, at);
			}
		} else if (rocket.age < RocketEntity.MOTOR_IGNITION_TICK) {
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(20, 30).size(0.2F, 0.8F).colors(0xC0D0CCC6, 0x40C0BCB6)
				.spawn(world, tail);
		} else if (rocket.age % 2 == 0) {
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(20, 40).size(0.1F, 0.5F).colors(0x90B0ACA8, 0x30A8A4A0)
				.spawn(world, tail);
		}
	}

	private void missileTrail(ClientWorld world, HypersonicMissileEntity missile) {
		Vec3d velocity = missile.getVelocity();
		if (velocity.lengthSquared() < 1.0E-6) {
			return;
		}

		Vec3d dir = velocity.normalize();
		Vec3d pos = missile.getEntityPos();
		Vec3d nose = pos.add(dir.multiply(1.6));
		OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 2).size(1.8F, 1.2F)
			.color(0xFFFFD8A8).alpha(0.9F).spawn(world, nose);
		OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 2).size(0.8F, 0.6F)
			.color(0xFFFFFFFF).spawn(world, nose);
		Vec3d tail = pos.subtract(dir.multiply(2.6));
		Vec3d lastTail = lastPos(missile).subtract(dir.multiply(2.6));
		OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().emissive(1.0F, 1.0F).life(3, 4).size(0.9F, 0.4F)
			.colors(0xFFFFF0D0, 0xFFFF9040).velocity(dir.multiply(-0.4)).spawn(world, tail);
		float density = ParticleBudget.scale(distanceToCamera(pos));
		int puffs = Math.max(2, ParticleBudget.count(7.0F, density));
		for (int i = 0; i < puffs; i++) {
			Vec3d at = lastTail.lerp(tail, (i + RANDOM.nextDouble()) / puffs);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(90, 150).size(0.7F, 3.4F).sizeCurve(0.5F)
				.colors(0xE0E8E4E0, 0xB0D8D4D0, 0x50C8C4C0).alpha(0.85F).fade(0.0F, 0.5F)
				.velocity(ExplosionEffects.randomUnit(RANDOM).multiply(0.02)).drag(0.97F)
				.wind(Wind.velocity(world, 0.06), 0.3F).spin(0.008F)
				.spawn(world, at);
		}

		for (int i = 0; i < 2; i++) {
			Vec3d v = dir.multiply(-0.3).add(ExplosionEffects.randomUnit(RANDOM).multiply(0.15));
			OrdnanceParticle.builder(ParticleSprites.SPARK).glow().emissive(1.0F, 1.0F).life(6, 12).size(0.08F, 0.02F)
				.colors(0xFFFFF0C0, 0xFFFF7020).velocity(v).gravity(0.02F).spawn(world, nose);
		}
	}

	private void smokeEmitter(ClientWorld world, Entity canister) {
		Vec3d pos = canister.getEntityPos().add(0.0, 0.15, 0.0);
		int puffs = ParticleBudget.count(3.0F, ParticleBudget.scale(distanceToCamera(pos)));
		Vec3d wind = Wind.velocity(world, 0.05);
		for (int i = 0; i < puffs; i++) {
			Vec3d v = new Vec3d((RANDOM.nextDouble() - 0.5) * 0.08, 0.06 + RANDOM.nextDouble() * 0.07, (RANDOM.nextDouble() - 0.5) * 0.08);
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(160, 260).size(0.4F, 3.3F).sizeCurve(0.45F)
				.colors(0xF8F2F2EE, 0xEAE2E2DE, 0xC0D2D2CE).colorMidPoint(0.3F).alpha(0.95F).fade(0.03F, 0.6F)
				.velocity(v).drag(0.95F).buoyancy(0.0006F).wind(wind, 0.35F).spin(0.008F)
				.spawn(world, pos);
		}

		SmokeVolumes.attach(canister, 6.5F, 0.95F, 0xD6D6D2);
	}

	private void debrisTrail(ClientWorld world, DebrisEntity debris) {
		Vec3d pos = debris.getEntityPos().add(0.0, 0.2, 0.0);
		if (debris.isOnFire()) {
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(30, 60).size(0.2F, 1.1F).colors(0xD0262220, 0x40504A44)
				.velocity(0.0, 0.03, 0.0).drag(0.95F).spawn(world, pos);
			if (debris.age % 3 == 0) {
				OrdnanceParticle.builder(ParticleSprites.EMBER).glow().emissive(1.0F, 1.0F).life(20, 40).size(0.05F, 0.02F)
					.colors(0xFFFFC060, 0xFFFF5010).buoyancy(0.002F).spawn(world, pos);
			}
		} else if (debris.getVelocity().lengthSquared() > 0.16 && debris.age % 2 == 0) {
			OrdnanceParticle.builder(ParticleSprites.DUST).life(15, 30).size(0.15F, 0.6F).colors(0x908C8278, 0x30A09890)
				.drag(0.9F).spawn(world, pos);
		}
	}

	private static double distanceToCamera(Vec3d pos) {
		MinecraftClient client = MinecraftClient.getInstance();
		return client.gameRenderer == null ? 0.0 : client.gameRenderer.getCamera().getCameraPos().distanceTo(pos);
	}

	// ------------------------------------------------------------------ held-weapon effects (per client tick)

	public static void tick(MinecraftClient client) {
		ClientWorld world = client.world;
		if (world == null || client.player == null || !ParticleSprites.ready()) {
			return;
		}

		Vec3d camera = client.gameRenderer.getCamera().getCameraPos();
		for (AbstractClientPlayerEntity player : world.getPlayers()) {
			if (player.squaredDistanceTo(camera) > 128.0 * 128.0 || !player.isUsingItem()) {
				continue;
			}

			ItemStack active = player.getActiveItem();
			if (active.getItem() instanceof FlamethrowerItem && FlamethrowerItem.isFiring(player, active)) {
				flameStream(client, world, player);
			} else if (active.getItem() instanceof StrikeDesignatorItem) {
				laser(client, world, player);
			}
		}

		FLAME_SOUNDS.values().removeIf(EntityLoopSound::isDone);
	}

	private static void flameStream(MinecraftClient client, ClientWorld world, AbstractClientPlayerEntity player) {
		boolean local = player == client.player && !client.gameRenderer.getCamera().isThirdPerson();
		Vec3d look = player.getRotationVec(1.0F);
		Vec3d nozzle = local ? localMuzzle(client, 0.95) : WeaponHelper.muzzle(player, 0.9, 0.25, 0.25);
		float range = ConfigManager.get().weapons.flamethrower.range;
		float density = ParticleBudget.scale(distanceToCamera(nozzle));
		int n = Math.max(2, ParticleBudget.count(7.0F, density));
		Vec3d inherited = player.getVelocity();
		for (int i = 0; i < n; i++) {
			Vec3d spread = new Vec3d(RANDOM.nextGaussian(), RANDOM.nextGaussian(), RANDOM.nextGaussian()).multiply(0.035);
			Vec3d v = look.add(spread).normalize().multiply(0.95 * range * (0.9 + RANDOM.nextDouble() * 0.2)).add(inherited);
			Vec3d start = nozzle.add(look.multiply(RANDOM.nextDouble() * 0.9));
			OrdnanceParticle.builder(ParticleSprites.FLAME).animated().glow().life(18, 24).size(0.1F, 1.25F).sizeCurve(0.7F)
				.colors(0xFFFFF4D0, 0xFFFF8A2A, 0x00702008).colorMidPoint(0.3F).fade(0.0F, 0.6F).emissive(1.0F, 1.0F)
				.velocity(v).gravity(0.012F).drag(0.93F).collide().spin(0.15F)
				.onDeath(p -> {
					if (RANDOM.nextInt(3) == 0) {
						ExplosionEffects.trailSmoke(world, p.getPos(), 0.9F, 0xC0201C18);
					}
				})
				.spawn(world, start);
		}

		OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 3).size(0.18F, 0.1F)
			.color(0xFFB8D8FF).velocity(look.multiply(0.4)).spawn(world, nozzle);
		if (RANDOM.nextInt(2) == 0) {
			Vec3d mid = nozzle.add(look.multiply(5.0 + RANDOM.nextDouble() * 5.0));
			OrdnanceParticle.builder(ParticleSprites.SMOKE).life(40, 70).size(0.5F, 2.4F).sizeCurve(0.5F)
				.colors(0xB0201C18, 0x80403A34, 0x30605A54).alpha(0.8F).velocity(look.multiply(0.3).add(0.0, 0.05, 0.0)).drag(0.92F)
				.buoyancy(0.002F).spawn(world, mid);
		}

		HeatHaze.addSource(nozzle.add(look.multiply(3.0)), player == client.player ? 0.85F : 0.55F, 9.0F, 4);
		EntityLoopSound sound = FLAME_SOUNDS.get(player.getId());
		if (sound == null || sound.isDone()) {
			sound = new EntityLoopSound(player, ModSounds.FLAMETHROWER_LOOP, SoundCategory.PLAYERS, 1.0F, 1.0F,
				e -> e instanceof LivingEntity living && FlamethrowerItem.isFiring(living, living.getActiveItem()));
			client.getSoundManager().play(sound);
			FLAME_SOUNDS.put(player.getId(), sound);
		}
	}

	private static void laser(MinecraftClient client, ClientWorld world, AbstractClientPlayerEntity player) {
		BlockHitResult hit = StrikeDesignatorItem.raycastTarget(player, 1.0F);
		if (hit == null) {
			return;
		}

		boolean local = player == client.player;
		Vec3d start = local ? localMuzzle(client, 0.6) : WeaponHelper.muzzle(player, 0.5, 0.2, 0.15);
		Vec3d end = hit.getPos();
		double length = start.distanceTo(end);
		boolean locked = local && StrikeDesignatorItem.lockProgress(player) >= 1.0F;
		int color = locked ? 0xFFFF2020 : 0xFFFF5050;
		int dots = (int)Math.min(96.0, length / 1.6);
		for (int i = 1; i <= dots; i++) {
			Vec3d at = start.lerp(end, (i - RANDOM.nextDouble()) / dots);
			OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(1, 2).size(0.035F, 0.03F)
				.color(color).alpha(0.6F).fade(0.0F, 1.0F).spawn(world, at);
		}

		float pulse = 0.25F + 0.1F * MathHelper.sin(world.getTime() * 0.8F);
		OrdnanceParticle.builder(ParticleSprites.GLOW).glow().emissive(1.0F, 1.0F).life(2, 2).size(pulse, pulse)
			.color(color).spawn(world, end.add(Vec3d.of(hit.getSide().getVector()).multiply(0.05)));
	}

	public static void clear() {
		FLAME_SOUNDS.clear();
	}
}
