package dev.overkill.weapon;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.Devastation;
import dev.overkill.util.ServerProcesses;
import dev.overkill.util.Targeting;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ExplosionParticleInfo;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.random.WeightedList;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.ExplosionDamageCalculator;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The Sunline Rifle's shot: an instant trace, a 0.6 second fuse while the line glows, then a chain
 * of fiery detonations racing from the muzzle to the impact point.
 */
public final class SunlineStrike implements ServerProcesses.Process {
	public static final double RANGE = 160.0;
	/** 0.6 seconds between the trace and the first detonation. */
	public static final int FUSE_TICKS = 12;
	private static final double SPACING = 2.5;
	private static final double FIRST_BLAST = 4.0;
	/** The whole line finishes detonating in this many ticks. */
	private static final int SWEEP_TICKS = 8;

	static final WeightedList<ExplosionParticleInfo> BLAST_PARTICLES = WeightedList.<ExplosionParticleInfo>builder()
		.add(new ExplosionParticleInfo(ModParticles.EMBER, 0.6F, 1.4F), 3)
		.add(new ExplosionParticleInfo(ModParticles.HEAVY_SMOKE, 0.9F, 0.35F), 3)
		.add(new ExplosionParticleInfo(ModParticles.FIRE_BURST, 0.7F, 0.6F), 2)
		.add(new ExplosionParticleInfo(ModParticles.CHAR_FLAKE, 0.5F, 1.0F), 1)
		.build();

	private final @Nullable Entity owner;
	private final List<Vec3> points = new ArrayList<>();
	private final List<Marked> marked;
	private final Vec3 start;
	private final Vec3 end;
	private int age;
	private int nextPoint;

	private record Marked(LivingEntity entity, double distance) {
	}

	private SunlineStrike(@Nullable Entity owner, Vec3 start, Vec3 end, List<Marked> marked) {
		this.owner = owner;
		this.start = start;
		this.end = end;
		this.marked = marked;
		Vec3 dir = end.subtract(start);
		double length = dir.length();
		Vec3 unit = length > 1.0E-4 ? dir.scale(1.0 / length) : Vec3.ZERO;
		for (double d = FIRST_BLAST; d < length - 1.0; d += SPACING) {
			this.points.add(start.add(unit.scale(d)));
		}
		this.points.add(end);
	}

	/** Fires the rifle: traces the beam, marks everything on it and arms the fuse. */
	public static void fire(ServerLevel level, Player shooter, InteractionHand hand) {
		Vec3 eye = shooter.getEyePosition();
		Vec3 look = shooter.getViewVector(1.0F);
		Vec3 far = eye.add(look.scale(RANGE));
		BlockHitResult hit = level.clip(new ClipContext(eye, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, shooter));
		Vec3 end = hit.getType() == HitResult.Type.MISS ? far : hit.getLocation();
		Vec3 muzzle = muzzle(shooter, hand, look);

		List<Marked> marked = new ArrayList<>();
		for (LivingEntity target : entitiesOnLine(level, shooter, eye, end)) {
			marked.add(new Marked(target, target.position().distanceTo(eye)));
			target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, shooter), 6.0F);
			target.addEffect(new MobEffectInstance(ModEffects.SUNMARKED, FUSE_TICKS + SWEEP_TICKS + 4, 0), shooter);
			target.addEffect(new MobEffectInstance(MobEffects.GLOWING, FUSE_TICKS + SWEEP_TICKS + 4, 0, false, false), shooter);
			target.igniteForSeconds(2.0F);
		}

		double half = end.distanceTo(muzzle) / 2.0;
		Vec3 mid = muzzle.add(end).scale(0.5);
		Fx.send(level, mid, half + 128.0, FxKind.SUNLINE_TRACE, muzzle, end, 1.0F, level.random.nextInt());
		Fx.send(level, muzzle, 96.0, FxKind.MUZZLE_FLASH, muzzle, look, 1.0F, FxKind.WEAPON_SUNLINE);

		level.playSound(null, shooter.getX(), shooter.getY(), shooter.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.1F, 1.85F);
		level.playSound(null, shooter.getX(), shooter.getY(), shooter.getZ(), SoundEvents.BEACON_ACTIVATE, SoundSource.PLAYERS, 1.6F, 2.0F);
		level.playSound(null, end.x, end.y, end.z, SoundEvents.AMETHYST_BLOCK_RESONATE, SoundSource.PLAYERS, 2.5F, 0.6F);
		if (shooter instanceof ServerPlayer serverPlayer) {
			Fx.shake(serverPlayer, 1.4F, 7);
		}
		shooter.push(look.scale(-0.12));
		shooter.hurtMarked = true;

		ServerProcesses.add(level, new SunlineStrike(shooter, muzzle, end, marked));
	}

	private static Vec3 muzzle(Player shooter, InteractionHand hand, Vec3 look) {
		HumanoidArm arm = hand == InteractionHand.MAIN_HAND ? shooter.getMainArm() : shooter.getMainArm().getOpposite();
		Vec3 right = look.cross(new Vec3(0.0, 1.0, 0.0));
		right = right.lengthSqr() < 1.0E-4 ? new Vec3(1.0, 0.0, 0.0) : right.normalize();
		double side = arm == HumanoidArm.RIGHT ? 0.33 : -0.33;
		return shooter.getEyePosition().add(look.scale(0.9)).add(right.scale(side)).add(0.0, -0.24, 0.0);
	}

	/** Every living thing whose (slightly padded) hitbox the segment passes through, nearest first. */
	static List<LivingEntity> entitiesOnLine(ServerLevel level, Entity shooter, Vec3 from, Vec3 to) {
		Set<LivingEntity> found = new LinkedHashSet<>();
		Vec3 dir = to.subtract(from);
		double length = dir.length();
		int segments = Math.max(1, (int) Math.ceil(length / 8.0));
		for (int i = 0; i < segments; i++) {
			Vec3 a = from.add(dir.scale((double) i / segments));
			Vec3 b = from.add(dir.scale((double) (i + 1) / segments));
			AABB box = new AABB(a, b).inflate(2.0);
			for (Entity entity : level.getEntities(shooter, box, e -> e instanceof LivingEntity && Targeting.canHurt(shooter, e))) {
				if (entity.getBoundingBox().inflate(0.45).clip(from, to).isPresent()) {
					found.add((LivingEntity) entity);
				}
			}
		}
		List<LivingEntity> list = new ArrayList<>(found);
		list.sort(Comparator.comparingDouble(e -> e.distanceToSqr(from)));
		return list;
	}

	@Override
	public boolean tick(ServerLevel level) {
		this.age++;
		if (this.age == FUSE_TICKS / 2) {
			level.playSound(null, this.end.x, this.end.y, this.end.z, SoundEvents.BEACON_POWER_SELECT, SoundSource.PLAYERS, 2.0F, 1.9F);
			Vec3 mid = this.start.add(this.end).scale(0.5);
			level.playSound(null, mid.x, mid.y, mid.z, SoundEvents.RESPAWN_ANCHOR_CHARGE, SoundSource.PLAYERS, 2.0F, 1.6F);
		}
		if (this.age < FUSE_TICKS) {
			return false;
		}

		int perTick = Math.max(2, (int) Math.ceil(this.points.size() / (double) SWEEP_TICKS));
		for (int i = 0; i < perTick && this.nextPoint < this.points.size(); i++) {
			int index = this.nextPoint++;
			this.detonate(level, this.points.get(index), index == this.points.size() - 1, index);
		}
		if (this.nextPoint >= this.points.size()) {
			this.finale(level);
			return true;
		}
		return false;
	}

	private void detonate(ServerLevel level, Vec3 point, boolean impact, int index) {
		Entity source = this.owner != null && this.owner.isAlive() ? this.owner : null;
		boolean terrain = ModGameRules.terrain(level);
		float power = impact ? 4.8F : 2.7F;
		Holder<SoundEvent> sound = index % 3 == 0 || impact
			? SoundEvents.GENERIC_EXPLODE
			: BuiltInRegistries.SOUND_EVENT.wrapAsHolder(SoundEvents.FIRECHARGE_USE);
		level.explode(source, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, source), new OwnerSafeCalculator(source),
			point.x, point.y, point.z, power, ModGameRules.fire(level), terrain ? Level.ExplosionInteraction.TNT : Level.ExplosionInteraction.NONE,
			ParticleTypes.EXPLOSION, ParticleTypes.EXPLOSION, BLAST_PARTICLES, sound);
		Fx.send(level, point, 128.0, FxKind.SUNLINE_BLAST, point, Vec3.ZERO, impact ? 2.2F : 1.0F, level.random.nextInt());

		// Marked targets the sweep has reached get the "disintegrate" bonus.
		double reached = point.distanceTo(this.start) + SPACING;
		for (Marked mark : this.marked) {
			LivingEntity target = mark.entity();
			if (mark.distance() <= reached && target.isAlive() && target.hasEffect(ModEffects.SUNMARKED)) {
				target.removeEffect(ModEffects.SUNMARKED);
				target.invulnerableTime = 0;
				target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, source), 22.0F);
				target.igniteForSeconds(8.0F);
				target.addEffect(new MobEffectInstance(ModEffects.SEARING, 160, 1), source);
				target.push(0.0, 0.45, 0.0);
				target.hurtMarked = true;
			}
		}
	}

	private void finale(ServerLevel level) {
		var random = level.random;
		for (int i = 0; i < this.points.size(); i += 2) {
			Devastation.scorchSphere(level, this.points.get(i), 3.0, random);
		}
		Devastation.scorchSphere(level, this.end, 5.0, random);
		Devastation.moltenSplash(level, this.end, 4.0, random);
		Devastation.ejectDebris(level, this.end, 3.0, 10, 0.9, random);
		level.playSound(null, this.end.x, this.end.y, this.end.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 3.0F, 1.4F);
		Vec3 mid = this.start.add(this.end).scale(0.5);
		Fx.shake(level, mid, this.start.distanceTo(this.end) / 2.0 + 40.0, 2.2F, 14);
	}

	/** Explosion settings that never hurt or fling the shooter, their pets or their allies. */
	static final class OwnerSafeCalculator extends ExplosionDamageCalculator {
		private final @Nullable Entity owner;

		OwnerSafeCalculator(@Nullable Entity owner) {
			this.owner = owner;
		}

		@Override
		public boolean shouldDamageEntity(Explosion explosion, Entity entity) {
			return Targeting.canAffect(this.owner, entity) && super.shouldDamageEntity(explosion, entity);
		}

		@Override
		public float getKnockbackMultiplier(Entity entity) {
			return Targeting.canAffect(this.owner, entity) ? 1.0F : 0.0F;
		}
	}
}
