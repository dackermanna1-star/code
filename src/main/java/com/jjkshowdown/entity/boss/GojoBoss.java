package com.jjkshowdown.entity.boss;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.registry.ModItems;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.SorcererState;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.BossEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/**
 * Satoru Gojo, the Strongest. Keeps Infinity up, controls space with Blue, punishes with Red, blinks behind his
 * target for close combat, erases with Hollow Purple at range, and seals fights with Unlimited Void.
 */
public class GojoBoss extends SorcererBoss {
	public GojoBoss(EntityType<? extends GojoBoss> type, Level level) {
		super(type, level, CharacterType.GOJO, BossEvent.BossBarColor.BLUE);
	}

	@Override
	protected void upkeep(ServerLevel level, @Nullable LivingEntity target) {
		SorcererState s = st();
		if (!s.infinity && !s.isBurntOut() && !s.isLocked() && CursedEnergy.ratio(this) > 0.15f && ready(AbilitySlot.TOGGLE)) {
			AbilityHandler.press(this, AbilitySlot.TOGGLE);
		}
	}

	@Override
	protected void decide(ServerLevel level, LivingEntity target, double dist) {
		float agg = aggression();
		float ce = CursedEnergy.ratio(this);
		boolean phase2 = phase() >= 2;
		// Unlimited Void when the target is inside range and the tank is full
		if (ready(AbilitySlot.DOMAIN) && domainMoment(dist, DomainType.UNLIMITED_VOID.radius() - 3)) {
			tap(AbilitySlot.DOMAIN);
			return;
		}
		// the target is charging an ultimate: interrupt it
		SorcererState ts = Sorcerers.peekState(target);
		if (ts != null && ts.chargingSlot == AbilitySlot.ULTIMATE && ready(AbilitySlot.TERTIARY)) {
			tap(AbilitySlot.TERTIARY);
			return;
		}
		if (dist > 14) {
			if (ready(AbilitySlot.ULTIMATE) && hasLineOfSight(target) && random.nextFloat() < 0.3f * agg + (phase2 ? 0.15f : 0)) {
				hold(AbilitySlot.ULTIMATE, 200);
				return;
			}
			float r = random.nextFloat();
			if (r < 0.35f && ready(AbilitySlot.SECONDARY) && hasLineOfSight(target)) {
				hold(AbilitySlot.SECONDARY, 12 + random.nextInt(18));
			} else if (r < 0.65f && ready(AbilitySlot.PRIMARY)) {
				hold(AbilitySlot.PRIMARY, 6 + random.nextInt(16));
			} else if (ready(AbilitySlot.TERTIARY)) {
				tap(AbilitySlot.TERTIARY);
			} else {
				moveToward(target, 1.3);
			}
		} else if (dist > 4.5) {
			float r = random.nextFloat();
			if (r < 0.32f && ready(AbilitySlot.PRIMARY)) {
				hold(AbilitySlot.PRIMARY, 4 + random.nextInt(10));
			} else if (r < 0.6f && ready(AbilitySlot.SECONDARY)) {
				hold(AbilitySlot.SECONDARY, 4 + random.nextInt(14));
			} else if (r < 0.85f && ready(AbilitySlot.TERTIARY)) {
				tap(AbilitySlot.TERTIARY);
			} else {
				moveToward(target, 1.4);
			}
		} else {
			float r = random.nextFloat();
			boolean amplified = Sorcerers.hasAmplification(target);
			if (amplified && r < 0.45f) {
				// Domain Amplification neutralises Infinity in melee: blast them away or make distance
				if (ready(AbilitySlot.SECONDARY)) tap(AbilitySlot.SECONDARY);
				else com.jjkshowdown.combat.Movement.dodge(this, random.nextBoolean() ? 1 : -1, -1);
			} else if (r < 0.2f && ready(AbilitySlot.SECONDARY)) {
				tap(AbilitySlot.SECONDARY); // point-blank Red
			} else if (r < 0.32f && ready(AbilitySlot.TERTIARY)) {
				tap(AbilitySlot.TERTIARY); // blink behind
			} else {
				moveToward(target, 1.2);
			}
		}
	}

	@Override
	protected void counterDomain(ServerLevel level, DomainEntity enemy, LivingEntity target) {
		if (ready(AbilitySlot.DOMAIN)) {
			tap(AbilitySlot.DOMAIN);
		} else if (enemy.domainType() == DomainType.MALEVOLENT_SHRINE && ready(AbilitySlot.TERTIARY)) {
			// no barrier: leave the radius
			tap(AbilitySlot.TERTIARY);
		}
	}

	@Override
	protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
		super.dropCustomDeathLoot(level, source, recentlyHit);
		spawnAtLocation(level, new ItemStack(ModItems.GOJO_BLINDFOLD));
	}
}
