package dev.juukulius.combat;

import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.ActionState;
import dev.juukulius.character.JuliusAttachments;
import dev.juukulius.character.JuliusData;
import dev.juukulius.character.JuliusServer;
import dev.juukulius.combat.CombatRules.ComboStep;
import dev.juukulius.entity.ClaristaWaveEntity;
import dev.juukulius.entity.ClauzeriaVortexEntity;
import dev.juukulius.network.ActionRequestPayload.Action;
import dev.juukulius.network.ActionResultPayload.DenyReason;
import dev.juukulius.network.FxType;
import dev.juukulius.network.JuliusNetworking;
import dev.juukulius.registry.JuliusDamageTypes;
import dev.juukulius.registry.JuliusSounds;
import dev.juukulius.spirit.Spirit;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Sword techniques with House Juukulius's sword: the three-hit combo, the precise heavy strike, the charged Al Clarista
 * wave, Al Clauzeria and the Al Cranvel ultimate. All run on the server; the impact frames are scheduled so damage
 * lands when the blade visibly connects.
 */
public final class SwordArts {
	/** Trail/flash colours per combo step: cool, warm, full spectrum. */
	public static final int[] COMBO_COLORS = {0x7FB8FF, 0xFFB15A, 0xFFFFFF};

	private SwordArts() {
	}

	// ------------------------------------------------------------------------------------------------ combo

	public static void swing(ServerPlayer player, JuliusData data, ActionState state, int requestedStep) {
		Action action = Action.SWING;
		if (!data.transformed) {
			JuliusNetworking.deny(player, action, DenyReason.NOT_TRANSFORMED);
			return;
		}

		if (!JuliusServer.holdsSword(player)) {
			JuliusNetworking.deny(player, action, DenyReason.NO_SWORD);
			return;
		}

		if (player.isUsingItem() || (state.lockTicks > CombatRules.INPUT_TOLERANCE && !state.lockFromCombo)) {
			JuliusNetworking.deny(player, action, DenyReason.BUSY);
			return;
		}

		float speed = JuliusServer.actionSpeed(data);
		long now = player.level().getGameTime();
		long sinceLast = now - state.lastSwingTime;
		int step;
		if (state.comboStep <= 0 || state.comboStep > CombatRules.COMBO.length) {
			step = 1;
		} else {
			ComboStep previous = CombatRules.COMBO[state.comboStep - 1];
			if (previous.step() == CombatRules.COMBO.length) {
				int recovery = CombatRules.scaled(previous.totalTicks() + CombatRules.FINISHER_RECOVERY, speed);
				if (sinceLast < recovery - CombatRules.INPUT_TOLERANCE) {
					JuliusNetworking.deny(player, action, DenyReason.TOO_FAST);
					return;
				}

				step = 1;
			} else {
				if (sinceLast < CombatRules.scaled(previous.chainFrom(), speed) - CombatRules.INPUT_TOLERANCE) {
					JuliusNetworking.deny(player, action, DenyReason.TOO_FAST);
					return;
				}

				step = sinceLast <= CombatRules.scaled(previous.chainUntil(), speed) + CombatRules.INPUT_TOLERANCE ? previous.step() + 1 : 1;
			}
		}

		ComboStep combo = CombatRules.COMBO[step - 1];
		state.comboStep = step;
		state.lastSwingTime = now;
		state.lockTicks = CombatRules.scaled(combo.totalTicks(), speed);
		state.lockFromCombo = true;

		JuliusAnim animation = step == 1 ? JuliusAnim.SLASH_1 : step == 2 ? JuliusAnim.SLASH_2 : JuliusAnim.SLASH_3;
		JuliusNetworking.sendAnimation(player, animation, speed, false);
		if (step != requestedStep) {
			JuliusNetworking.sendCorrection(player, animation, speed);
		}

		var sound = step == 1 ? JuliusSounds.SWORD_SWING_1 : step == 2 ? JuliusSounds.SWORD_SWING_2 : JuliusSounds.SWORD_SWING_3;
		JuliusServer.playSound(player, sound, 0.8F, 0.95F + player.getRandom().nextFloat() * 0.1F, player);
		state.schedule(CombatRules.scaled(combo.impactTick(), speed) - 1, () -> comboImpact(player, combo));
	}

	private static void comboImpact(ServerPlayer player, ComboStep combo) {
		JuliusData data = JuliusAttachments.data(player);
		if (!JuliusServer.holdsSword(player)) {
			return;
		}

		ServerLevel level = player.level();
		boolean ultimate = data.ultimateActive();
		double reach = combo.reach() + (ultimate ? 0.7 : 0.0);
		List<LivingEntity> targets = CombatUtil.targetsInArc(player, reach, combo.halfAngleDegrees(), 1.8);
		ItemStack weapon = player.getMainHandItem();
		float baseDamage = combo.damage() * (ultimate ? CombatRules.ULTIMATE_DAMAGE_MULTIPLIER : 1.0F);
		Vec3 look = player.getLookAngle();
		int hits = 0;

		for (LivingEntity target : targets) {
			DamageSource source = level.damageSources().source(JuliusDamageTypes.SWORD_ART, player, player);
			float damage = EnchantmentHelper.modifyDamage(level, weapon, target, source, baseDamage);
			if (CombatUtil.damage(player, target, JuliusDamageTypes.SWORD_ART, player, damage)) {
				hits++;
				double lift = combo.step() == CombatRules.COMBO.length ? 0.25 : 0.05;
				CombatUtil.knockback(target, CombatUtil.horizontalDirection(player.position(), target.position(), look), combo.knockback(), lift);
				EnchantmentHelper.doPostAttackEffectsWithItemSource(level, target, source, weapon);
				Vec3 hitPos = CombatUtil.closestPoint(target.getBoundingBox(), player.getEyePosition()).lerp(target.getBoundingBox().getCenter(), 0.5);
				JuliusNetworking.sendFx(level, FxType.SLASH_HIT, target, hitPos, look, COMBO_COLORS[combo.step() - 1], combo.step());
				JuliusServer.restoreMana(player, CombatRules.MANA_PER_SWORD_HIT);
			}
		}

		if (hits > 0) {
			weapon.hurtAndBreak(1, player, EquipmentSlot.MAINHAND);
			JuliusServer.playSoundAt(level, targets.getFirst().position().add(0.0, 1.0, 0.0), JuliusSounds.SWORD_HIT, 0.9F,
				0.9F + combo.step() * 0.08F);
		}
	}

	// ------------------------------------------------------------------------------------------------ specials

	public static void special(ServerPlayer player, JuliusData data, ActionState state, boolean clauzeria) {
		Action action = Action.SWORD_SPECIAL;
		if (!data.transformed) {
			JuliusNetworking.deny(player, action, DenyReason.NOT_TRANSFORMED);
			return;
		}

		if (!JuliusServer.holdsSword(player)) {
			JuliusNetworking.deny(player, action, DenyReason.NO_SWORD);
			return;
		}

		if (player.isUsingItem()) {
			JuliusNetworking.deny(player, action, DenyReason.BUSY);
			return;
		}

		if (clauzeria) {
			alClauzeria(player, data, state);
		} else {
			heavyStrike(player, data, state);
		}
	}

	private static void heavyStrike(ServerPlayer player, JuliusData data, ActionState state) {
		if (!JuliusServer.beginAbility(player, data, state, Ability.HEAVY_STRIKE, Action.SWORD_SPECIAL)) {
			return;
		}

		JuliusServer.playSound(player, JuliusSounds.SWORD_HEAVY_SWING, 0.9F, 1.0F, player);
		state.schedule(CombatRules.HEAVY_IMPACT_TICK - 1, () -> heavyImpact(player));
	}

	private static void heavyImpact(ServerPlayer player) {
		JuliusData data = JuliusAttachments.data(player);
		ServerLevel level = player.level();
		boolean ultimate = data.ultimateActive();
		double reach = CombatRules.HEAVY_REACH + (ultimate ? 0.8 : 0.0);
		LivingEntity target = CombatUtil.raycastTarget(player, reach, 0.6);
		Vec3 look = player.getLookAngle();
		if (target != null) {
			ItemStack weapon = player.getMainHandItem();
			DamageSource source = level.damageSources().source(JuliusDamageTypes.SWORD_ART, player, player);
			float damage = EnchantmentHelper.modifyDamage(level, weapon, target, source,
				CombatRules.HEAVY_DAMAGE * (ultimate ? CombatRules.ULTIMATE_DAMAGE_MULTIPLIER : 1.0F));
			if (CombatUtil.damage(player, target, JuliusDamageTypes.SWORD_ART, player, damage)) {
				CombatUtil.knockback(target, look, CombatRules.HEAVY_KNOCKBACK, 0.38);
				EnchantmentHelper.doPostAttackEffectsWithItemSource(level, target, source, weapon);
				weapon.hurtAndBreak(2, player, EquipmentSlot.MAINHAND);
				Vec3 hitPos = target.getBoundingBox().getCenter();
				JuliusNetworking.sendFx(level, FxType.HEAVY_HIT, target, hitPos, look, 0xFFFFFF, 1.0F);
				JuliusServer.playSoundAt(level, hitPos, JuliusSounds.SWORD_HEAVY_HIT, 1.0F, 1.0F);
				JuliusServer.restoreMana(player, CombatRules.MANA_PER_SWORD_HIT * 2.0F);
			}

			return;
		}

		// No enemy: the blade strikes the ground in front with a small shockwave.
		Vec3 eye = player.getEyePosition();
		HitResult hit = level.clip(new ClipContext(eye, eye.add(look.scale(reach)), ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
		Vec3 impact = hit.getType() == HitResult.Type.BLOCK ? hit.getLocation() : player.position().add(new Vec3(look.x, 0.0, look.z).normalize().scale(2.0));
		for (LivingEntity nearby : CombatUtil.targetsInSphere(player, impact, 1.8)) {
			if (CombatUtil.damage(player, nearby, JuliusDamageTypes.SWORD_ART, player, 4.0F)) {
				CombatUtil.knockback(nearby, CombatUtil.horizontalDirection(impact, nearby.position(), look), 0.8, 0.3);
			}
		}

		JuliusNetworking.sendFx(level, FxType.HEAVY_GROUND, player, impact, look, 0xFFFFFF, 0.6F);
		JuliusServer.playSoundAt(level, impact, JuliusSounds.SWORD_HEAVY_HIT, 0.7F, 1.2F);
	}

	private static void alClauzeria(ServerPlayer player, JuliusData data, ActionState state) {
		if (!JuliusServer.beginAbility(player, data, state, Ability.AL_CLAUZERIA, Action.SWORD_SPECIAL)) {
			return;
		}

		ServerLevel level = player.level();
		if (!data.spiritsOut) {
			JuliusServer.setSpiritsOut(player, data, state, true);
			state.lockTicks = Ability.AL_CLAUZERIA.lockTicks;
		}

		// The rainbow wall of six elements guards Julius while the spirits gather.
		state.barrierEnd = level.getGameTime() + 70L;
		JuliusServer.updateAppearance(player);
		// The caster already played the gather effect and sounds locally (prediction), everyone else gets them here.
		JuliusNetworking.sendFx(level, FxType.CLAUZERIA_GATHER, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F, player);
		JuliusServer.playSound(player, JuliusSounds.CLAUZERIA_CHARGE, 1.0F, 1.0F, player);
		JuliusServer.playSound(player, JuliusSounds.BARRIER, 0.7F, 1.0F, player);
		player.addEffect(new MobEffectInstance(MobEffects.RESISTANCE, 70, 2, false, false, true), player);

		state.schedule(14, () -> {
			Vec3 look = player.getLookAngle();
			Vec3 tip = player.getEyePosition().add(look.scale(1.3)).add(0.0, -0.25, 0.0);
			ClauzeriaVortexEntity vortex = new ClauzeriaVortexEntity(level, player, tip, look);
			level.addFreshEntity(vortex);
		});
	}

	// ------------------------------------------------------------------------------------------------ Al Clarista

	/** Called every tick while the sword is being charged (right mouse held). */
	public static void chargeTick(ServerPlayer player, int ticksUsed) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		if (!data.transformed) {
			player.stopUsingItem();
			return;
		}

		if (ticksUsed == CombatRules.CHARGE_MIN_TICKS && state.chargeCue < 1) {
			state.chargeCue = 1;
			JuliusServer.playSound(player, JuliusSounds.SWORD_CHARGE, 0.8F, 1.0F, null);
		} else if (ticksUsed == CombatRules.CHARGE_FULL_TICKS && state.chargeCue < 2) {
			state.chargeCue = 2;
			JuliusServer.playSound(player, JuliusSounds.SWORD_CHARGE_READY, 0.9F, 1.0F, null);
		}
	}

	/** Releases the charge: the long-range form of Al Clarista, a rainbow crescent of the six spirits' light. */
	public static boolean releaseCharge(ServerPlayer player, int ticksUsed) {
		JuliusData data = JuliusAttachments.data(player);
		ActionState state = JuliusServer.state(player);
		state.chargeCue = 0;
		if (!data.transformed || !JuliusServer.holdsSword(player) || ticksUsed < CombatRules.CHARGE_MIN_TICKS) {
			return false;
		}

		Ability ability = Ability.AL_CLARISTA;
		float progress = CombatRules.chargeProgress(ticksUsed);
		float extra = CombatRules.WAVE_EXTRA_COST * progress;
		if (data.mana + 0.01F < CombatRules.cost(ability, data.ultimateActive()) + extra * (data.ultimateActive() ? CombatRules.ULTIMATE_COST_MULTIPLIER : 1.0F)) {
			JuliusNetworking.deny(player, Action.SWING, DenyReason.NO_MANA);
			return false;
		}

		if (!JuliusServer.beginAbility(player, data, state, ability, Action.SWING)) {
			return false;
		}

		JuliusServer.spendMana(data, state, extra * (data.ultimateActive() ? CombatRules.ULTIMATE_COST_MULTIPLIER : 1.0F));
		ServerLevel level = player.level();
		Vec3 look = player.getLookAngle();
		Vec3 start = player.getEyePosition().add(look.scale(0.8)).add(0.0, -0.3, 0.0);
		ClaristaWaveEntity wave = new ClaristaWaveEntity(level, player, start, look, progress, data.ultimateActive());
		level.addFreshEntity(wave);
		JuliusServer.playSound(player, JuliusSounds.SWORD_WAVE_RELEASE, 1.0F, 1.0F, player);
		return true;
	}

	// ------------------------------------------------------------------------------------------------ Al Cranvel

	public static void alCranvel(ServerPlayer player, JuliusData data, ActionState state) {
		Action action = Action.ULTIMATE;
		if (!data.transformed) {
			JuliusNetworking.deny(player, action, DenyReason.NOT_TRANSFORMED);
			return;
		}

		if (data.ultimateActive()) {
			JuliusNetworking.deny(player, action, DenyReason.ULTIMATE_ACTIVE);
			return;
		}

		if (data.mana + 0.01F < CombatRules.ULTIMATE_MIN_MANA && data.cooldown(Ability.AL_CRANVEL) <= 0) {
			JuliusNetworking.deny(player, action, DenyReason.NO_MANA);
			return;
		}

		if (!JuliusServer.beginAbility(player, data, state, Ability.AL_CRANVEL, action)) {
			return;
		}

		// The cooldown starts when the state ends; while active the slot shows the remaining duration instead.
		data.cooldowns[Ability.AL_CRANVEL.ordinal()] = 0;
		ServerLevel level = player.level();
		state.invulnerableTicks = Ability.AL_CRANVEL.lockTicks;
		if (player.isUsingItem()) {
			player.stopUsingItem();
		}

		JuliusServer.startUltimate(player, data, state);
		JuliusNetworking.sendFx(level, FxType.CRANVEL_ACTIVATE, player, player.position(), player.getLookAngle(), 0xFFFFFF, 1.0F, player);
		JuliusServer.playSound(player, JuliusSounds.ULTIMATE_ACTIVATE, 1.2F, 1.0F, player);

		state.schedule(18, () -> {
			// Swallowed by the rainbow: the six-fold power bursts outward.
			Vec3 center = player.position().add(0.0, 1.0, 0.0);
			for (LivingEntity target : CombatUtil.targetsInSphere(player, center, 4.5)) {
				if (CombatUtil.damage(player, target, JuliusDamageTypes.RAINBOW, player, 6.0F)) {
					CombatUtil.knockback(target, CombatUtil.horizontalDirection(center, target.position(), player.getLookAngle()), 1.3, 0.45);
				}
			}

			JuliusNetworking.sendFx(level, FxType.CRANVEL_BURST, player, center, player.getLookAngle(), 0xFFFFFF, 4.5F);
			JuliusServer.playSoundAt(level, center, JuliusSounds.CLAUZERIA_BURST, 0.8F, 1.25F);
		});
	}

	public static int spiritColor(JuliusData data) {
		return Spirit.byIndex(data.selectedSpirit).color;
	}
}
