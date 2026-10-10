package net.earthscapes.entity.goal;

import java.util.EnumSet;
import net.earthscapes.entity.EsAnimal;
import net.minecraft.world.entity.ai.goal.Goal;

/** Stops now and then to graze or browse for a couple of seconds (without stripping the ground). */
public class GrazeGoal extends Goal {
	private final EsAnimal mob;
	private int ticks;

	public GrazeGoal(EsAnimal mob) {
		this.mob = mob;
		this.setFlags(EnumSet.of(Goal.Flag.MOVE, Goal.Flag.LOOK, Goal.Flag.JUMP));
	}

	@Override
	public boolean canUse() {
		return this.mob.onGround() && !this.mob.isInWater() && this.mob.getRandom().nextInt(this.mob.isBaby() ? 1200 : 500) == 0;
	}

	@Override
	public void start() {
		this.ticks = this.adjustedTickDelay(EsAnimal.GRAZE_TICKS);
		this.mob.level().broadcastEntityEvent(this.mob, EsAnimal.EVENT_GRAZE);
		this.mob.getNavigation().stop();
	}

	@Override
	public boolean canContinueToUse() {
		return this.ticks > 0;
	}

	@Override
	public void tick() {
		this.ticks--;
		if (this.ticks == 0) {
			this.mob.ate();
		}
	}
}
