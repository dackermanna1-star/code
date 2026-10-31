package com.jjkshowdown.entity.boss;

import com.jjkshowdown.ability.AbilityHandler;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.combat.Movement;
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
 * Ryomen Sukuna, the King of Curses. Shreds from range with Dismantle, closes in to Cleave, fights through Infinity
 * with Domain Amplification, opens Malevolent Shrine, follows it with an empowered Fuga, and — against Infinity —
 * chants the World-Cutting Slash. At half health he takes his true Heian-era form.
 */
public class SukunaBoss extends SorcererBoss {
	public SukunaBoss(EntityType<? extends SukunaBoss> type, Level level) {
		super(type, level, CharacterType.SUKUNA, BossEvent.BossBarColor.RED);
	}

	public boolean isHeianForm() {
		return phase() >= 2;
	}

	@Override
	protected void upkeep(ServerLevel level, @Nullable LivingEntity target) {
		SorcererState s = st();
		if (target == null || s.isLocked()) return;
		boolean vsInfinity = Sorcerers.hasInfinity(target);
		double dist = distanceTo(target);
		if (vsInfinity && dist < 6 && !s.amplification && s.chargingSlot == null && ready(AbilitySlot.TOGGLE)) {
			AbilityHandler.press(this, AbilitySlot.TOGGLE);
		} else if (s.amplification && (dist > 9 || !vsInfinity) && CursedEnergy.ratio(this) < 0.95f) {
			AbilityHandler.press(this, AbilitySlot.TOGGLE);
		}
	}

	@Override
	protected void decide(ServerLevel level, LivingEntity target, double dist) {
		float agg = aggression();
		float ce = CursedEnergy.ratio(this);
		SorcererState s = st();
		boolean vsInfinity = Sorcerers.hasInfinity(target);
		if (s.empoweredFugaTicks > 0 && ready(AbilitySlot.TERTIARY)) {
			hold(AbilitySlot.TERTIARY, 24);
			return;
		}
		if (ready(AbilitySlot.DOMAIN) && domainMoment(dist, DomainType.MALEVOLENT_SHRINE.radius() - 4)) {
			tap(AbilitySlot.DOMAIN);
			return;
		}
		if (vsInfinity && dist > 6 && ready(AbilitySlot.ULTIMATE) && hasLineOfSight(target) && random.nextFloat() < 0.35f * agg) {
			hold(AbilitySlot.ULTIMATE, 200);
			return;
		}
		if (dist > 13) {
			float r = random.nextFloat();
			if (r < 0.45f && ready(AbilitySlot.PRIMARY) && !vsInfinity) {
				hold(AbilitySlot.PRIMARY, 18 + random.nextInt(18)); // barrage
			} else if (r < 0.65f && ready(AbilitySlot.TERTIARY) && !vsInfinity) {
				hold(AbilitySlot.TERTIARY, 24);
			} else {
				moveToward(target, 1.4);
				if (random.nextFloat() < 0.4f) Movement.dodge(this, 0, 1);
			}
		} else if (dist > 4.5) {
			float r = random.nextFloat();
			if (vsInfinity) {
				// techniques cannot reach through Infinity: close in with Domain Amplification
				if (r < 0.6f) Movement.dodge(this, 0, 1);
				moveToward(target, 1.45);
			} else if (r < 0.4f && ready(AbilitySlot.PRIMARY)) {
				tap(AbilitySlot.PRIMARY);
			} else if (r < 0.7f) {
				Movement.dodge(this, 0, 1); // dash in
				moveToward(target, 1.4);
			} else if (ready(AbilitySlot.SECONDARY)) {
				hold(AbilitySlot.SECONDARY, isHeianForm() ? 20 : 0);
			} else {
				moveToward(target, 1.3);
			}
		} else {
			if (!vsInfinity && random.nextFloat() < 0.4f && ready(AbilitySlot.SECONDARY)) {
				hold(AbilitySlot.SECONDARY, random.nextFloat() < 0.3f ? 20 : 0);
			} else {
				moveToward(target, 1.2);
			}
		}
	}

	@Override
	protected void counterDomain(ServerLevel level, DomainEntity enemy, LivingEntity target) {
		if (ready(AbilitySlot.DOMAIN)) {
			tap(AbilitySlot.DOMAIN);
		} else if (!st().amplification && ready(AbilitySlot.TOGGLE)) {
			AbilityHandler.press(this, AbilitySlot.TOGGLE);
		}
	}

	@Override
	protected void dropCustomDeathLoot(ServerLevel level, DamageSource source, boolean recentlyHit) {
		super.dropCustomDeathLoot(level, source, recentlyHit);
		spawnAtLocation(level, new ItemStack(ModItems.SUKUNA_FINGER, 1 + random.nextInt(3)));
	}
}
