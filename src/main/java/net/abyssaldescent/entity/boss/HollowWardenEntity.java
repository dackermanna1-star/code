package net.abyssaldescent.entity.boss;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.abyssaldescent.entity.DungeonMobs;
import net.abyssaldescent.entity.MobInfo;
import net.abyssaldescent.entity.fx.TelegraphEntity;
import net.abyssaldescent.entity.projectile.SoulBoltEntity;
import net.abyssaldescent.registry.ModDamageTypes;
import net.abyssaldescent.registry.ModEntities;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.ChatFormatting;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AnimationState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * The Hollow Warden, keeper of the Forgotten Halls (floor 5).
 *
 * <ul>
 * <li><b>Phase 1</b>: Cleave (frontal cone, shield-blockable), Ground Slam (point-blank ring, step out), Grave Eruption
 * (soul fire bursts under each delver, keep moving) and Soul Charge (marked dash; dodge it into a wall and the Warden is
 * stunned and takes extra damage).</li>
 * <li><b>Phase 2</b> (60%): roars, raises the dead from the sarcophagi, adds Soul Volley (fans of bolts; use the pillars
 * or a shield).</li>
 * <li><b>Phase 3</b> (25%): the soul fire flares: faster, double cleaves, eruptions chase you, the slam leaves burning
 * ground.</li>
 * </ul>
 */
public class HollowWardenEntity extends DungeonBossEntity {
	public static final int ACTION_SEATED = 10;
	public static final int ACTION_AWAKEN = 9;
	public static final int ACTION_CLEAVE = 1;
	public static final int ACTION_CLEAVE_BACK = 2;
	public static final int ACTION_SLAM = 3;
	public static final int ACTION_ERUPT = 4;
	public static final int ACTION_CHARGE_WINDUP = 5;
	public static final int ACTION_CHARGING = 6;
	public static final int ACTION_STUNNED = 7;
	public static final int ACTION_VOLLEY = 8;
	public static final int ACTION_ROAR = 11;
	public static final int ACTION_DEATH = 12;

	private static final int SOUL_BLUE = 0xC056D8FF;
	private static final int SOUL_PALE = 0xB0C8F4FF;
	private static final int DANGER = 0xC8FF5050;

	public final AnimationState seatedAnimation = new AnimationState();
	public final AnimationState awakenAnimation = new AnimationState();
	public final AnimationState cleaveAnimation = new AnimationState();
	public final AnimationState cleaveBackAnimation = new AnimationState();
	public final AnimationState slamAnimation = new AnimationState();
	public final AnimationState eruptAnimation = new AnimationState();
	public final AnimationState chargeWindupAnimation = new AnimationState();
	public final AnimationState chargingAnimation = new AnimationState();
	public final AnimationState stunnedAnimation = new AnimationState();
	public final AnimationState volleyAnimation = new AnimationState();
	public final AnimationState roarAnimation = new AnimationState();
	public final AnimationState deathAnimation = new AnimationState();

	private enum Attack {
		CLEAVE,
		SLAM,
		ERUPTION,
		CHARGE,
		VOLLEY,
		RAISE_DEAD
	}

	@Nullable
	private Attack current;
	private int attackTick;
	private int attackLength;
	private int globalCooldown = 30;
	private final int[] cooldowns = new int[Attack.values().length];
	private Vec3 lockedDir = Vec3.ZERO;
	private final List<Vec3> eruptionPoints = new ArrayList<>();
	private final List<UUID> minions = new ArrayList<>();
	private final List<UUID> chargeHits = new ArrayList<>();
	private int lastCombo;
	private int raiseTimer = 600;
	private int stunTicks;

	public HollowWardenEntity(EntityType<? extends Monster> type, Level level) {
		super(type, level);
		setAction(ACTION_SEATED);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
			.add(Attributes.MAX_HEALTH, 320.0)
			.add(Attributes.ATTACK_DAMAGE, 11.0)
			.add(Attributes.ATTACK_KNOCKBACK, 1.2)
			.add(Attributes.MOVEMENT_SPEED, 0.26)
			.add(Attributes.ARMOR, 8.0)
			.add(Attributes.ARMOR_TOUGHNESS, 2.0)
			.add(Attributes.KNOCKBACK_RESISTANCE, 0.95)
			.add(Attributes.FOLLOW_RANGE, 48.0)
			.add(Attributes.STEP_HEIGHT, 1.1);
	}

	@Override
	protected void registerGoals() {
		targetSelector.addGoal(1, new NearestAttackableTargetGoal<>(this, Player.class, false));
	}

	@Override
	protected float[] phaseThresholds() {
		return new float[] {0.6F, 0.25F};
	}

	@Override
	protected Component title() {
		// Title text is drawn at 4x scale: a short, unbolded name keeps it on screen at every GUI scale.
		return Component.translatable("boss.abyssal_descent.hollow_warden.title").withStyle(ChatFormatting.WHITE);
	}

	@Override
	protected Component subtitle() {
		return Component.translatable("boss.abyssal_descent.hollow_warden.subtitle").withStyle(ChatFormatting.GRAY, ChatFormatting.ITALIC);
	}

	@Override
	protected int introLength() {
		return 56;
	}

	@Override
	protected int deathLength() {
		return 100;
	}

	// ------------------------------------------------------------------ animation sync

	@Override
	protected void onActionChanged(int action) {
		seatedAnimation.animateWhen(action == ACTION_SEATED, tickCount);
		awakenAnimation.animateWhen(action == ACTION_AWAKEN, tickCount);
		cleaveAnimation.animateWhen(action == ACTION_CLEAVE, tickCount);
		cleaveBackAnimation.animateWhen(action == ACTION_CLEAVE_BACK, tickCount);
		slamAnimation.animateWhen(action == ACTION_SLAM, tickCount);
		eruptAnimation.animateWhen(action == ACTION_ERUPT, tickCount);
		chargeWindupAnimation.animateWhen(action == ACTION_CHARGE_WINDUP, tickCount);
		chargingAnimation.animateWhen(action == ACTION_CHARGING, tickCount);
		stunnedAnimation.animateWhen(action == ACTION_STUNNED, tickCount);
		volleyAnimation.animateWhen(action == ACTION_VOLLEY, tickCount);
		roarAnimation.animateWhen(action == ACTION_ROAR, tickCount);
		deathAnimation.animateWhen(action == ACTION_DEATH, tickCount);
	}

	@Override
	public void tick() {
		super.tick();
		if (level().isClientSide()) {
			clientEffects();
		}
	}

	private void clientEffects() {
		if (dormant()) {
			if (random.nextInt(4) == 0) {
				level().addParticle(ParticleTypes.SOUL, getX() + (random.nextDouble() - 0.5) * 0.6, getY() + 2.0, getZ() + (random.nextDouble() - 0.5) * 0.6,
					0, 0.01, 0);
			}
			return;
		}
		int flames = phase() >= 3 ? 3 : 1;
		for (int i = 0; i < flames; i++) {
			// Soul fire leaking from the ribcage and the helm's visor.
			level().addParticle(ParticleTypes.SOUL_FIRE_FLAME, getX() + (random.nextDouble() - 0.5) * 0.7, getY() + 1.7 + random.nextDouble() * 0.6,
				getZ() + (random.nextDouble() - 0.5) * 0.7, 0, 0.03, 0);
		}
		if (action() == ACTION_STUNNED && tickCount % 4 == 0) {
			level().addParticle(ParticleTypes.CRIT, getX(), getY() + getBbHeight() + 0.3, getZ(), 0, 0.05, 0);
		}
	}

	// ------------------------------------------------------------------ lifecycle

	@Override
	protected void onIntroStart(ServerLevel level) {
		setAction(ACTION_AWAKEN);
		level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_AWAKEN, SoundSource.HOSTILE, 3.0F, 1.0F);
		level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 2, getZ(), 40, 0.6, 1.0, 0.6, 0.04);
	}

	@Override
	protected int onPhaseStart(ServerLevel level, int phase) {
		current = null;
		setAction(ACTION_ROAR);
		level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_ROAR, SoundSource.HOSTILE, 3.0F, phase == 3 ? 0.8F : 1.0F);
		// A wave of force pushes everyone back (no damage) so the transition is never a free hit for either side.
		for (ServerPlayer player : playersInArena(level)) {
			Vec3 away = player.position().subtract(position());
			if (away.horizontalDistance() < 9) {
				Vec3 push = new Vec3(away.x, 0, away.z).normalize().scale(1.2);
				player.push(push.x, 0.45, push.z);
				player.hurtMarked = true;
			}
		}
		level.sendParticles(ModParticles.SHOCK_RING, getX(), getY() + 0.1, getZ(), 1, 0, 0, 0, 0);
		level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 1.5, getZ(), 80, 1.5, 1.0, 1.5, 0.12);
		for (ServerPlayer player : playersInArena(level)) {
			player.sendSystemMessage(Component.translatable(phase == 2 ? "boss.abyssal_descent.hollow_warden.phase2" : "boss.abyssal_descent.hollow_warden.phase3")
				.withStyle(ChatFormatting.AQUA, ChatFormatting.ITALIC));
		}
		if (phase == 2) {
			raiseTimer = 0;
		}
		if (phase == 3) {
			var speed = getAttribute(Attributes.MOVEMENT_SPEED);
			if (speed != null) {
				speed.addOrReplacePermanentModifier(new net.minecraft.world.entity.ai.attributes.AttributeModifier(
					net.abyssaldescent.AbyssalDescent.id("warden_enrage"), 0.25, net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL));
			}
		}
		return 50;
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		if (!dormant() && introTicks == 1) {
			setAction(0);
		}
		if (!dormant() && transitionTicks == 1) {
			setAction(0);
		}
	}

	// ------------------------------------------------------------------ combat

	@Override
	protected void tickCombat(ServerLevel level) {
		LivingEntity target = getTarget();
		if (target == null || !target.isAlive()) {
			List<ServerPlayer> players = playersInArena(level);
			if (!players.isEmpty()) {
				setTarget(players.get(random.nextInt(players.size())));
			}
			return;
		}
		for (int i = 0; i < cooldowns.length; i++) {
			if (cooldowns[i] > 0) {
				cooldowns[i]--;
			}
		}
		if (raiseTimer > 0) {
			raiseTimer--;
		}
		minions.removeIf(id -> {
			Entity e = level.getEntity(id);
			return e == null || !e.isAlive();
		});

		if (stunTicks > 0) {
			stunTicks--;
			getNavigation().stop();
			if (stunTicks == 0) {
				setAction(0);
				globalCooldown = 10;
			}
			return;
		}
		if (current != null) {
			attackTick++;
			tickAttack(level, target);
			if (current != null && attackTick >= attackLength) {
				finishAttack();
			}
			return;
		}
		getLookControl().setLookAt(target, 30.0F, 30.0F);
		double dist = distanceTo(target);
		if (globalCooldown > 0) {
			globalCooldown--;
			if (dist > 3.0) {
				getNavigation().moveTo(target, 1.0);
			} else {
				getNavigation().stop();
			}
			return;
		}
		Attack next = chooseAttack(level, target, dist);
		if (next == null) {
			getNavigation().moveTo(target, 1.0);
			return;
		}
		startAttack(level, next, target);
	}

	@Nullable
	private Attack chooseAttack(ServerLevel level, LivingEntity target, double dist) {
		int phase = phase();
		if (phase >= 2 && raiseTimer == 0 && minions.size() < 2 && cooldowns[Attack.RAISE_DEAD.ordinal()] == 0) {
			return Attack.RAISE_DEAD;
		}
		List<Attack> options = new ArrayList<>();
		List<Integer> weights = new ArrayList<>();
		if (dist < 4.8) {
			add(options, weights, Attack.CLEAVE, 6);
			add(options, weights, Attack.SLAM, lastCombo >= 2 ? 6 : 3);
		}
		if (dist >= 4.0) {
			add(options, weights, Attack.ERUPTION, 4);
		}
		if (dist >= 6.0 && dist < 20.0 && getSensing().hasLineOfSight(target)) {
			add(options, weights, Attack.CHARGE, 4);
		}
		if (phase >= 2 && dist >= 5.0 && getSensing().hasLineOfSight(target)) {
			add(options, weights, Attack.VOLLEY, 4);
		}
		if (options.isEmpty()) {
			return null;
		}
		int total = 0;
		for (int w : weights) {
			total += w;
		}
		int roll = random.nextInt(total);
		for (int i = 0; i < options.size(); i++) {
			roll -= weights.get(i);
			if (roll < 0) {
				return options.get(i);
			}
		}
		return options.get(0);
	}

	private void add(List<Attack> options, List<Integer> weights, Attack attack, int weight) {
		if (cooldowns[attack.ordinal()] == 0) {
			options.add(attack);
			weights.add(weight);
		}
	}

	private void startAttack(ServerLevel level, Attack attack, LivingEntity target) {
		current = attack;
		attackTick = 0;
		getNavigation().stop();
		Vec3 to = target.position().subtract(position());
		lockedDir = new Vec3(to.x, 0, to.z).normalize();
		faceDirection(lockedDir);
		boolean enraged = phase() >= 3;
		switch (attack) {
			case CLEAVE -> {
				attackLength = enraged ? 44 : 32;
				setAction(ACTION_CLEAVE);
				TelegraphEntity.cone(level, position().add(0, 0.05, 0), yawOf(lockedDir), 5.2F, 120.0F, enraged ? 14 : 18, SOUL_BLUE);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.TELEGRAPH, SoundSource.HOSTILE, 1.0F, 0.8F);
				lastCombo++;
			}
			case SLAM -> {
				attackLength = 40;
				setAction(ACTION_SLAM);
				TelegraphEntity.circle(level, position().add(0, 0.05, 0), 4.6F, 22, DANGER);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.TELEGRAPH, SoundSource.HOSTILE, 1.2F, 0.6F);
				lastCombo = 0;
			}
			case ERUPTION -> {
				attackLength = enraged ? 64 : 44;
				setAction(ACTION_ERUPT);
				eruptionPoints.clear();
				for (ServerPlayer player : playersInArena(level)) {
					Vec3 p = player.position();
					eruptionPoints.add(p);
					TelegraphEntity.circle(level, p.add(0, 0.05, 0), 2.4F, 24, SOUL_PALE);
				}
				level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_ROAR, SoundSource.HOSTILE, 1.5F, 1.4F);
			}
			case CHARGE -> {
				float length = chargeLength(level);
				attackLength = 20 + 22 + 16;
				setAction(ACTION_CHARGE_WINDUP);
				TelegraphEntity.line(level, position().add(0, 0.05, 0), yawOf(lockedDir), length, 2.6F, 20, DANGER);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_CHARGE, SoundSource.HOSTILE, 1.5F, 0.8F);
				chargeHits.clear();
			}
			case VOLLEY -> {
				attackLength = 46;
				setAction(ACTION_VOLLEY);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.SKULL_WAIL, SoundSource.HOSTILE, 1.5F, 0.6F);
			}
			case RAISE_DEAD -> {
				attackLength = 40;
				setAction(ACTION_ROAR);
				raiseTimer = 600;
				level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_ROAR, SoundSource.HOSTILE, 2.5F, 0.7F);
				for (ServerPlayer player : playersInArena(level)) {
					player.sendSystemMessage(Component.translatable("boss.abyssal_descent.hollow_warden.raise").withStyle(ChatFormatting.DARK_AQUA,
						ChatFormatting.ITALIC));
				}
			}
		}
	}

	private void tickAttack(ServerLevel level, LivingEntity target) {
		Attack attack = current;
		if (attack == null) {
			return;
		}
		boolean enraged = phase() >= 3;
		switch (attack) {
			case CLEAVE -> {
				int strike = enraged ? 14 : 18;
				if (attackTick == strike) {
					cleaveHit(level, lockedDir, 1.0F);
				}
				if (enraged) {
					if (attackTick == strike + 6) {
						// The backhand: re-aim, shorter warning.
						Vec3 to = target.position().subtract(position());
						lockedDir = new Vec3(to.x, 0, to.z).normalize();
						faceDirection(lockedDir);
						setAction(ACTION_CLEAVE_BACK);
						TelegraphEntity.cone(level, position().add(0, 0.05, 0), yawOf(lockedDir), 5.2F, 120.0F, 12, SOUL_BLUE);
					}
					if (attackTick == strike + 18) {
						cleaveHit(level, lockedDir, 0.85F);
					}
				}
			}
			case SLAM -> {
				if (attackTick == 22) {
					slamHit(level);
				}
			}
			case ERUPTION -> {
				if (attackTick == 24) {
					for (Vec3 p : eruptionPoints) {
						erupt(level, p);
					}
				}
				if (enraged && (attackTick == 34 || attackTick == 46)) {
					// Chasing eruptions under the closest delvers.
					eruptionPoints.clear();
					for (ServerPlayer player : playersInArena(level)) {
						eruptionPoints.add(player.position());
						TelegraphEntity.circle(level, player.position().add(0, 0.05, 0), 2.2F, 12, SOUL_PALE);
					}
				}
				if (enraged && (attackTick == 46 || attackTick == 58)) {
					for (Vec3 p : eruptionPoints) {
						erupt(level, p);
					}
				}
			}
			case CHARGE -> tickCharge(level);
			case VOLLEY -> {
				getLookControl().setLookAt(target, 30.0F, 30.0F);
				if (attackTick == 16 || attackTick == 30) {
					volley(level, target, enraged ? 7 : 5);
				}
			}
			case RAISE_DEAD -> {
				if (attackTick == 10) {
					raiseDead(level);
				}
			}
		}
	}

	private void finishAttack() {
		Attack attack = current;
		current = null;
		setAction(0);
		if (attack == null) {
			return;
		}
		int base = switch (attack) {
			case CLEAVE -> 40;
			case SLAM -> 120;
			case ERUPTION -> 160;
			case CHARGE -> 180;
			case VOLLEY -> 160;
			case RAISE_DEAD -> 200;
		};
		cooldowns[attack.ordinal()] = phase() >= 3 ? base * 3 / 4 : base;
		globalCooldown = phase() >= 3 ? 8 : phase() == 2 ? 12 : 18;
	}

	private void cleaveHit(ServerLevel level, Vec3 dir, float multiplier) {
		float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * multiplier;
		for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(5.2, 1.0, 5.2), this::isFoe)) {
			Vec3 to = victim.position().subtract(position());
			Vec3 flat = new Vec3(to.x, 0, to.z);
			if (flat.length() > 5.6 || flat.normalize().dot(dir) < Math.cos(Math.toRadians(62))) {
				continue;
			}
			if (victim.hurtServer(level, damageSources().mobAttack(this), damage)) {
				victim.knockback(0.7, -dir.x, -dir.z);
			}
		}
		Vec3 arc = position().add(dir.scale(2.6)).add(0, 1.2, 0);
		level.sendParticles(ParticleTypes.SWEEP_ATTACK, arc.x, arc.y, arc.z, 3, 1.0, 0.2, 1.0, 0.0);
		level.sendParticles(ModParticles.SOUL_EMBER, arc.x, arc.y, arc.z, 24, 1.6, 0.4, 1.6, 0.05);
		level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_CLEAVE, SoundSource.HOSTILE, 1.6F, 0.9F + random.nextFloat() * 0.2F);
	}

	private void slamHit(ServerLevel level) {
		float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.9F;
		DamageSource source = level.damageSources().source(ModDamageTypes.SHOCKWAVE, this);
		for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(4.6, 1.5, 4.6), this::isFoe)) {
			Vec3 away = victim.position().subtract(position());
			if (away.horizontalDistance() > 4.8 || victim.getY() > getY() + 1.8) {
				continue;
			}
			if (victim.hurtServer(level, source, damage)) {
				Vec3 push = new Vec3(away.x, 0, away.z).normalize();
				victim.push(push.x * 1.1, 0.5, push.z * 1.1);
				victim.hurtMarked = true;
			}
		}
		impactEffects(level, position(), 4.6);
		level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 2.5F, 0.8F);
		if (phase() >= 3) {
			// Burning ground lingers around the impact.
			for (int i = 0; i < 3; i++) {
				double angle = random.nextDouble() * Math.PI * 2;
				Vec3 p = position().add(Math.cos(angle) * 3, 0.05, Math.sin(angle) * 3);
				TelegraphEntity.zone(level, p, 1.6F, 100, 0xA040A0FF).setHazard(this, 2.0F + bossFloor * 0.3F);
			}
		}
	}

	private void erupt(ServerLevel level, Vec3 p) {
		float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 0.8F;
		DamageSource source = level.damageSources().source(ModDamageTypes.SOUL_ERUPTION, this);
		for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, new AABB(p, p).inflate(2.4, 2.0, 2.4), this::isFoe)) {
			if (victim.position().subtract(p).horizontalDistance() <= 2.5 && victim.hurtServer(level, source, damage)) {
				victim.push(0, 0.55, 0);
				victim.hurtMarked = true;
			}
		}
		level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, p.x, p.y + 0.3, p.z, 50, 0.9, 0.2, 0.9, 0.12);
		level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), p.x, p.y + 0.5, p.z, 25, 0.7, 0.6, 0.7,
			0.2);
		level.sendParticles(ModParticles.SHOCK_RING, p.x, p.y + 0.05, p.z, 1, 0, 0, 0, 0);
		level.playSound(null, p.x, p.y, p.z, ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 1.4F, 1.4F);
	}

	private float chargeLength(ServerLevel level) {
		// Measure to the first wall so the telegraph shows exactly where the charge ends.
		Vec3 start = position().add(0, 0.6, 0);
		for (float d = 1.0F; d <= 18.0F; d += 0.5F) {
			Vec3 p = start.add(lockedDir.scale(d));
			BlockPos pos = BlockPos.containing(p);
			if (!level.getBlockState(pos).getCollisionShape(level, pos).isEmpty() || !level.getBlockState(pos.above())
				.getCollisionShape(level, pos.above()).isEmpty()) {
				return Math.max(2.0F, d);
			}
		}
		return 18.0F;
	}

	private void tickCharge(ServerLevel level) {
		if (attackTick < 20) {
			faceDirection(lockedDir);
			return;
		}
		if (attackTick == 20) {
			setAction(ACTION_CHARGING);
			level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_CHARGE, SoundSource.HOSTILE, 2.0F, 1.2F);
		}
		if (attackTick < 42 && action() == ACTION_CHARGING) {
			faceDirection(lockedDir);
			Vec3 step = lockedDir.scale(0.85);
			move(MoverType.SELF, new Vec3(step.x, -0.08, step.z));
			if (tickCount % 2 == 0) {
				level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 0.3, getZ(), 6, 0.4, 0.2, 0.4, 0.02);
			}
			float damage = (float) getAttributeValue(Attributes.ATTACK_DAMAGE) * 1.2F;
			for (LivingEntity victim : level.getEntitiesOfClass(LivingEntity.class, getBoundingBox().inflate(0.6), this::isFoe)) {
				if (!chargeHits.contains(victim.getUUID())) {
					chargeHits.add(victim.getUUID());
					if (victim.hurtServer(level, damageSources().mobAttack(this), damage)) {
						Vec3 side = new Vec3(-lockedDir.z, 0, lockedDir.x);
						if (side.dot(victim.position().subtract(position())) < 0) {
							side = side.scale(-1);
						}
						victim.push(side.x * 0.9 + lockedDir.x * 0.5, 0.4, side.z * 0.9 + lockedDir.z * 0.5);
						victim.hurtMarked = true;
					}
				}
			}
			if (horizontalCollision) {
				// Crashed into a wall or pillar: dazed and exposed.
				impactEffects(level, position().add(lockedDir.scale(0.8)), 2.0);
				level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 2.0F, 0.6F);
				current = null;
				setAction(ACTION_STUNNED);
				stunTicks = phase() >= 3 ? 45 : 60;
				cooldowns[Attack.CHARGE.ordinal()] = 200;
				globalCooldown = 0;
				for (ServerPlayer player : playersInArena(level)) {
					player.displayClientMessage(Component.translatable("boss.abyssal_descent.hollow_warden.stunned").withStyle(ChatFormatting.YELLOW), true);
				}
				return;
			}
		}
		if (attackTick == 42 && action() == ACTION_CHARGING) {
			setAction(0);
		}
	}

	private void volley(ServerLevel level, LivingEntity target, int count) {
		Vec3 eye = getEyePosition();
		Vec3 aim = target.getEyePosition().subtract(eye).normalize();
		double spread = Math.toRadians(phase() >= 3 ? 70 : 56);
		for (int i = 0; i < count; i++) {
			double offset = count == 1 ? 0 : -spread / 2 + spread * i / (count - 1);
			double cos = Math.cos(offset);
			double sin = Math.sin(offset);
			Vec3 dir = new Vec3(aim.x * cos - aim.z * sin, aim.y, aim.x * sin + aim.z * cos);
			SoulBoltEntity bolt = new SoulBoltEntity(level, this, dir, 0.42, 5.0F, 0.0);
			bolt.setPos(eye.x + dir.x, eye.y - 0.3, eye.z + dir.z);
			level.addFreshEntity(bolt);
		}
		level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_VOLLEY, SoundSource.HOSTILE, 1.8F, 1.0F);
	}

	private void raiseDead(ServerLevel level) {
		int count = Math.min(minionSpawns.size(), 2 + playersInArena(level).size());
		List<BlockPos> spots = new ArrayList<>(minionSpawns);
		java.util.Collections.shuffle(spots, new java.util.Random(random.nextLong()));
		for (int i = 0; i < count && i < spots.size(); i++) {
			BlockPos sarcophagus = spots.get(i);
			// The lid bursts open.
			BlockPos lid = sarcophagus.above();
			BlockState lidState = level.getBlockState(lid);
			if (!lidState.isAir()) {
				level.destroyBlock(lid, false);
			}
			Mob mob = ModEntities.RISEN.create(level, EntitySpawnReason.MOB_SUMMONED);
			if (mob == null) {
				continue;
			}
			mob.snapTo(sarcophagus.getX() + 0.5, sarcophagus.getY() + 1.0, sarcophagus.getZ() + 0.5, random.nextFloat() * 360, 0);
			DungeonMobs.prepare(mob, new MobInfo(runSlot, -1, bossFloor, -1), 1);
			mob.setTarget(getTarget());
			level.addFreshEntity(mob);
			minions.add(mob.getUUID());
			level.sendParticles(ParticleTypes.SOUL, sarcophagus.getX() + 0.5, sarcophagus.getY() + 1.2, sarcophagus.getZ() + 0.5, 20, 0.4, 0.6, 0.4, 0.03);
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.DEEPSLATE_TILES.defaultBlockState()), sarcophagus.getX() + 0.5,
				sarcophagus.getY() + 1.2, sarcophagus.getZ() + 0.5, 20, 0.5, 0.3, 0.5, 0.1);
			level.playSound(null, sarcophagus, ModSounds.WALL_CRUMBLE, SoundSource.HOSTILE, 1.2F, 0.7F);
		}
	}

	private void impactEffects(ServerLevel level, Vec3 at, double radius) {
		BlockState floor = level.getBlockState(BlockPos.containing(at).below());
		level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, floor.isAir() ? Blocks.STONE_BRICKS.defaultBlockState() : floor), at.x, at.y + 0.1,
			at.z, (int) (radius * 18), radius * 0.6, 0.1, radius * 0.6, 0.2);
		level.sendParticles(ModParticles.SHOCK_RING, at.x, at.y + 0.05, at.z, 1, 0, 0, 0, 0);
		level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, at.x, at.y + 0.2, at.z, (int) (radius * 10), radius * 0.5, 0.1, radius * 0.5, 0.08);
	}

	private boolean isFoe(LivingEntity entity) {
		return entity != this && entity.isAlive() && !(entity instanceof Monster) && !(entity instanceof Player p && (p.isSpectator() || p.isCreative()));
	}

	private void faceDirection(Vec3 dir) {
		float yaw = yawOf(dir);
		setYRot(yaw);
		setYBodyRot(yaw);
		setYHeadRot(yaw);
	}

	private static float yawOf(Vec3 dir) {
		return (float) Math.toDegrees(Math.atan2(-dir.x, dir.z));
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		if (stunTicks > 0) {
			amount *= 1.3F;
		}
		return super.hurtServer(level, source, amount);
	}

	// ------------------------------------------------------------------ death

	@Override
	public void die(DamageSource source) {
		super.die(source);
		setAction(ACTION_DEATH);
		if (level() instanceof ServerLevel level) {
			for (UUID id : minions) {
				Entity e = level.getEntity(id);
				if (e != null) {
					e.kill(level);
				}
			}
			level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_DEATH, SoundSource.HOSTILE, 3.0F, 1.0F);
		}
	}

	@Override
	protected void tickDeathSequence(ServerLevel level, int t) {
		if (t % 4 == 0) {
			level.sendParticles(ParticleTypes.SOUL_FIRE_FLAME, getX(), getY() + 1.5, getZ(), 6 + t / 8, 0.5, 0.8, 0.5, 0.05);
		}
		if (t == 40) {
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.BONE_BLOCK.defaultBlockState()), getX(), getY() + 1, getZ(), 60, 0.6, 1.0,
				0.6, 0.2);
			level.playSound(null, getX(), getY(), getZ(), ModSounds.WARDEN_SLAM, SoundSource.HOSTILE, 2.0F, 0.6F);
		}
		if (t > 60 && t % 2 == 0) {
			// The freed soul climbs out of the armour.
			double h = (t - 60) * 0.25;
			level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 1.6 + h, getZ(), 3, 0.25, 0.25, 0.25, 0.01);
			level.sendParticles(ModParticles.SOUL_EMBER, getX(), getY() + 1.6 + h, getZ(), 4, 0.3, 0.3, 0.3, 0.02);
		}
		if (t == deathLength() - 1) {
			level.sendParticles(ModParticles.SHOCK_RING, getX(), getY() + 0.1, getZ(), 1, 0, 0, 0, 0);
			level.sendParticles(ParticleTypes.SOUL, getX(), getY() + 2, getZ(), 80, 1.5, 1.5, 1.5, 0.1);
			level.playSound(null, getX(), getY(), getZ(), ModSounds.SOUL_FLARE, SoundSource.HOSTILE, 2.5F, 0.7F);
		}
	}

	// ------------------------------------------------------------------ sounds

	@Override
	protected SoundEvent getAmbientSound() {
		return dormant() ? null : ModSounds.WARDEN_STEP;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return ModSounds.WARDEN_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return null;
	}

	@Override
	protected void playStepSound(BlockPos pos, BlockState state) {
		playSound(ModSounds.WARDEN_STEP, 0.9F, 0.8F);
	}

	@Override
	public int getAmbientSoundInterval() {
		return 200;
	}
}
