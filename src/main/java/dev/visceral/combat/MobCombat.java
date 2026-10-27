package dev.visceral.combat;

import dev.visceral.config.CommonConfig;
import dev.visceral.entity.CombatState;
import dev.visceral.net.Payloads;
import dev.visceral.net.ServerNet;
import dev.visceral.state.PhysState;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;

/**
 * Telegraphed mob melee: instead of hitting instantly, a mob winds up for a few ticks (clients
 * animate it), then strikes if the target is still in reach. Hitting or kicking the mob during
 * the wind-up interrupts it, and a whiffed or interrupted attack leaves a defensive opening.
 */
public final class MobCombat {
	private MobCombat() {
	}

	/** Returns true if the attack was converted into a wind-up (vanilla attack must not happen). */
	public static boolean beginWindup(Mob mob, CombatState cs, LivingEntity target) {
		CommonConfig cfg = CommonConfig.get();
		if (!cfg.mobWindups || cfg.mobWindupTicks <= 0) return false;
		if (cs.windupTicks > 0 || cs.state != PhysState.STANDING) return true;
		int ticks = cfg.mobWindupTicks;
		cs.windupTicks = ticks;
		cs.windupTarget = target;
		ServerNet.broadcast(mob, new Payloads.PlayAnim(mob.getId(), Payloads.PlayAnim.MOB_WINDUP, ticks / 7f));
		return true;
	}

	public static void tick(Mob mob, CombatState cs) {
		if (cs.windupTicks <= 0) return;
		if (cs.state != PhysState.STANDING || !mob.isAlive()) {
			cs.windupTicks = 0;
			cs.windupTarget = null;
			return;
		}
		LivingEntity target = cs.windupTarget;
		if (target != null && target.isAlive()) mob.getLookControl().setLookAt(target, 30f, 30f);
		if (--cs.windupTicks > 0) return;
		cs.windupTarget = null;
		if (!(mob.level() instanceof ServerLevel level)) return;
		boolean inReach = target != null && target.isAlive() && target.level() == mob.level()
			&& (mob.isWithinMeleeAttackRange(target) || mob.distanceToSqr(target) <= 2.6 * 2.6 + mob.getBbWidth() * mob.getBbWidth())
			&& mob.getSensing().hasLineOfSight(target);
		mob.swing(InteractionHand.MAIN_HAND);
		if (inReach) {
			mob.doHurtTarget(level, target);
			ServerNet.broadcast(mob, new Payloads.PlayAnim(mob.getId(), Payloads.PlayAnim.MOB_STRIKE, 1f));
		} else {
			cs.openingTicks = Math.max(cs.openingTicks, 16);
			ServerNet.broadcast(mob, new Payloads.PlayAnim(mob.getId(), Payloads.PlayAnim.MOB_WHIFF, 1f));
		}
	}
}
