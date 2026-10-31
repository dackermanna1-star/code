package com.jjkshowdown.combat;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainManager;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.registry.ModEffects;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.Vec3;

/**
 * The central damage pipeline, invoked by a wrapper around {@code LivingEntity#hurtServer}. Handles cinematic
 * invulnerability, dodge i-frames, Infinity, guarding/parrying, melee combos, Black Flash, counters,
 * domain bonuses, difficulty scaling and finishers.
 */
public final class CombatHandler {
	private CombatHandler() {
	}

	/** Per-call context carried from {@link #pre} to {@link #post}. */
	public static final class Hit {
		public boolean cancel;
		public float amount;
		ComboSystem.MeleeResult melee;
	}

	private static final Hit CANCELLED = new Hit();

	static {
		CANCELLED.cancel = true;
	}

	public static boolean isMelee(DamageSource src) {
		return (src.is(DamageTypes.PLAYER_ATTACK) || src.is(DamageTypes.MOB_ATTACK) || src.is(DamageTypes.MOB_ATTACK_NO_AGGRO))
				&& src.getDirectEntity() == src.getEntity();
	}

	public static Hit pre(LivingEntity target, ServerLevel level, DamageSource source, float amount) {
		Hit hit = new Hit();
		hit.amount = amount;
		if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY) || Float.isNaN(amount)) return hit;
		JjkConfig cfg = JjkConfig.get();
		SorcererState ts = Sorcerers.peekState(target);
		Entity attacker = source.getEntity();
		long now = level.getGameTime();

		// cinematic participants are untouchable
		if (ts != null && ts.cinematicLock > 0) return CANCELLED;

		boolean sureHit = source.is(ModDamageTypes.SURE_HIT);
		// dodge invulnerability
		if (ts != null && ts.iFrames > 0 && !sureHit && (attacker != null || source.getDirectEntity() != null || source.is(DamageTypeTags.IS_EXPLOSION))) {
			if (now - ts.dodgeTick <= 3 && attacker instanceof LivingEntity) {
				ts.counterTicks = Math.max(ts.counterTicks, 30);
				ts.dirty = true;
				JjkNetwork.notify(target, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.perfect_dodge"), 0x9FE8FF);
				JjkNetwork.screenEffect(target, Payloads.ScreenEffect.SLOW_MO, 1.0f, 14, 0);
				Mastery.addXp(target, 8);
			}
			return CANCELLED;
		}

		// Infinity
		if (Sorcerers.hasInfinity(target) && blockedByInfinity(source, attacker)) {
			onInfinityBlock(level, target, source, attacker);
			return CANCELLED;
		}

		// guard / parry
		if (ts != null && ts.blocking && !source.is(ModDamageTypes.UNBLOCKABLE) && (attacker != null || source.getDirectEntity() != null)
				&& isInFront(target, source)) {
			long since = now - ts.blockStartTick;
			boolean parryable = isMelee(source) || source.getDirectEntity() instanceof Projectile;
			if (parryable && since <= cfg.combat.parryWindowTicks) {
				parry(level, target, ts, source);
				return CANCELLED;
			}
			float reduction = source.is(ModDamageTypes.IS_TECHNIQUE) ? cfg.combat.blockDamageReduction * 0.65f : cfg.combat.blockDamageReduction;
			float absorbed = amount * reduction;
			float ceCost = absorbed * 4f;
			if (CursedEnergy.spend(target, ceCost)) {
				hit.amount = amount - absorbed;
				Fx.sound(target, ModSounds.BLOCK, 1.0f, 0.9f + target.getRandom().nextFloat() * 0.2f);
				Fx.particles(level, net.minecraft.core.particles.ParticleTypes.CRIT, target.getEyePosition().add(target.getLookAngle().scale(0.6)), 6, 0.2, 0.2);
			} else {
				// guard break
				ts.blocking = false;
				ts.staggerTicks = Math.max(ts.staggerTicks, 25);
				ts.dirty = ts.visualDirty = true;
				JjkNetwork.notify(target, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.guard_break"), 0xFF6060);
				Fx.sound(target, ModSounds.PARRY, 1.0f, 0.6f);
			}
		}

		// melee combo, Black Flash, counters, Domain Amplification
		if (attacker instanceof LivingEntity la && Sorcerers.isSorcerer(la) && isMelee(source)) {
			target.invulnerableTime = 0; // combos must connect at combat speed
			hit.melee = ComboSystem.onMeleeHit(level, la, target, hit.amount);
			hit.amount = hit.melee.amount();
		}

		// Unlimited Void: the paralysed are helpless against Gojo
		if (attacker instanceof LivingEntity la && target.hasEffect(ModEffects.INFORMATION_OVERLOAD)) {
			DomainEntity d = DomainManager.ownedBy(la);
			if (d != null && d.contains(target)) hit.amount *= 1.5f;
		}

		// difficulty: damage players take from the mod and from rival bosses
		if (target instanceof Player && (attacker instanceof SorcererBoss || source.is(ModDamageTypes.IS_TECHNIQUE))) {
			hit.amount *= cfg.difficultyPreset().playerDamageTaken;
		}
		if (Sorcerers.isSorcerer(target) && source.is(DamageTypeTags.IS_FALL)) {
			hit.amount *= 1.0f - cfg.combat.fallDamageReduction;
		}
		return hit;
	}

	public static void post(LivingEntity target, ServerLevel level, DamageSource source, Hit hit, boolean applied) {
		if (hit.melee != null && source.getEntity() instanceof LivingEntity attacker) {
			ComboSystem.afterMeleeHit(level, attacker, target, hit.melee, applied);
		}
	}

	private static boolean blockedByInfinity(DamageSource source, Entity attacker) {
		if (source.is(ModDamageTypes.BYPASSES_INFINITY)) return false;
		if (attacker != null && Sorcerers.hasAmplification(attacker) && isMelee(source)) return false;
		if (attacker != null || source.getDirectEntity() != null) return true;
		return source.is(DamageTypeTags.IS_EXPLOSION) || source.is(DamageTypes.FALLING_ANVIL) || source.is(DamageTypes.FALLING_BLOCK)
				|| source.is(DamageTypes.FALLING_STALACTITE) || source.is(DamageTypes.CACTUS) || source.is(DamageTypes.SWEET_BERRY_BUSH)
				|| source.is(DamageTypes.STING) || source.is(DamageTypes.THORNS);
	}

	private static void onInfinityBlock(ServerLevel level, LivingEntity gojo, DamageSource source, Entity attacker) {
		Vec3 from = source.getDirectEntity() != null ? source.getDirectEntity().position() : attacker != null ? attacker.position() : gojo.position();
		Vec3 contact = gojo.getBoundingBox().getCenter().add(from.subtract(gojo.position()).normalize().scale(0.9));
		Fx.particles(level, ModParticles.BLUE_SPARK, contact, 5, 0.15, 0.02);
		SorcererState s = Sorcerers.state(gojo);
		if (s.voiceCooldown <= 0 && gojo.getRandom().nextFloat() < 0.08f) {
			com.jjkshowdown.ability.Casting.voice(gojo, s, com.jjkshowdown.registry.VoiceLine.GOJO_INFINITY, 1.0f);
		}
		Fx.sound(level, contact, ModSounds.INFINITY_BLOCK, 0.6f, 0.9f + gojo.getRandom().nextFloat() * 0.3f);
		if (attacker instanceof LivingEntity la && isMelee(source)) {
			// the fist simply never arrives; the attacker is held off
			TechniqueDamage.knockAway(la, gojo.position(), 0.35, 0.05);
		}
	}

	private static boolean isInFront(LivingEntity target, DamageSource source) {
		Vec3 src = source.getSourcePosition();
		if (src == null) return true;
		Vec3 to = src.subtract(target.position());
		to = new Vec3(to.x, 0, to.z);
		if (to.lengthSqr() < 1.0E-4) return true;
		Vec3 look = target.getViewVector(1.0f);
		look = new Vec3(look.x, 0, look.z);
		return look.lengthSqr() < 1.0E-4 || to.normalize().dot(look.normalize()) > -0.2;
	}

	private static void parry(ServerLevel level, LivingEntity defender, SorcererState ds, DamageSource source) {
		ds.counterTicks = Math.max(ds.counterTicks, 30);
		ds.dirty = true;
		Entity attacker = source.getEntity();
		Vec3 at = defender.getEyePosition().add(defender.getLookAngle().scale(0.7));
		Fx.sound(defender, ModSounds.PARRY, 1.4f, 1.0f + defender.getRandom().nextFloat() * 0.15f);
		Fx.particles(level, ModParticles.IMPACT_FLASH, at, 1, 0, 0);
		Fx.burst(level, net.minecraft.core.particles.ParticleTypes.CRIT, at, 20, 0.6);
		JjkNetwork.notify(defender, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.parry"), 0xFFFFFF);
		JjkNetwork.screenEffect(defender, Payloads.ScreenEffect.FLASH, 0.5f, 6, 0xFFFFFF);
		Mastery.addXp(defender, 10);
		if (attacker instanceof LivingEntity la) {
			SorcererState as = Sorcerers.state(la);
			as.staggerTicks = Math.max(as.staggerTicks, 35);
			as.setPose(com.jjkshowdown.sorcerer.CastPose.STAGGER, 30);
			as.dirty = true;
			com.jjkshowdown.ability.AbilityHandler.interrupt(la);
			TechniqueDamage.knockAway(la, defender.position(), 0.9, 0.25);
			JjkNetwork.notify(la, Payloads.Notify.WARN, Component.translatable("message.jjkshowdown.parried"), 0xFF6060);
		} else if (source.getDirectEntity() instanceof Projectile proj) {
			proj.setDeltaMovement(proj.getDeltaMovement().scale(-0.6));
			proj.hurtMarked = true;
		}
		if (Sorcerers.character(defender) == CharacterType.SUKUNA) {
			Fx.particles(level, ModParticles.SLASH_RED, at, 2, 0.3, 0.0);
		}
	}
}
