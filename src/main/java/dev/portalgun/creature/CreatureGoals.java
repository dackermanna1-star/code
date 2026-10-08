package dev.portalgun.creature;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/** AI goals shared by spec creatures. */
public final class CreatureGoals {
	private CreatureGoals() {
	}

	/** Wander through the air, staying a few blocks above the ground (flyers higher, floaters lazily). */
	public static class AirWanderGoal extends Goal {
		private final SpecCreature mob;
		private final boolean floating;

		public AirWanderGoal(SpecCreature mob, boolean floating) {
			this.mob = mob;
			this.floating = floating;
			this.setFlags(EnumSet.of(Goal.Flag.MOVE));
		}

		@Override
		public boolean canUse() {
			return this.mob.getNavigation().isDone() && this.mob.getRandom().nextInt(this.floating ? 30 : 12) == 0;
		}

		@Override
		public boolean canContinueToUse() {
			return this.mob.getNavigation().isInProgress();
		}

		@Override
		public void start() {
			Vec3 dst = this.pick();
			if (dst != null) {
				this.mob.getNavigation().moveTo(dst.x, dst.y, dst.z, 1.0);
			}
		}

		private Vec3 pick() {
			Level level = this.mob.level();
			float hover = this.mob.spec().extra.getOrDefault("hover", this.floating ? 3.0F : 5.0F);
			int range = this.floating ? 8 : 12;
			for (int attempt = 0; attempt < 10; attempt++) {
				double x = this.mob.getX() + (this.mob.getRandom().nextDouble() * 2 - 1) * range;
				double z = this.mob.getZ() + (this.mob.getRandom().nextDouble() * 2 - 1) * range;
				BlockPos.MutableBlockPos p = BlockPos.containing(x, this.mob.getY() + 2, z).mutable();
				int ground = Integer.MIN_VALUE;
				for (int i = 0; i < 24 && p.getY() > level.getMinY(); i++) {
					if (!level.getBlockState(p).getCollisionShape(level, p).isEmpty() || !level.getFluidState(p).isEmpty()) {
						ground = p.getY() + 1;
						break;
					}
					p.move(0, -1, 0);
				}
				double y;
				if (ground == Integer.MIN_VALUE) {
					y = this.mob.getY() + (this.mob.getRandom().nextDouble() * 2 - 1) * 3;
				} else {
					y = ground + hover * (0.5 + this.mob.getRandom().nextDouble());
				}
				BlockPos target = BlockPos.containing(x, y, z);
				if (level.isEmptyBlock(target) && level.isEmptyBlock(target.above()) && level.getWorldBorder().isWithinBounds(target)) {
					return new Vec3(x, y, z);
				}
			}
			return null;
		}
	}

	/** Lower the head, wind up, then ram the target. */
	public static class ChargeGoal extends Goal {
		private final SpecCreature mob;
		private int phase;
		private int ticks;
		private int cooldown = 60;
		private Vec3 dir = Vec3.ZERO;
		private boolean hit;

		public ChargeGoal(SpecCreature mob) {
			this.mob = mob;
			this.setFlags(EnumSet.of(Goal.Flag.MOVE, Goal.Flag.LOOK, Goal.Flag.JUMP));
		}

		@Override
		public boolean canUse() {
			if (this.cooldown > 0) {
				this.cooldown--;
				return false;
			}
			LivingEntity t = this.mob.getTarget();
			if (t == null || !t.isAlive() || !this.mob.onGround()) {
				return false;
			}
			double d = this.mob.distanceToSqr(t);
			return d > 16 && d < 196 && this.mob.getSensing().hasLineOfSight(t) && this.mob.getRandom().nextInt(4) == 0;
		}

		@Override
		public boolean canContinueToUse() {
			return this.phase < 2 && this.mob.getTarget() != null && this.mob.getTarget().isAlive();
		}

		@Override
		public void start() {
			this.phase = 0;
			this.ticks = 0;
			this.hit = false;
			this.mob.getNavigation().stop();
			this.mob.setFlag(SpecCreature.FLAG_CHARGE, true);
			this.mob.playSound(SoundEvents.RAVAGER_ROAR, 0.6F, 1.4F);
		}

		@Override
		public void stop() {
			this.mob.setFlag(SpecCreature.FLAG_CHARGE, false);
			this.cooldown = 80 + this.mob.getRandom().nextInt(60);
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void tick() {
			LivingEntity t = this.mob.getTarget();
			if (t == null) {
				this.phase = 2;
				return;
			}
			this.ticks++;
			if (this.phase == 0) {
				this.mob.getLookControl().setLookAt(t, 30.0F, 30.0F);
				this.mob.getNavigation().stop();
				if (this.ticks >= 15) {
					this.phase = 1;
					this.ticks = 0;
					this.dir = t.position().subtract(this.mob.position()).multiply(1, 0, 1).normalize();
				}
			} else if (this.phase == 1) {
				double speed = 0.35 + this.mob.getAttributeValue(Attributes.MOVEMENT_SPEED) * 1.2;
				Vec3 v = this.mob.getDeltaMovement();
				this.mob.setDeltaMovement(this.dir.x * speed, v.y, this.dir.z * speed);
				this.mob.setYRot((float) (Math.atan2(this.dir.z, this.dir.x) * 180 / Math.PI) - 90.0F);
				this.mob.yBodyRot = this.mob.getYRot();
				if (!this.hit && this.mob.getBoundingBox().inflate(0.4).intersects(t.getBoundingBox()) && this.mob.level() instanceof ServerLevel sl) {
					this.hit = true;
					float dmg = (float) this.mob.getAttributeValue(Attributes.ATTACK_DAMAGE) * 1.5F;
					if (t.hurtServer(sl, this.mob.damageSources().mobAttack(this.mob), dmg)) {
						t.knockback(1.4, -this.dir.x, -this.dir.z);
						t.hurtMarked = true;
					}
					this.phase = 2;
				}
				if (this.ticks > 25 || (this.mob.horizontalCollision && this.ticks > 3)) {
					this.phase = 2;
				}
			}
		}
	}

	/** Creeper-style: walk up to the target, swell, burst (never breaks blocks). */
	public static class SwellGoal extends Goal {
		private final SpecCreature mob;

		public SwellGoal(SpecCreature mob) {
			this.mob = mob;
			this.setFlags(EnumSet.of(Goal.Flag.MOVE, Goal.Flag.LOOK));
		}

		@Override
		public boolean canUse() {
			LivingEntity t = this.mob.getTarget();
			return t != null && t.isAlive();
		}

		@Override
		public void stop() {
			this.mob.setSwellTicks(0);
			this.mob.getNavigation().stop();
		}

		@Override
		public boolean requiresUpdateEveryTick() {
			return true;
		}

		@Override
		public void tick() {
			LivingEntity t = this.mob.getTarget();
			if (t == null) {
				return;
			}
			this.mob.getLookControl().setLookAt(t, 30.0F, 30.0F);
			double d = this.mob.distanceToSqr(t);
			int swell = this.mob.getSwellTicks();
			if (d < 9.0 && this.mob.getSensing().hasLineOfSight(t)) {
				if (swell == 0) {
					this.mob.playSound(SoundEvents.CREEPER_PRIMED, 1.0F, 1.3F);
				}
				this.mob.getNavigation().stop();
				this.mob.setSwellTicks(swell + 1);
				if (swell + 1 >= SpecCreature.FUSE) {
					this.mob.explode();
				}
			} else {
				if (swell > 0) {
					this.mob.setSwellTicks(Math.max(0, swell - 1));
				}
				if (this.mob.getNavigation().isDone() || this.mob.tickCount % 10 == 0) {
					this.mob.getNavigation().moveTo(t, 1.2);
				}
			}
		}
	}
}
