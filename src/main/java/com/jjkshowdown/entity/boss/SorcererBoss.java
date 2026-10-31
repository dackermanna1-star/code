package com.jjkshowdown.entity.boss;

import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.ability.Casting;
import com.jjkshowdown.cinematic.CinematicType;
import com.jjkshowdown.cinematic.Cinematics;
import com.jjkshowdown.combat.Movement;
import com.jjkshowdown.combat.TechniqueDamage;
import com.jjkshowdown.config.Difficulty;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.entity.projectile.TechniqueProjectile;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.qte.QteManager;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerBossEvent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;

/**
 * Rival boss controlled by a utility AI that uses the exact same technique system as players.
 * Reacts to incoming techniques, guards against melee, answers domains with its own (clash), heals with RCT,
 * telegraphs ultimates with quick-time events for its player target, and transforms at half health.
 */
public abstract class SorcererBoss extends Monster {
	private static final EntityDataAccessor<Integer> PHASE = SynchedEntityData.defineId(SorcererBoss.class, EntityDataSerializers.INT);

	protected final ServerBossEvent bossEvent;
	protected final CharacterType character;
	private boolean initialized;
	private boolean introPlayed;
	private int rctBudget = 2;
	protected int decisionTimer;
	protected AbilitySlot heldSlot;
	protected int releaseAt;
	protected int strafeTimer;
	protected int strafeDir = 1;
	protected int blockUntil;
	protected int tauntTimer = 300;
	/** Ticks spent fighting the current target (domains are saved for later in the fight). */
	protected int engagedTicks;
	private int finisherCooldown;
	private boolean awaitingQte;
	private final Set<Integer> reactedProjectiles = new HashSet<>();

	protected SorcererBoss(EntityType<? extends SorcererBoss> type, Level level, CharacterType character, BossEvent.BossBarColor color) {
		super(type, level);
		this.character = character;
		this.bossEvent = new ServerBossEvent(Component.empty(), color, BossEvent.BossBarOverlay.NOTCHED_10);
		this.bossEvent.setDarkenScreen(false);
		this.xpReward = 300;
		this.setPersistenceRequired();
		if (!level.isClientSide()) {
			Sorcerers.data(this).setCharacter(character);
		}
	}

	public static AttributeSupplier.Builder createAttributes(double health) {
		return Monster.createMonsterAttributes()
				.add(Attributes.MAX_HEALTH, health)
				.add(Attributes.MOVEMENT_SPEED, 0.34)
				.add(Attributes.ATTACK_DAMAGE, 5.0)
				.add(Attributes.ATTACK_KNOCKBACK, 0.6)
				.add(Attributes.ARMOR, 10.0)
				.add(Attributes.ARMOR_TOUGHNESS, 4.0)
				.add(Attributes.KNOCKBACK_RESISTANCE, 0.55)
				.add(Attributes.FOLLOW_RANGE, 64.0)
				.add(Attributes.STEP_HEIGHT, 1.1)
				.add(Attributes.SAFE_FALL_DISTANCE, 30.0)
				.add(Attributes.JUMP_STRENGTH, 0.6);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(PHASE, 1);
	}

	public int phase() {
		return entityData.get(PHASE);
	}

	public CharacterType character() {
		return character;
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new BrainGoal());
		this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 24f));
		this.goalSelector.addGoal(9, new RandomLookAroundGoal(this));
		this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
		this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
		this.targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, SorcererBoss.class, 10, true, false,
				(e, level) -> e instanceof SorcererBoss b && b.character != this.character));
	}

	// ------------------------------------------------------------------------------------------------ difficulty

	protected Difficulty diff() {
		return JjkConfig.get().difficultyPreset();
	}

	public float damageScale() {
		return diff().bossDamage * JjkConfig.get().ai.bossDamageMultiplier * (phase() >= 2 ? 1.2f : 1.0f);
	}

	public float cooldownScale(Ability a) {
		float s = 1.2f;
		if (a.slot == AbilitySlot.ULTIMATE || a.slot == AbilitySlot.DOMAIN) s *= diff().aiUltimateCooldown;
		if (phase() >= 2) s *= 0.85f;
		return s;
	}

	public float energyRegenScale() {
		return 1.15f + (phase() >= 2 ? 0.25f : 0f);
	}

	public float clashScale() {
		return switch (diff()) {
			case EASY -> 0.85f;
			case NORMAL -> 1.0f;
			case HARD -> 1.1f;
			case NIGHTMARE -> 1.25f;
		};
	}

	public float clashInputRate() {
		return diff().aiClashRate * JjkConfig.get().ai.aggressionMultiplier;
	}

	public float blackFlashScale() {
		return 0.6f + 0.25f * diff().ordinal();
	}

	protected float aggression() {
		return diff().aiAggression * JjkConfig.get().ai.aggressionMultiplier;
	}

	protected int decisionInterval() {
		return Math.max(2, Math.round(diff().aiDecisionTicks * JjkConfig.get().ai.reactionMultiplier));
	}

	// ------------------------------------------------------------------------------------------------ lifecycle

	private void initBoss(ServerLevel level) {
		initialized = true;
		double hp = getAttributeBaseValue(Attributes.MAX_HEALTH) * diff().bossHealth * JjkConfig.get().ai.bossHealthMultiplier;
		var inst = getAttribute(Attributes.MAX_HEALTH);
		if (inst != null) inst.setBaseValue(hp);
		setHealth((float) hp);
		CursedEnergy.fill(this);
		bossEvent.setName(Component.translatable("boss.jjkshowdown." + character.id()));
	}

	@Override
	public void tick() {
		super.tick();
		if (!(level() instanceof ServerLevel level)) return;
		if (!initialized) initBoss(level);
		bossEvent.setProgress(getHealth() / getMaxHealth());
		if (finisherCooldown > 0) finisherCooldown--;
		if (!introPlayed && getTarget() instanceof ServerPlayer p && p.distanceTo(this) < 32) {
			introPlayed = true;
			Cinematics.play(level, CinematicType.BOSS_INTRO, this, p, null);
			Casting.voice(this, Sorcerers.state(this), character == CharacterType.GOJO ? VoiceLine.GOJO_INTRO : VoiceLine.SUKUNA_INTRO, 1.0f);
		}
		if (phase() == 1 && JjkConfig.get().ai.bossPhaseTwo && getHealth() < getMaxHealth() * 0.5f) {
			enterPhaseTwo(level);
		}
	}

	protected void enterPhaseTwo(ServerLevel level) {
		entityData.set(PHASE, 2);
		rctBudget = 2;
		heal(getMaxHealth() * 0.1f);
		CursedEnergy.fill(this);
		SorcererState s = Sorcerers.state(this);
		s.burnoutTicks = 0;
		AbilityHandler.interrupt(this);
		Fx.burst(level, character == CharacterType.GOJO ? ModParticles.BLUE_SPARK : ModParticles.CE_WISP_RED, position().add(0, 1, 0), 120, 1.0);
		JjkNetwork.shakeAround(level, position(), 48, 1.2f, 30);
		Fx.sound(level, position(), ModSounds.CINEMATIC_HIT, 3.0f, 0.8f);
		LivingEntity t = getTarget();
		Cinematics.play(level, CinematicType.PHASE_TWO, this, t, () -> {
			if (getTarget() instanceof ServerPlayer p && p.isAlive()) {
				QteManager.start(p, QteManager.Kind.MASH, QteManager.Key.ATTACK, 50, 12, 0, 0, "qte.jjkshowdown.push_back", o -> {
					if (o == QteManager.Outcome.SUCCESS) {
						SorcererState bs = Sorcerers.state(this);
						bs.staggerTicks = Math.max(bs.staggerTicks, 40);
						Sorcerers.state(p).counterTicks = 60;
						TechniqueDamage.knockAway(this, p.position(), 1.6, 0.5);
					} else if (o == QteManager.Outcome.FAIL) {
						TechniqueDamage.knockAway(p, position(), 2.2, 0.7);
						TechniqueDamage.hurt(p, ModDamageTypes.TECHNIQUE, this, this, 6f * damageScale(), true);
					}
				});
			}
		});
		onPhaseTwo(level);
	}

	protected void onPhaseTwo(ServerLevel level) {
	}

	@Override
	public void die(DamageSource source) {
		if (level() instanceof ServerLevel level) {
			Casting.voice(this, Sorcerers.state(this), character == CharacterType.GOJO ? VoiceLine.GOJO_DEFEAT : VoiceLine.SUKUNA_DEFEAT, 1.0f);
			DomainEntity d = DomainManager.ownedBy(this);
			if (d != null) d.collapse();
			if (source.getEntity() instanceof ServerPlayer p) {
				Mastery.addXp(p, 600);
				JjkNetwork.notify(p, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.rival_defeated", getDisplayName()), character.energyColor);
				JjkNetwork.screenEffect(p, Payloads.ScreenEffect.SLOW_MO, 1.0f, 30, 0);
				if (Sorcerers.character(p) == CharacterType.GOJO) JjkNetwork.voice(p, VoiceLine.GOJO_VICTORY);
				else if (Sorcerers.character(p) == CharacterType.SUKUNA) JjkNetwork.voice(p, VoiceLine.SUKUNA_VICTORY);
			}
			Fx.burst(level, ModParticles.IMPACT_FLASH, getBoundingBox().getCenter(), 6, 0.5);
			JjkNetwork.shakeAround(level, position(), 40, 1.0f, 20);
		}
		super.die(source);
	}

	@Override
	public void startSeenByPlayer(ServerPlayer player) {
		super.startSeenByPlayer(player);
		bossEvent.addPlayer(player);
	}

	@Override
	public void stopSeenByPlayer(ServerPlayer player) {
		super.stopSeenByPlayer(player);
		bossEvent.removePlayer(player);
	}

	@Override
	public boolean removeWhenFarAway(double d) {
		return false;
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput out) {
		super.addAdditionalSaveData(out);
		out.putInt("jjk_phase", phase());
		out.putBoolean("jjk_init", initialized);
		out.putBoolean("jjk_intro", introPlayed);
		out.putInt("jjk_rct", rctBudget);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput in) {
		super.readAdditionalSaveData(in);
		entityData.set(PHASE, in.getIntOr("jjk_phase", 1));
		initialized = in.getBooleanOr("jjk_init", false);
		introPlayed = in.getBooleanOr("jjk_intro", false);
		rctBudget = in.getIntOr("jjk_rct", 2);
		if (hasCustomName()) bossEvent.setName(getDisplayName());
	}

	// ------------------------------------------------------------------------------------------------ QTE hooks

	/** A boss ultimate was just launched: give the player target a chance to evade. */
	public void onUltimateLaunched(Ability ability, Entity projectile) {
		if (!(getTarget() instanceof ServerPlayer p) || !(level() instanceof ServerLevel)) return;
		if (ability == Abilities.HOLLOW_PURPLE) {
			QteManager.start(p, QteManager.Kind.PRESS, QteManager.Key.DODGE, 26, 1, 0, 0, "qte.jjkshowdown.evade_purple",
					o -> evade(p, projectile.getDeltaMovement(), o));
		}
	}

	/** World-Cutting Slash: the player reacts before the cut lands. */
	public void telegraphUltimate(Ability ability, Runnable fire) {
		if (!(getTarget() instanceof ServerPlayer p)) {
			fire.run();
			return;
		}
		awaitingQte = true;
		Sorcerers.state(this).setPose(CastPose.WORLD_SLASH, 40);
		Vec3 dir = p.position().subtract(position()).normalize();
		QteManager.start(p, QteManager.Kind.PRESS, QteManager.Key.DODGE, 18, 1, 0, 0, "qte.jjkshowdown.evade_slash", o -> {
			awaitingQte = false;
			evade(p, dir, o);
			if (isAlive()) fire.run();
		});
	}

	private void evade(ServerPlayer p, Vec3 incoming, QteManager.Outcome o) {
		SorcererState ps = Sorcerers.state(p);
		if (o == QteManager.Outcome.FAIL) return;
		Vec3 side = incoming.cross(new Vec3(0, 1, 0));
		if (side.lengthSqr() < 1.0E-4) side = new Vec3(1, 0, 0);
		side = side.normalize().scale(random.nextBoolean() ? 1 : -1);
		double dist = o == QteManager.Outcome.SUCCESS ? 7 : 3.5;
		ServerLevel level = (ServerLevel) p.level();
		Vec3 spot = Casting.safeSpot(level, p, p.position().add(side.scale(dist)).add(0, 0.5, 0), p.position());
		if (spot != null) Casting.teleport(level, p, spot, p.getYRot(), p.getXRot());
		ps.iFrames = o == QteManager.Outcome.SUCCESS ? 30 : 8;
		ps.dodgeTick = level.getGameTime() - 10;
		Fx.sound(p, ModSounds.DODGE, 1.2f, 1.0f);
		Fx.particles(level, ModParticles.CE_WISP_BLUE, p.position().add(0, 1, 0), 10, 0.3, 0.6, 0.3, 0.02);
		JjkNetwork.notify(p, Payloads.Notify.CALLOUT, Component.translatable(o == QteManager.Outcome.SUCCESS ? "message.jjkshowdown.evaded" : "message.jjkshowdown.grazed"), 0x9FE8FF);
	}

	/** A player landed a finisher-worthy blow on this boss. */
	public void offerFinisher(ServerPlayer player) {
		if (finisherCooldown > 0 || !isAlive()) return;
		finisherCooldown = 400;
		SorcererState bs = Sorcerers.state(this);
		bs.staggerTicks = Math.max(bs.staggerTicks, 50);
		AbilityHandler.interrupt(this);
		QteManager.start(player, QteManager.Kind.TIMING, QteManager.Key.ATTACK, 40, 1, 24, 30, "qte.jjkshowdown.finisher", o -> {
			if (!isAlive()) return;
			ServerLevel level = (ServerLevel) level();
			if (o == QteManager.Outcome.FAIL) {
				TechniqueDamage.knockAway(player, position(), 2.0, 0.6);
				heal(getMaxHealth() * 0.03f);
				Sorcerers.state(this).staggerTicks = 0;
				Casting.voice(this, Sorcerers.state(this), character == CharacterType.GOJO ? VoiceLine.GOJO_TAUNT : VoiceLine.SUKUNA_KNOW_YOUR_PLACE, 1.0f);
				return;
			}
			float pct = o == QteManager.Outcome.SUCCESS ? 0.28f : 0.12f;
			Cinematics.play(level, CinematicType.FINISHER, player, this, () -> {
				if (!isAlive()) return;
				Fx.sound(this, ModSounds.FINISHER, 2.5f, 0.9f);
				Fx.burst(level, ModParticles.IMPACT_FLASH, getBoundingBox().getCenter(), 4, 0.3);
				JjkNetwork.shakeAround(level, position(), 32, 1.2f, 18);
				TechniqueDamage.hurt(this, ModDamageTypes.FINISHER, player, player, getMaxHealth() * pct, true);
				if (isAlive()) TechniqueDamage.knockAway(this, player.position(), 2.4, 0.9);
			});
		});
	}

	// ------------------------------------------------------------------------------------------------ AI helpers

	protected SorcererState st() {
		return Sorcerers.state(this);
	}

	protected boolean ready(AbilitySlot slot) {
		Ability a = Abilities.get(character, slot);
		if (a == null || !a.enabledInConfig()) return false;
		SorcererState s = st();
		if (s.isOnCooldown(slot) || (a.technique && s.isBurntOut())) return false;
		if ((slot == AbilitySlot.DOMAIN && !JjkConfig.get().ai.bossDomains) || (slot == AbilitySlot.ULTIMATE && !JjkConfig.get().ai.bossUltimates)) return false;
		float cost = a.cost(this) * (a.mode == Ability.Mode.CHARGE ? a.chargeCostScale(a.maxCharge(this)) : 1f);
		return CursedEnergy.has(this, cost);
	}

	protected boolean tap(AbilitySlot slot) {
		face(getTarget());
		boolean ok = AbilityHandler.press(this, slot);
		if (ok) AbilityHandler.release(this, slot);
		return ok;
	}

	protected boolean hold(AbilitySlot slot, int ticks) {
		face(getTarget());
		if (AbilityHandler.press(this, slot)) {
			heldSlot = slot;
			releaseAt = tickCount + ticks;
			return true;
		}
		return false;
	}

	protected void face(@Nullable LivingEntity t) {
		if (t == null) return;
		getLookControl().setLookAt(t, 60f, 60f);
		float yaw = Casting.yawTowards(position(), t.position());
		setYRot(yaw);
		yHeadRot = yaw;
		yBodyRot = yaw;
		setXRot(Casting.pitchTowards(getEyePosition(), t.getEyePosition()));
	}

	protected void moveToward(LivingEntity t, double speed) {
		getNavigation().moveTo(t, speed);
	}

	protected boolean busy() {
		SorcererState s = st();
		return s.chargingSlot != null || s.channelSlot != null || s.isLocked() || awaitingQte;
	}

	protected void dodgeSideways() {
		strafeDir = random.nextBoolean() ? 1 : -1;
		Movement.dodge(this, strafeDir, random.nextFloat() < 0.3f ? -1 : 0);
	}

	/** Whether expanding a domain now is a good idea: the fight has developed, or things are going badly. */
	protected boolean domainMoment(double dist, float maxRange) {
		if (dist > maxRange || CursedEnergy.ratio(this) < 0.82f) return false;
		boolean developed = engagedTicks > 240 || getHealth() < getMaxHealth() * 0.8f;
		return developed && random.nextFloat() < 0.18f * aggression();
	}

	protected void taunt() {
		VoiceLine line = character == CharacterType.GOJO
				? (random.nextBoolean() ? VoiceLine.GOJO_TAUNT : VoiceLine.GOJO_STRONGEST)
				: (random.nextBoolean() ? VoiceLine.SUKUNA_TAUNT : VoiceLine.SUKUNA_KNOW_YOUR_PLACE);
		Casting.voice(this, st(), line, 1.0f);
	}

	/** Character-specific offensive decision. */
	protected abstract void decide(ServerLevel level, LivingEntity target, double dist);

	/** Character-specific answer to being caught in an enemy domain. */
	protected abstract void counterDomain(ServerLevel level, DomainEntity enemy, LivingEntity target);

	/** Character-specific upkeep (toggles) every tick. */
	protected void upkeep(ServerLevel level, @Nullable LivingEntity target) {
	}

	/** React to incoming projectiles and melee; returns true if the reaction consumed this tick. */
	protected boolean react(ServerLevel level, LivingEntity target, double dist) {
		SorcererState s = st();
		// incoming techniques
		for (TechniqueProjectile p : level.getEntitiesOfClass(TechniqueProjectile.class, getBoundingBox().inflate(14), p -> p.getOwner() != this)) {
			if (!reactedProjectiles.add(p.getId())) continue;
			Vec3 to = getBoundingBox().getCenter().subtract(p.position());
			if (p.getDeltaMovement().dot(to) <= 0) continue;
			boolean infinityHandles = s.infinity && !(p instanceof com.jjkshowdown.entity.projectile.HollowPurpleEntity);
			if (infinityHandles) continue;
			if (random.nextFloat() < diff().aiDodgeChance * JjkConfig.get().ai.reactionMultiplier) {
				dodgeSideways();
				return true;
			}
		}
		if (reactedProjectiles.size() > 64) reactedProjectiles.clear();
		// incoming melee: guard (and parry when the timing lines up)
		if (dist < 3.6 && target.swinging && !s.blocking && !s.infinity && random.nextFloat() < diff().aiBlockChance) {
			Movement.startBlock(this);
			blockUntil = tickCount + 8 + random.nextInt(8);
			return true;
		}
		return false;
	}

	// ------------------------------------------------------------------------------------------------ brain

	private final class BrainGoal extends Goal {
		BrainGoal() {
			setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK, Flag.JUMP));
		}

		@Override
		public boolean canUse() {
			return getTarget() != null && getTarget().isAlive();
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void stop() {
			engagedTicks = 0;
			SorcererState s = st();
			if (s.blocking) Movement.stopBlock(SorcererBoss.this);
			getNavigation().stop();
		}

		@Override
		public void tick() {
			if (!(level() instanceof ServerLevel level)) return;
			LivingEntity target = getTarget();
			if (target == null) return;
			SorcererState s = st();
			double dist = distanceTo(target);
			engagedTicks++;
			upkeep(level, target);
			if (s.isLocked() || hasEffect(ModEffects.INFORMATION_OVERLOAD) || s.isStaggered()) {
				getNavigation().stop();
				// even paralysed, a sorcerer of this calibre answers a domain with a domain
				DomainEntity enemy = DomainManager.enemyDomainAt(SorcererBoss.this);
				if (enemy != null && !s.isLocked() && !DomainManager.inClash(SorcererBoss.this) && DomainManager.ownedBy(SorcererBoss.this) == null
						&& ready(AbilitySlot.DOMAIN)) {
					// a domain can always be expanded to answer a domain (the only true counter to a sure-hit)
					counterDomain(level, enemy, target);
				}
				return;
			}
			if (s.blocking && tickCount >= blockUntil) Movement.stopBlock(SorcererBoss.this);
			// held techniques
			if (heldSlot != null) {
				face(target);
				if (s.chargingSlot != heldSlot && s.channelSlot != heldSlot) {
					heldSlot = null;
				} else if (tickCount >= releaseAt) {
					AbilityHandler.release(SorcererBoss.this, heldSlot);
					heldSlot = null;
				}
				return;
			}
			if (busy()) {
				face(target);
				return;
			}
			// domain answers first
			DomainEntity enemy = DomainManager.enemyDomainAt(SorcererBoss.this);
			if (enemy != null && !DomainManager.inClash(SorcererBoss.this)) {
				counterDomain(level, enemy, target);
				if (busy()) return;
			}
			if (react(level, target, dist)) return;
			// heal / repair burnout when it is safe-ish
			boolean hurt = getHealth() < getMaxHealth() * 0.35f;
			if ((hurt && rctBudget > 0 || s.isBurntOut() && dist > 8) && ready(AbilitySlot.HEAL) && dist > 5) {
				if (hold(AbilitySlot.HEAL, hurt ? 70 : 50)) {
					if (hurt) rctBudget--;
					return;
				}
			}
			if (--tauntTimer <= 0) {
				tauntTimer = 360 + random.nextInt(400);
				taunt();
			}
			// melee is handled continuously when in range
			if (dist < 2.6 && s.blocking == false) {
				face(target);
				if (getAttackAnimScale() <= 0 && tickCount % Math.max(10, 18 - diff().ordinal() * 2) == 0) {
					swing(net.minecraft.world.InteractionHand.MAIN_HAND);
					doHurtTarget(level, target);
				}
			}
			if (--decisionTimer > 0) {
				// keep moving between decisions
				if (dist > 3.0) moveToward(target, 1.15 + aggression() * 0.15);
				else if (--strafeTimer <= 0) {
					strafeTimer = 20 + random.nextInt(20);
					strafeDir = -strafeDir;
				} else {
					getMoveControl().strafe(0.2f, strafeDir * 0.4f);
				}
				return;
			}
			decisionTimer = decisionInterval() + random.nextInt(4);
			decide(level, target, dist);
		}
	}

	private float getAttackAnimScale() {
		return swinging ? 1f : 0f;
	}
}
