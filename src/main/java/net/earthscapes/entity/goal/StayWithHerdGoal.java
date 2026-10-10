package net.earthscapes.entity.goal;

import java.util.EnumSet;
import java.util.List;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

/**
 * Herd animals drift back towards the middle of their herd when they wander too far from it, so
 * herds stay together as they graze across the plains.
 */
public class StayWithHerdGoal extends Goal {
	private final PathfinderMob mob;
	private final float radius;
	private final double speed;
	private Vec3 centre = Vec3.ZERO;
	private int cooldown;

	public StayWithHerdGoal(PathfinderMob mob, float radius, double speed) {
		this.mob = mob;
		this.radius = radius;
		this.speed = speed;
		this.setFlags(EnumSet.of(Goal.Flag.MOVE));
	}

	@Override
	public boolean canUse() {
		if (this.cooldown > 0) {
			this.cooldown--;
			return false;
		}
		this.cooldown = reducedTickDelay(60 + this.mob.getRandom().nextInt(60));
		List<? extends PathfinderMob> herd = this.mob.level().getEntitiesOfClass(this.mob.getClass(),
			this.mob.getBoundingBox().inflate(this.radius * 2.5), other -> other != this.mob && other.getType() == this.mob.getType() && other.isAlive());
		if (herd.isEmpty()) {
			return false;
		}
		double x = 0, y = 0, z = 0;
		for (PathfinderMob other : herd) {
			x += other.getX();
			y += other.getY();
			z += other.getZ();
		}
		this.centre = new Vec3(x / herd.size(), y / herd.size(), z / herd.size());
		return this.mob.position().distanceToSqr(this.centre) > this.radius * this.radius;
	}

	@Override
	public void start() {
		Vec3 offset = new Vec3(this.mob.getRandom().nextGaussian(), 0, this.mob.getRandom().nextGaussian()).scale(this.radius * 0.3);
		Vec3 target = this.centre.add(offset);
		this.mob.getNavigation().moveTo(target.x, target.y, target.z, this.speed);
	}

	@Override
	public boolean canContinueToUse() {
		return !this.mob.getNavigation().isDone() && this.mob.position().distanceToSqr(this.centre) > this.radius * this.radius * 0.25;
	}
}
