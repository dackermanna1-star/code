package net.abyssaldescent.entity.ai;

import java.util.EnumSet;
import net.abyssaldescent.entity.DungeonMonster;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.util.DefaultRandomPos;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;

/**
 * Archer behaviour: hold a preferred band of distance, back off when rushed, strafe while drawing, and only loose when
 * there is line of sight. The draw is a visible telegraph (the bow is raised for the full draw time).
 */
public class KitingBowGoal<T extends PathfinderMob & RangedAttackMob> extends Goal {
	private final T mob;
	private final double speed;
	private final float minRange;
	private final float maxRange;
	private final int drawTicks;
	private int cooldown;
	private int seeTime;
	private int strafeTicks;
	private boolean strafeClockwise;
	private int retreatCooldown;

	public KitingBowGoal(T mob, double speed, float minRange, float maxRange, int drawTicks) {
		this.mob = mob;
		this.speed = speed;
		this.minRange = minRange;
		this.maxRange = maxRange;
		this.drawTicks = drawTicks;
		setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return mob.getTarget() != null && mob.getTarget().isAlive() && mob.isHolding(Items.BOW);
	}

	@Override
	public boolean canContinueToUse() {
		return canUse() || !mob.getNavigation().isDone();
	}

	@Override
	public void start() {
		mob.setAggressive(true);
	}

	@Override
	public void stop() {
		mob.setAggressive(false);
		seeTime = 0;
		mob.stopUsingItem();
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void tick() {
		LivingEntity target = mob.getTarget();
		if (target == null) {
			return;
		}
		double dist = mob.distanceTo(target);
		boolean sees = mob.getSensing().hasLineOfSight(target);
		seeTime = sees ? Math.max(0, seeTime) + 1 : Math.min(0, seeTime) - 1;
		if (retreatCooldown > 0) {
			retreatCooldown--;
		}

		if (dist < minRange && retreatCooldown == 0) {
			// Back away from melee pressure.
			Vec3 away = DefaultRandomPos.getPosAway(mob, 8, 4, target.position());
			if (away != null) {
				mob.getNavigation().moveTo(away.x, away.y, away.z, speed * 1.2);
				retreatCooldown = 30;
			}
		} else if (dist > maxRange || !sees) {
			mob.getNavigation().moveTo(target, speed);
		} else if (mob.getNavigation().isDone() || retreatCooldown == 0) {
			mob.getNavigation().stop();
			if (++strafeTicks >= 30) {
				strafeClockwise = mob.getRandom().nextBoolean();
				strafeTicks = 0;
			}
			mob.getMoveControl().strafe(0.0F, strafeClockwise ? 0.4F : -0.4F);
		}
		mob.getLookControl().setLookAt(target, 30.0F, 30.0F);
		mob.lookAt(target, 30.0F, 30.0F);

		if (mob.isUsingItem()) {
			int used = mob.getTicksUsingItem();
			if (!sees && seeTime < -40) {
				mob.stopUsingItem();
			} else if (sees && used >= cadenceScaled(mob, drawTicks)) {
				mob.stopUsingItem();
				mob.performRangedAttack(target, BowItem.getPowerForTime(used));
				cooldown = cadenceScaled(mob, 20);
			}
		} else if (--cooldown <= 0 && seeTime >= -20) {
			mob.startUsingItem(InteractionHand.MAIN_HAND);
		}
	}

	/** Scales a draw or cooldown time by the archer's attack cadence (frenzied elites draw and loose faster). */
	public static int cadenceScaled(Mob mob, int base) {
		return mob instanceof DungeonMonster monster ? Math.max(1, Math.round(base * monster.cadence())) : base;
	}
}
