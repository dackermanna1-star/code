package dev.juukulius.client.anim;

import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Secondary motion for the hair strands and coat tails: damped springs driven by the body's local velocity and turning
 * speed, simulated per tick and interpolated per frame.
 */
public final class OutfitPhysics {
	/** Coat tails pitch (radians, positive = flaring backwards) and roll (sideways sway). */
	public final Spring coatPitch = new Spring(0.32F, 0.55F);
	public final Spring coatRoll = new Spring(0.28F, 0.5F);
	/** Hair strands: pitch and roll. */
	public final Spring hairPitch = new Spring(0.45F, 0.42F);
	public final Spring hairRoll = new Spring(0.45F, 0.42F);
	private float lastBodyYaw = Float.NaN;

	public void tick(Player player) {
		float bodyYaw = player.yBodyRot;
		float yawSpeed = Float.isNaN(this.lastBodyYaw) ? 0.0F : Mth.wrapDegrees(bodyYaw - this.lastBodyYaw);
		this.lastBodyYaw = bodyYaw;
		Vec3 velocity = new Vec3(player.getX() - player.xo, player.getY() - player.yo, player.getZ() - player.zo);
		float yawRad = bodyYaw * Mth.DEG_TO_RAD;
		double forward = -velocity.x * Math.sin(yawRad) + velocity.z * Math.cos(yawRad);
		double sideways = velocity.x * Math.cos(yawRad) + velocity.z * Math.sin(yawRad);

		float coatTarget = (float) Mth.clamp(forward * 2.6, -0.25, 1.1) + (float) Mth.clamp(-velocity.y * 1.4, -0.3, 0.9);
		this.coatPitch.tick(coatTarget + 0.06F);
		this.coatRoll.tick((float) Mth.clamp(sideways * 2.0 + yawSpeed * 0.02, -0.5, 0.5));
		this.hairPitch.tick((float) Mth.clamp(forward * 1.5 - velocity.y * 0.9, -0.4, 0.8));
		this.hairRoll.tick((float) Mth.clamp(sideways * 1.6 + yawSpeed * 0.025, -0.45, 0.45));
	}

	/** Critically-ish damped spring on one angle. */
	public static final class Spring {
		private final float stiffness;
		private final float damping;
		private float value;
		private float previous;
		private float velocity;

		Spring(float stiffness, float damping) {
			this.stiffness = stiffness;
			this.damping = damping;
		}

		void tick(float target) {
			this.previous = this.value;
			this.velocity += (target - this.value) * this.stiffness;
			this.velocity *= 1.0F - this.damping;
			this.value += this.velocity;
		}

		public float get(float partialTick) {
			return Mth.lerp(partialTick, this.previous, this.value);
		}
	}
}
