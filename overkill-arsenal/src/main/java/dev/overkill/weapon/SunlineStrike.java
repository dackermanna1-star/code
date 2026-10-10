package dev.overkill.weapon;

import dev.overkill.network.Fx;
import dev.overkill.network.FxKind;
import dev.overkill.registry.ModDamageTypes;
import dev.overkill.registry.ModEffects;
import dev.overkill.registry.ModGameRules;
import dev.overkill.registry.ModItems;
import dev.overkill.registry.ModParticles;
import dev.overkill.util.Devastation;
import dev.overkill.util.ServerProcesses;
import dev.overkill.util.Targeting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.particles.ExplosionParticleInfo;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.util.random.WeightedList;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
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
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * One Sunline Rifle shot. While the trigger is held the laser follows the shooter's aim like a laser
 * pointer, leaving nothing behind, but every spot it lands on is remembered. When the trigger is let
 * go (or after 6 seconds) the shot arms, and 0.6 seconds later every one of those spots erupts in
 * turn, in the order it was pointed at. Anything the laser touched explodes wherever it has run off to.
 */
public final class SunlineStrike implements ServerProcesses.Process {
	public static final double RANGE = 160.0;
	/** Longest the beam can be held: 6 seconds. */
	public static final int MAX_AIM_TICKS = 120;
	/** 0.6 seconds between letting go and the first detonation. */
	public static final int FUSE_TICKS = 12;
	public static final int COOLDOWN_TICKS = 120;
	/** Remembered spots are this far apart along the laser's path. */
	private static final double SPACING = 2.2;
	private static final int MAX_POINTS = 360;
	private static final int MAX_MARKED = 64;
	/** Extra traces between two ticks' aims, so a fast sweep still leaves no gaps. */
	private static final int MAX_SUBSTEPS = 24;
	/** Holding the beam on a spot this long makes it detonate at full heat. */
	private static final int MAX_DWELL = 30;
	/** TNT is 4. */
	private static final float BASE_POWER = 5.5F;
	private static final float FINAL_POWER = 9.0F;
	private static final float MARK_POWER = 4.0F;
	/** Explosion power spent per tick, so a long sweep erupts over a second or two instead of freezing one tick. */
	private static final float POWER_PER_TICK = 48.0F;

	static final WeightedList<ExplosionParticleInfo> BLAST_PARTICLES = WeightedList.<ExplosionParticleInfo>builder()
		.add(new ExplosionParticleInfo(ModParticles.EMBER, 0.6F, 1.4F), 3)
		.add(new ExplosionParticleInfo(ModParticles.HEAVY_SMOKE, 0.9F, 0.35F), 3)
		.add(new ExplosionParticleInfo(ModParticles.FIRE_BURST, 0.7F, 0.6F), 2)
		.add(new ExplosionParticleInfo(ModParticles.CHAR_FLAKE, 0.5F, 1.0F), 1)
		.build();

	private enum Phase {
		AIMING, FUSE, DETONATING
	}

	private static final class Point {
		final Vec3 pos;
		int dwell;

		Point(Vec3 pos) {
			this.pos = pos;
		}
	}

	private record Marked(LivingEntity entity, int pointIndex) {
	}

	private record Trace(Vec3 end, @Nullable BlockPos block) {
		boolean hit() {
			return this.block != null;
		}
	}

	private final Player owner;
	private final InteractionHand hand;
	private final ItemStack stack;
	private final List<Point> points = new ArrayList<>();
	private final List<Marked> marked = new ArrayList<>();
	private final Set<Integer> markedIds = new HashSet<>();
	private Phase phase = Phase.AIMING;
	private int age;
	private int phaseAge;
	private int nextPoint;
	private int nextMark;
	private @Nullable Vec3 lastEye;
	private @Nullable Vec3 lastLook;
	private @Nullable Vec3 lastEnd;

	private SunlineStrike(Player owner, InteractionHand hand, ItemStack stack) {
		this.owner = owner;
		this.hand = hand;
		this.stack = stack;
	}

	/** Pulls the trigger: the laser switches on and follows the shooter's aim until they let go. */
	public static void start(ServerLevel level, Player shooter, InteractionHand hand, ItemStack stack) {
		Vec3 look = shooter.getViewVector(1.0F);
		Vec3 muzzle = muzzle(shooter, hand, look);
		Fx.send(level, muzzle, 96.0, FxKind.MUZZLE_FLASH, muzzle, look, 1.0F, FxKind.WEAPON_SUNLINE);
		level.playSound(null, shooter.getX(), shooter.getY(), shooter.getZ(), SoundEvents.WARDEN_SONIC_BOOM, SoundSource.PLAYERS, 1.1F, 1.85F);
		level.playSound(null, shooter.getX(), shooter.getY(), shooter.getZ(), SoundEvents.BEACON_ACTIVATE, SoundSource.PLAYERS, 1.6F, 2.0F);
		if (shooter instanceof ServerPlayer serverPlayer) {
			Fx.shake(serverPlayer, 1.0F, 6);
		}
		SunlineStrike strike = new SunlineStrike(shooter, hand, stack);
		strike.aim(level);
		ServerProcesses.add(level, strike);
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

	private Trace trace(ServerLevel level, Vec3 eye, Vec3 look) {
		Vec3 far = eye.add(look.scale(RANGE));
		BlockHitResult hit = level.clip(new ClipContext(eye, far, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, this.owner));
		return hit.getType() == HitResult.Type.MISS ? new Trace(far, null) : new Trace(hit.getLocation(), hit.getBlockPos());
	}

	private boolean stillHolding() {
		return this.owner.isAlive() && !this.owner.isRemoved() && this.owner.isUsingItem()
			&& this.owner.getUseItem().is(ModItems.SUNLINE_RIFLE) && this.phaseAge < MAX_AIM_TICKS;
	}

	@Override
	public boolean tick(ServerLevel level) {
		this.age++;
		this.phaseAge++;
		return switch (this.phase) {
			case AIMING -> {
				if (this.stillHolding()) {
					this.aim(level);
				} else {
					this.arm(level);
				}
				yield false;
			}
			case FUSE -> {
				if (this.phaseAge == FUSE_TICKS / 2 && !this.points.isEmpty()) {
					Vec3 last = this.points.getLast().pos;
					level.playSound(null, last.x, last.y, last.z, SoundEvents.BEACON_POWER_SELECT, SoundSource.PLAYERS, 2.5F, 1.9F);
				}
				if (this.phaseAge >= FUSE_TICKS) {
					this.phase = Phase.DETONATING;
					this.phaseAge = 0;
				}
				yield false;
			}
			case DETONATING -> this.detonateSome(level);
		};
	}

	// ------------------------------------------------------------------------------------------
	// Aiming
	// ------------------------------------------------------------------------------------------

	private void aim(ServerLevel level) {
		Vec3 eye = this.owner.getEyePosition();
		Vec3 look = this.owner.getViewVector(1.0F);
		Trace now = this.trace(level, eye, look);
		Vec3 muzzle = muzzle(this.owner, this.hand, look);

		// Fill in the path between last tick's aim and this one.
		if (this.lastEye != null && this.lastLook != null && this.lastEnd != null) {
			int steps = Mth.clamp(Mth.ceil(this.lastEnd.distanceTo(now.end()) / SPACING), 1, MAX_SUBSTEPS);
			for (int i = 1; i < steps; i++) {
				double t = (double) i / steps;
				Vec3 dir = this.lastLook.lerp(look, t).normalize();
				Trace between = this.trace(level, this.lastEye.lerp(eye, t), dir);
				if (between.hit()) {
					this.addPoint(between, false);
				}
			}
		}
		if (now.hit()) {
			this.addPoint(now, true);
		}
		this.lastEye = eye;
		this.lastLook = look;
		this.lastEnd = now.end();

		// Everything the laser passes through is marked and set alight.
		boolean burnTick = this.age % 5 == 0;
		for (LivingEntity target : entitiesOnLine(level, this.owner, eye, now.end())) {
			if (this.markedIds.size() < MAX_MARKED && this.markedIds.add(target.getId())) {
				this.marked.add(new Marked(target, this.points.size()));
				target.addEffect(new MobEffectInstance(ModEffects.SUNMARKED, MAX_AIM_TICKS + FUSE_TICKS + 200, 0), this.owner);
				target.addEffect(new MobEffectInstance(MobEffects.GLOWING, MAX_AIM_TICKS + FUSE_TICKS + 200, 0, false, false), this.owner);
				target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, this.owner), 6.0F);
				target.igniteForSeconds(4.0F);
			} else if (burnTick) {
				target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, this.owner), 3.0F);
				target.igniteForSeconds(4.0F);
			}
		}

		double half = now.end().distanceTo(muzzle) / 2.0;
		Vec3 mid = muzzle.add(now.end()).scale(0.5);
		Fx.send(level, mid, half + 128.0, FxKind.SUNLINE_BEAM, muzzle, now.end(), now.hit() ? 1.0F : 0.0F, level.random.nextInt());

		if (this.age % 4 == 1) {
			level.playSound(null, this.owner.getX(), this.owner.getY(), this.owner.getZ(), SoundEvents.BEACON_AMBIENT, SoundSource.PLAYERS, 1.4F, 2.0F);
		}
		if (now.hit() && this.age % 3 == 0) {
			Vec3 end = now.end();
			level.playSound(null, end.x, end.y, end.z, SoundEvents.LAVA_EXTINGUISH, SoundSource.PLAYERS, 0.7F, 1.6F + level.random.nextFloat() * 0.3F);
		}
		if (this.owner instanceof ServerPlayer serverPlayer && this.age % 5 == 0) {
			Fx.shake(serverPlayer, 0.25F, 4);
		}
	}

	private void addPoint(Trace trace, boolean aimed) {
		Vec3 pos = trace.end();
		double minGap = SPACING * 0.8;
		for (int i = this.points.size() - 1; i >= 0; i--) {
			Point point = this.points.get(i);
			if (point.pos.distanceToSqr(pos) < minGap * minGap) {
				// Holding the beam on a spot heats it up.
				if (aimed && point.dwell < MAX_DWELL) {
					point.dwell++;
				}
				return;
			}
		}
		if (this.points.size() < MAX_POINTS) {
			this.points.add(new Point(pos));
		}
	}

	// ------------------------------------------------------------------------------------------
	// Detonation
	// ------------------------------------------------------------------------------------------

	private void arm(ServerLevel level) {
		this.phase = Phase.FUSE;
		this.phaseAge = 0;
		this.owner.getCooldowns().addCooldown(this.stack, this.points.isEmpty() && this.marked.isEmpty() ? 20 : COOLDOWN_TICKS);

		// No warning glow: the only tell is a rising hum from everywhere the laser touched.
		level.playSound(null, this.owner.getX(), this.owner.getY(), this.owner.getZ(), SoundEvents.BEACON_DEACTIVATE, SoundSource.PLAYERS, 1.2F, 1.8F);
		for (int i = 0; i < this.points.size(); i += Math.max(1, this.points.size() / 4)) {
			Vec3 at = this.points.get(i).pos;
			level.playSound(null, at.x, at.y, at.z, SoundEvents.RESPAWN_ANCHOR_CHARGE, SoundSource.PLAYERS, 2.0F, 1.6F);
		}
	}

	private @Nullable Entity source() {
		return this.owner.isAlive() && !this.owner.isRemoved() ? this.owner : null;
	}

	/** @return true once everything has gone off. */
	private boolean detonateSome(ServerLevel level) {
		float budget = POWER_PER_TICK;
		while (budget > 0.0F && this.nextPoint < this.points.size()) {
			int index = this.nextPoint++;
			budget -= this.detonate(level, this.points.get(index), index, index == this.points.size() - 1);
			// Marked targets go off when the sweep reaches the part of the path they were caught on.
			while (this.nextMark < this.marked.size() && this.marked.get(this.nextMark).pointIndex() <= this.nextPoint) {
				budget -= this.detonateMark(level, this.marked.get(this.nextMark++));
			}
		}
		if (this.nextPoint >= this.points.size()) {
			while (this.nextMark < this.marked.size()) {
				this.detonateMark(level, this.marked.get(this.nextMark++));
			}
			this.finale(level);
			return true;
		}
		return false;
	}

	private float detonate(ServerLevel level, Point point, int index, boolean last) {
		Entity source = this.source();
		Vec3 pos = point.pos;
		float heat = point.dwell / (float) MAX_DWELL;
		float power = BASE_POWER * (1.0F + 0.6F * heat);
		if (last) {
			power = Math.max(power, FINAL_POWER);
		}
		Holder<SoundEvent> sound = index % 4 == 0 || last
			? SoundEvents.GENERIC_EXPLODE
			: BuiltInRegistries.SOUND_EVENT.wrapAsHolder(SoundEvents.FIRECHARGE_USE);
		level.explode(source, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, source), new OwnerSafeCalculator(source),
			pos.x, pos.y, pos.z, power, ModGameRules.fire(level), ModGameRules.terrain(level) ? Level.ExplosionInteraction.BLOCK : Level.ExplosionInteraction.NONE,
			ParticleTypes.EXPLOSION, last ? ParticleTypes.EXPLOSION_EMITTER : ParticleTypes.EXPLOSION, BLAST_PARTICLES, sound);
		Devastation.scorchSphere(level, pos, 2.6 + heat * 1.6, level.random);
		Fx.send(level, pos, 192.0, FxKind.SUNLINE_BLAST, pos, Vec3.ZERO, last ? 2.6F : 1.1F + heat, level.random.nextInt());
		if (index % 6 == 0) {
			Fx.shake(level, pos, 48.0, 1.1F, 8);
		}
		return power;
	}

	private float detonateMark(ServerLevel level, Marked mark) {
		LivingEntity target = mark.entity();
		if (!target.isAlive() || !target.hasEffect(ModEffects.SUNMARKED)) {
			return 0.0F;
		}
		Entity source = this.source();
		target.removeEffect(ModEffects.SUNMARKED);
		target.removeEffect(MobEffects.GLOWING);
		Vec3 pos = target.getBoundingBox().getCenter();
		level.explode(source, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, source), new OwnerSafeCalculator(source),
			pos.x, pos.y, pos.z, MARK_POWER, ModGameRules.fire(level), ModGameRules.terrain(level) ? Level.ExplosionInteraction.BLOCK : Level.ExplosionInteraction.NONE,
			ParticleTypes.EXPLOSION, ParticleTypes.EXPLOSION, BLAST_PARTICLES, SoundEvents.GENERIC_EXPLODE);
		target.invulnerableTime = 0;
		target.hurtServer(level, ModDamageTypes.source(level, ModDamageTypes.SUNLINE, source), 30.0F);
		target.igniteForSeconds(10.0F);
		target.addEffect(new MobEffectInstance(ModEffects.SEARING, 200, 1), source);
		target.push(0.0, 0.6, 0.0);
		target.hurtMarked = true;
		Fx.send(level, pos, 192.0, FxKind.SUNLINE_BLAST, pos, Vec3.ZERO, 1.6F, level.random.nextInt());
		return MARK_POWER;
	}

	private void finale(ServerLevel level) {
		if (this.points.isEmpty()) {
			return;
		}
		var random = level.random;
		Point hottest = this.points.getFirst();
		for (Point point : this.points) {
			if (point.dwell > hottest.dwell) {
				hottest = point;
			}
		}
		Vec3 end = this.points.getLast().pos;
		Devastation.scorchSphere(level, end, 6.0, random);
		Devastation.moltenSplash(level, end, 5.0, random);
		Devastation.ejectDebris(level, end, 4.0, 16, 1.0, random);
		if (hottest.dwell > MAX_DWELL / 3 && hottest.pos.distanceTo(end) > 6.0) {
			Devastation.moltenSplash(level, hottest.pos, 4.0, random);
			Devastation.ejectDebris(level, hottest.pos, 3.0, 10, 0.9, random);
		}
		level.playSound(null, end.x, end.y, end.z, SoundEvents.LIGHTNING_BOLT_THUNDER, SoundSource.PLAYERS, 4.0F, 1.3F);
		Fx.shake(level, end, 96.0, 2.6F, 16);
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
