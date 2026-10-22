package dev.juukulius.client.anim;

import dev.juukulius.animation.JuliusAnim;
import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.registry.JuliusItems;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.HumanoidArm;
import org.jspecify.annotations.Nullable;

/**
 * Per-player animation brain. Combines, in order:
 * <ol>
 *     <li>a procedural locomotion layer (knight stance, walk, sprint, jump, fall, landing, charging),</li>
 *     <li>up to two keyframed action clips (crossfading old → new),</li>
 *     <li>an additive reaction layer (flinch when hit).</li>
 * </ol>
 * All weights are smoothed in real time so every transition blends instead of popping.
 */
public final class PlayerAnimator {
	public final int entityId;
	public final PoseSnapshot snapshot = new PoseSnapshot();
	public final OutfitPhysics physics = new OutfitPhysics();

	private @Nullable Playback current;
	private @Nullable Playback previous;

	private float lastFrame = Float.NaN;
	private float base;
	private float stance;
	private float sprint;
	private float rising;
	private float falling;
	private float charge;
	private float landImpulse;
	private float landTime = -10.0F;
	private boolean wasOnGround = true;
	private double lastVerticalSpeed;
	private final float[] sample = new float[3];

	/** Trail style currently requested by the playing clip, or null. */
	public AnimClip.@Nullable TrailStyle trailStyle;
	/** Charge progress 0..1 while Al Clarista is being charged. */
	public float chargeProgress;
	public int lastTouchedTick;

	public PlayerAnimator(int entityId) {
		this.entityId = entityId;
	}

	// ------------------------------------------------------------------------------------------------ actions

	public void play(JuliusAnim animation, float speed, float now) {
		AnimClip clip = AnimClips.INSTANCE.get(animation);
		if (clip == null) {
			return;
		}

		if (this.current != null) {
			this.current.fadeOut(now, clip.blendIn);
			this.previous = this.current;
		}

		this.current = new Playback(animation, clip, now, speed);
	}

	/** Cancels the playing clip (used when the server rejects a predicted action). */
	public void cancel(float now) {
		if (this.current != null) {
			this.current.fadeOut(now, 0.12F);
		}
	}

	public @Nullable Playback current() {
		return this.current;
	}

	/** Whether {@code animation} started within the last {@code window} seconds. */
	public boolean recentlyStarted(JuliusAnim animation, float now, float window) {
		return this.current != null && this.current.id == animation && now - this.current.start < window;
	}

	// ------------------------------------------------------------------------------------------------ tick

	public void tick(AbstractClientPlayer player) {
		this.physics.tick(player);
		boolean onGround = player.onGround();
		double verticalSpeed = player.getY() - player.yo;
		if (onGround && !this.wasOnGround && this.lastVerticalSpeed < -0.25) {
			this.landImpulse = (float) Mth.clamp(-this.lastVerticalSpeed / 0.9, 0.35, 1.0);
			this.landTime = ClientClock.seconds(0.0F);
		}

		this.wasOnGround = onGround;
		this.lastVerticalSpeed = verticalSpeed;
	}

	// ------------------------------------------------------------------------------------------------ frame

	/**
	 * Builds this frame's {@link #snapshot}. Safe to call more than once per frame (third-person extraction and the
	 * first-person hand pass); only the first call per frame does the work.
	 */
	public void update(AbstractClientPlayer player, float walkPos, float walkSpeed, JuliusAppearance appearance, float partialTick) {
		float now = ClientClock.seconds(partialTick);
		if (now == this.lastFrame) {
			return;
		}

		float dt = Float.isNaN(this.lastFrame) ? 0.05F : Mth.clamp(now - this.lastFrame, 0.0F, 0.1F);
		this.lastFrame = now;
		PoseSnapshot snap = this.snapshot;
		snap.clear();
		this.trailStyle = null;

		boolean special = player.isPassenger() || player.isFallFlying() || player.isSwimming() || player.isSleeping() || player.isSpectator()
			|| player.isAutoSpinAttack();
		boolean transformed = appearance.transformed();
		boolean sword = player.getMainHandItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		boolean charging = transformed && sword && player.isUsingItem() && player.getUseItem().is(JuliusItems.HOUSE_JUUKULIUS_SWORD);
		float walk = Mth.clamp(walkSpeed * 1.4F, 0.0F, 1.0F);
		double verticalSpeed = player.getY() - player.yo;
		boolean onGround = player.onGround();

		this.base = approach(this.base, transformed && !special ? 1.0F : 0.0F, 7.0F, dt);
		this.sprint = approach(this.sprint, transformed && !special && player.isSprinting() && walk > 0.4F ? 1.0F : 0.0F, 6.0F, dt);
		this.stance = approach(this.stance, transformed && !special && sword ? 1.0F : 0.0F, 6.0F, dt);
		this.rising = approach(this.rising, transformed && !special && !onGround && verticalSpeed > 0.04 ? 1.0F : 0.0F, 9.0F, dt);
		this.falling = approach(this.falling, transformed && !special && !onGround && verticalSpeed < -0.12 ? (float) Math.min(1.0, -verticalSpeed * 2.2) : 0.0F,
			6.0F, dt);
		this.charge = approach(this.charge, charging ? 1.0F : 0.0F, 10.0F, dt);
		this.chargeProgress = charging ? CombatRules.chargeProgress(player.getTicksUsingItem()) : 0.0F;

		if (this.base > 0.001F || this.charge > 0.001F) {
			this.locomotion(snap, walkPos, now, walk);
		}

		this.actions(snap, now);
		this.reaction(snap, player, partialTick);
		if (player.getMainArm() == HumanoidArm.LEFT) {
			snap.mirror();
		}

		snap.active = this.base > 0.001F || this.current != null || this.previous != null || player.hurtTime > 0;
	}

	private void locomotion(PoseSnapshot snap, float walkPos, float now, float walk) {
		PoseLayer layer = snap.layers[PoseSnapshot.LOCOMOTION];
		float breath = Mth.sin(now * 1.7F);
		float idle = 1.0F - walk;
		float stanceWeight = this.stance * (1.0F - this.sprint) * (1.0F - this.charge);

		// The Finest Knight's stance: sword angled forward and up, left hand resting behind the back.
		if (stanceWeight > 0.001F) {
			float swordSwing = Mth.cos(walkPos * 0.6662F + Mth.PI) * walk * 0.22F;
			layer.target(Bone.RIGHT_ARM, stanceWeight, -0.38F + swordSwing - breath * 0.02F, -0.1F, 0.08F);
			float leftBehind = stanceWeight * (1.0F - walk * 0.75F);
			layer.target(Bone.LEFT_ARM, leftBehind, 0.48F + breath * 0.02F, 0.18F, 0.3F);
			layer.add(Bone.BODY, breath * 0.018F * stanceWeight, -0.06F * stanceWeight * idle, 0.0F);
			layer.add(Bone.RIGHT_LEG, -0.06F * stanceWeight * idle, 0.06F * stanceWeight * idle, 0.03F * stanceWeight * idle);
			layer.add(Bone.LEFT_LEG, 0.08F * stanceWeight * idle, -0.12F * stanceWeight * idle, -0.03F * stanceWeight * idle);
			snap.itemRot[0] += -12.0F * stanceWeight;
			snap.fpMainRot[0] += breath * 0.6F * stanceWeight;
			snap.fpMainPos[1] += breath * 0.1F * stanceWeight;
		}

		// Sprint: forward lean, sword trailing low behind like a drawn blade.
		if (this.sprint > 0.001F) {
			float s = this.sprint * this.base;
			snap.rootRot[0] += 9.0F * s;
			layer.add(Bone.BODY, 0.2F * s, 0.0F, 0.0F);
			layer.target(Bone.RIGHT_ARM, s, 0.72F + Mth.cos(walkPos * 0.6662F) * 0.12F, 0.18F, 0.34F);
			layer.target(Bone.LEFT_ARM, s, Mth.cos(walkPos * 0.6662F) * 1.05F * walk, 0.0F, -0.12F);
			snap.itemRot[0] += 25.0F * s;
			snap.fpMainPos[1] -= 1.6F * s;
			snap.fpMainRot[0] += 14.0F * s;
		}

		// Airborne: knee tuck while rising, arms opening for balance while falling.
		if (this.rising > 0.001F) {
			float r = this.rising * this.base;
			layer.add(Bone.RIGHT_LEG, -0.72F * r, 0.0F, 0.06F * r);
			layer.add(Bone.LEFT_LEG, 0.3F * r, 0.0F, -0.06F * r);
			layer.add(Bone.RIGHT_ARM, -0.15F * r, 0.0F, 0.3F * r);
			layer.add(Bone.LEFT_ARM, -0.2F * r, 0.0F, -0.38F * r);
		}

		if (this.falling > 0.001F) {
			float f = this.falling * this.base;
			layer.add(Bone.RIGHT_LEG, -0.22F * f, 0.0F, 0.14F * f);
			layer.add(Bone.LEFT_LEG, 0.14F * f, 0.0F, -0.14F * f);
			layer.add(Bone.RIGHT_ARM, -0.25F * f, 0.0F, 0.5F * f);
			layer.add(Bone.LEFT_ARM, -0.25F * f, 0.0F, -0.55F * f);
			layer.add(Bone.BODY, -0.08F * f, 0.0F, 0.0F);
		}

		// Landing: a short knee-dip that recovers with an ease-out.
		float sinceLand = now - this.landTime;
		if (sinceLand >= 0.0F && sinceLand < 0.45F && this.landImpulse > 0.0F) {
			float envelope = sinceLand < 0.06F ? sinceLand / 0.06F : 1.0F - Easing.OUT_CUBIC.apply((sinceLand - 0.06F) / 0.39F);
			float land = envelope * this.landImpulse * this.base;
			snap.rootPos[1] -= 1.5F * land;
			snap.rootRot[0] += 5.0F * land;
			layer.add(Bone.BODY, 0.32F * land, 0.0F, 0.0F);
			layer.add(Bone.RIGHT_LEG, -0.38F * land, 0.0F, 0.04F * land);
			layer.add(Bone.LEFT_LEG, 0.22F * land, 0.0F, -0.04F * land);
			layer.add(Bone.RIGHT_ARM, 0.0F, 0.0F, 0.22F * land);
			layer.add(Bone.LEFT_ARM, 0.0F, 0.0F, -0.22F * land);
			snap.fpMainPos[1] -= 0.9F * land;
		}

		// Charging Al Clarista: blade raised before the body while the six lights gather; trembles near full power.
		if (this.charge > 0.001F) {
			float c = this.charge;
			float tremble = this.chargeProgress * 0.035F * Mth.sin(now * 47.0F);
			layer.target(Bone.RIGHT_ARM, c, -1.25F + tremble, 0.32F, 0.05F);
			layer.target(Bone.LEFT_ARM, c, -1.05F - tremble, -0.6F, -0.05F);
			layer.add(Bone.BODY, -0.04F * c, 0.12F * c, 0.0F);
			snap.rootPos[1] -= 0.6F * c;
			snap.itemRot[0] += -55.0F * c;
			snap.fpMainRot[0] += 18.0F * c + tremble * 40.0F;
			snap.fpMainRot[1] += 12.0F * c;
			snap.fpMainPos[0] -= 1.6F * c;
			snap.fpMainPos[1] += 1.2F * c;
		}
	}

	private void actions(PoseSnapshot snap, float now) {
		if (this.previous != null && this.previous.finished(now)) {
			this.previous = null;
		}

		if (this.current != null && this.current.finished(now)) {
			this.current = null;
		}

		if (this.previous != null) {
			this.sampleInto(this.previous, snap.layers[PoseSnapshot.ACTION_OLD], snap, now);
		}

		if (this.current != null) {
			this.sampleInto(this.current, snap.layers[PoseSnapshot.ACTION_NEW], snap, now);
		}
	}

	private void sampleInto(Playback playback, PoseLayer layer, PoseSnapshot snap, float now) {
		float weight = playback.weight(now);
		if (weight <= 0.0F) {
			return;
		}

		AnimClip clip = playback.clip;
		float time = playback.time(now);
		float[] s = this.sample;
		for (Bone bone : Bone.MODEL_BONES) {
			Track rotation = clip.rotation(bone);
			Track position = clip.position(bone);
			if (rotation == null && position == null) {
				continue;
			}

			boolean override = bone != Bone.HEAD && clip.overrides.contains(bone);
			if (override) {
				if (rotation != null) {
					rotation.sample(time, s);
					layer.target(bone, weight, s[0] * Mth.DEG_TO_RAD, s[1] * Mth.DEG_TO_RAD, s[2] * Mth.DEG_TO_RAD);
				} else {
					layer.active = true;
				}

				if (position != null) {
					position.sample(time, s);
					layer.targetPos(bone, s[0], s[1], s[2]);
				}
			} else {
				if (rotation != null) {
					rotation.sample(time, s);
					layer.add(bone, s[0] * Mth.DEG_TO_RAD * weight, s[1] * Mth.DEG_TO_RAD * weight, s[2] * Mth.DEG_TO_RAD * weight);
				}

				if (position != null) {
					position.sample(time, s);
					layer.addPos(bone, s[0] * weight, s[1] * weight, s[2] * weight);
				}
			}
		}

		accumulate(clip.rotation(Bone.ROOT), time, weight, snap.rootRot);
		accumulate(clip.position(Bone.ROOT), time, weight, snap.rootPos);
		accumulate(clip.rotation(Bone.ITEM), time, weight, snap.itemRot);
		accumulate(clip.position(Bone.ITEM), time, weight, snap.itemPos);
		accumulate(clip.rotation(Bone.FP_MAIN), time, weight, snap.fpMainRot);
		accumulate(clip.position(Bone.FP_MAIN), time, weight, snap.fpMainPos);
		accumulate(clip.rotation(Bone.FP_OFF), time, weight, snap.fpOffRot);
		accumulate(clip.position(Bone.FP_OFF), time, weight, snap.fpOffPos);
		if (clip.showOffhandFirstPerson) {
			snap.fpOffWeight = Math.max(snap.fpOffWeight, weight);
		}

		AnimClip.TrailWindow trail = clip.trailAt(time);
		if (trail != null && weight > 0.35F) {
			this.trailStyle = trail.style();
		}
	}

	private void accumulate(@Nullable Track track, float time, float weight, float[] target) {
		if (track == null) {
			return;
		}

		track.sample(time, this.sample);
		target[0] += this.sample[0] * weight;
		target[1] += this.sample[1] * weight;
		target[2] += this.sample[2] * weight;
	}

	private void reaction(PoseSnapshot snap, AbstractClientPlayer player, float partialTick) {
		if (player.hurtTime <= 0) {
			return;
		}

		float k = Mth.clamp((player.hurtTime - partialTick) / 10.0F, 0.0F, 1.0F);
		k = k * k * (3.0F - 2.0F * k);
		float scale = 0.45F + 0.55F * this.base;
		PoseLayer layer = snap.layers[PoseSnapshot.REACTION];
		layer.add(Bone.BODY, -0.16F * k * scale, 0.0F, 0.0F);
		layer.add(Bone.HEAD, -0.12F * k * scale, 0.0F, 0.0F);
		layer.add(Bone.RIGHT_ARM, 0.0F, 0.0F, 0.24F * k * scale);
		layer.add(Bone.LEFT_ARM, 0.0F, 0.0F, -0.24F * k * scale);
		snap.rootRot[0] -= 4.5F * k * scale;
		snap.fpMainPos[1] -= 0.6F * k;
	}

	public boolean hasAction() {
		return this.current != null;
	}

	private static float approach(float value, float target, float rate, float dt) {
		return value + (target - value) * (1.0F - (float) Math.exp(-rate * dt));
	}
}
