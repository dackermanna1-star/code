package dev.portalgun.creature;

import net.minecraft.util.Mth;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.control.MoveControl;

/** Movement controls for spec creatures. */
public final class CreatureControls {
	private CreatureControls() {
	}

	/** Slime/rabbit-like movement: turn toward the wanted position, then hop there (the push is in SpecCreature#jumpFromGround). */
	public static class HopMoveControl extends MoveControl {
		private int jumpDelay;

		public HopMoveControl(Mob mob) {
			super(mob);
		}

		@Override
		public void tick() {
			if (this.operation != MoveControl.Operation.MOVE_TO) {
				this.mob.setZza(0.0F);
				this.mob.setSpeed(0.0F);
				return;
			}
			this.operation = MoveControl.Operation.WAIT;
			double dx = this.wantedX - this.mob.getX();
			double dz = this.wantedZ - this.mob.getZ();
			double dy = this.wantedY - this.mob.getY();
			if (dx * dx + dy * dy + dz * dz < 2.5E-7) {
				this.mob.setZza(0.0F);
				return;
			}
			float yaw = (float) (Mth.atan2(dz, dx) * Mth.RAD_TO_DEG) - 90.0F;
			this.mob.setYRot(this.rotlerp(this.mob.getYRot(), yaw, 30.0F));
			this.mob.yBodyRot = this.mob.getYRot();
			float speed = (float) (this.speedModifier * this.mob.getAttributeValue(Attributes.MOVEMENT_SPEED));
			if (this.mob.onGround()) {
				if (this.jumpDelay-- <= 0) {
					boolean angry = this.mob.getTarget() != null;
					this.jumpDelay = angry ? 4 + this.mob.getRandom().nextInt(5) : 8 + this.mob.getRandom().nextInt(12);
					this.mob.setSpeed(speed);
					this.mob.getJumpControl().jump();
				} else {
					this.mob.setXxa(0.0F);
					this.mob.setZza(0.0F);
					this.mob.setSpeed(0.0F);
				}
			} else {
				this.mob.setSpeed(speed);
			}
		}
	}
}
