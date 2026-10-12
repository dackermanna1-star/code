package com.extremesports.client.anim;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.SportType;
import com.extremesports.trick.TrickCategory;
import com.extremesports.trick.TrickDef;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import org.jspecify.annotations.Nullable;

/**
 * Procedural animation: turns the smoothed ride state into a {@link RideFrame} — equipment transforms plus a
 * full-body rider pose. Everything is derived from physics state, so what you see always matches what happened
 * (e.g. a board that is still mid-flip on touchdown is drawn mid-flip, and that is exactly when you bail).
 */
public final class RideAnimator {
	private static final Map<SportEquipmentEntity, RideFrame> FRAMES = new WeakHashMap<>();
	private static final float PI = (float) Math.PI;

	private RideAnimator() {
	}

	/** Cached per entity and partial tick so the rider and equipment renderers use identical numbers. */
	public static RideFrame frame(SportEquipmentEntity entity, float partialTick) {
		RideFrame frame = FRAMES.computeIfAbsent(entity, e -> new RideFrame());
		long key = ((long) entity.tickCount << 20) ^ Float.floatToIntBits(partialTick);
		if (frame.cacheKey != key) {
			compute(entity, partialTick, frame);
			frame.cacheKey = key;
		}
		return frame;
	}

	static float ease(float t) {
		t = Mth.clamp(t, 0.0F, 1.0F);
		return 0.5F - 0.5F * Mth.cos(PI * t);
	}

	/** 0 at the ends, 1 in the middle section [a, b], with soft edges. */
	static float window(float t, float a, float b) {
		if (t <= 0.0F || t >= 1.0F) {
			return 0.0F;
		}
		float up = Mth.clamp(t / a, 0.0F, 1.0F);
		float down = Mth.clamp((1.0F - t) / (1.0F - b), 0.0F, 1.0F);
		return ease(Math.min(up, down));
	}

	static float lerp(float t, float a, float b) {
		return a + (b - a) * t;
	}

	// ------------------------------------------------------------------ shared inputs

	private static final class In {
		SportEquipmentEntity entity;
		RideAnimState state;
		EquipmentKind kind;
		float pt;
		float crouch;
		float lean;
		float balance;
		float air;
		float grab;
		float grind;
		float manual;
		float brake;
		float landing;
		float charge;
		float stroke;
		float speed;
		float steer;
		boolean pushing;
		boolean pedaling;
		boolean backward;
		@Nullable TrickDef trick;
		float trickQ;
		int multiple;
		@Nullable TrickDef grabDef;
		@Nullable TrickDef holdDef;
		float headYaw;
		float headPitch;
	}

	private static void compute(SportEquipmentEntity entity, float pt, RideFrame f) {
		RideAnimState s = RideAnimState.of(entity);
		In in = new In();
		in.entity = entity;
		in.state = s;
		in.kind = entity.kind();
		in.pt = pt;
		in.crouch = s.crouch.get(pt);
		in.lean = s.lean.get(pt);
		in.balance = s.balance.get(pt);
		in.air = s.airBlend.get(pt);
		in.grab = s.grabBlend.get(pt);
		in.grind = s.grindBlend.get(pt);
		in.manual = s.manualBlend.get(pt);
		in.brake = s.brakeBlend.get(pt);
		in.landing = s.landing.get(pt);
		in.charge = s.chargeBlend.get(pt);
		in.stroke = s.stroke.get(pt);
		in.speed = s.speed.get(pt);
		in.steer = s.steer.get(pt);
		in.pushing = (s.flags & SportEquipmentEntity.FLAG_PUSHING) != 0;
		in.pedaling = (s.flags & SportEquipmentEntity.FLAG_PEDALING) != 0;
		in.backward = (s.flags & SportEquipmentEntity.FLAG_BACKWARD) != 0;
		in.trick = s.trick;
		in.multiple = Math.max(1, s.trickMultiple);
		in.trickQ = s.trick == null ? 0.0F : Mth.clamp(s.trickProgress(pt) / in.multiple, 0.0F, 1.0F);
		in.grabDef = s.grab;
		in.holdDef = s.grindOrManual;

		float yaw = entity.getYRot(pt);
		Player rider = entity.getControllingPassenger() instanceof Player player ? player : null;
		if (rider != null) {
			float headWorld = Mth.rotLerp(pt, rider.yHeadRotO, rider.yHeadRot);
			in.headPitch = rider.getXRot(pt);
			in.headYaw = headWorld;
		} else {
			in.headYaw = yaw;
			in.headPitch = 0.0F;
		}

		f.yaw = yaw;
		f.pitch = s.pitch.get(pt);
		f.roll = s.roll.get(pt);
		f.flipPitch = 0.0F;
		f.flipRoll = 0.0F;
		f.flipYaw = 0.0F;
		f.pivotY = 0.8F;
		f.lift = 0.0F;
		f.eqRoll = 0.0F;
		f.eqYaw = 0.0F;
		f.eqPitch = 0.0F;
		f.tiltPitch = 0.0F;
		f.tiltPivot = 0.0F;
		f.tiltRoll = 0.0F;
		f.partSpin = 0.0F;
		f.whip = 0.0F;
		f.wheel = Mth.lerp(pt, s.wheelAnglePrev, s.wheelAngle);
		f.crank = Mth.lerp(pt, s.pedalAnglePrev, s.pedalAngle);
		f.dropY = 0.0F;
		f.blend = s.mountBlend.get(pt);
		f.standHeight = in.kind.standHeight();
		f.skatesOnFeet = in.kind == EquipmentKind.SKATES;
		f.skeleton.reset();

		// Grind and manual orientation offsets
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.GRIND) {
			f.yaw += in.holdDef.eqYaw() * in.grind;
			f.tiltPitch += in.holdDef.eqPitch() * in.grind;
			f.tiltRoll += in.holdDef.eqRoll() * in.grind;
		}
		f.yaw += s.slideAngle.get(pt);

		switch (in.kind.sport()) {
			case SKATEBOARD -> skateboard(in, f);
			case BMX -> bmx(in, f);
			case SCOOTER -> scooter(in, f);
			case SKATES -> skates(in, f);
		}

		// Head follows the camera, relative to the body
		float headRel = Mth.wrapDegrees(in.headYaw - f.riderYaw - Mth.RAD_TO_DEG * f.skeleton.twist());
		float headYaw = Mth.clamp(headRel, -80.0F, 80.0F) * Mth.DEG_TO_RAD;
		float headPitch = Mth.clamp(in.headPitch, -60.0F, 60.0F) * Mth.DEG_TO_RAD - f.skeleton.lean() * 0.85F;
		f.skeleton.look(-headYaw + f.skeleton.twist(), headPitch);
	}

	private static boolean isFlip(@Nullable TrickDef def) {
		return def != null && def.isAirTrick();
	}

	/** Common whole-body flip handling (backflips etc.). Returns the tuck amount it wants. */
	private static float bodyFlip(In in, RideFrame f) {
		TrickDef t = in.trick;
		if (t == null || !t.isBodyFlip()) {
			return 0.0F;
		}
		float e = ease(in.trickQ);
		f.flipPitch = -t.riderPitch() * in.multiple * e;
		f.flipRoll = t.riderRoll() * in.multiple * e;
		f.flipYaw = t.eqYaw() * e;
		return window(in.trickQ, 0.2F, 0.75F);
	}

	// ------------------------------------------------------------------ skateboard

	private static void skateboard(In in, RideFrame f) {
		Skeleton sk = f.skeleton;
		boolean goofy = in.entity.isGoofy();
		float nose = goofy ? -1.0F : 1.0F;
		int frontLeg = goofy ? Skeleton.RIGHT_LEG : Skeleton.LEFT_LEG;
		int backLeg = goofy ? Skeleton.LEFT_LEG : Skeleton.RIGHT_LEG;
		int frontArm = goofy ? Skeleton.RIGHT_ARM : Skeleton.LEFT_ARM;
		int backArm = goofy ? Skeleton.LEFT_ARM : Skeleton.RIGHT_ARM;
		// Riders stand sideways: chest toward the toe side
		f.riderYaw = f.yaw + (goofy ? -90.0F : 90.0F);

		float c = in.crouch;
		float toe = in.lean * nose;
		float trickWindow = isFlip(in.trick) ? window(in.trickQ, 0.12F, 0.8F) : 0.0F;
		float tuck = in.air * Mth.clamp(0.3F + 0.7F * Math.max(trickWindow, in.grab), 0.0F, 1.0F);
		float liftPx = tuck * 6.5F + in.grab * 3.0F + trickWindow * 2.0F;
		f.lift = liftPx / 16.0F;
		f.roll += 11.0F * in.lean * (1.0F - in.air);

		// Flip tricks rotate only the board
		if (isFlip(in.trick)) {
			TrickDef t = in.trick;
			float e = ease(in.trickQ);
			f.eqRoll = t.eqRoll() * in.multiple * e * nose;
			f.eqYaw = t.eqYaw() * in.multiple * e;
			f.eqPitch = t.eqPitch() * in.multiple * e;
		}

		// Manuals tip the board onto the tail (or nose) wheels
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.MANUAL) {
			float tilt = (in.holdDef.eqPitch() + in.balance * 6.0F) * in.manual;
			f.tiltPitch += tilt;
			f.tiltPivot = in.holdDef.eqPitch() >= 0 ? -5.5F / 16.0F : 5.5F / 16.0F;
		}

		float drop = 1.2F + 4.6F * c + tuck * 1.5F;
		float hipZ = 0.7F * c - 1.6F * toe;
		float hipX = in.manual * (in.holdDef != null && in.holdDef.eqPitch() < 0 ? 1.5F : -1.5F) * nose + in.balance * 0.6F;
		float lean = 0.12F + 0.32F * c + 0.25F * toe + 0.25F * tuck;
		float twist = 0.0F;
		float side = -in.balance * 0.22F * Math.max(in.grind, in.manual);

		// Board edge points for feet and grabs (model space, board centre under the hips)
		float deckY = 24.0F - liftPx;
		float frontX = nose * 5.0F;
		float backX = -nose * 5.0F;
		float frontFootY = deckY;
		float backFootY = deckY;
		float frontFootZ = -0.3F;
		float backFootZ = 0.3F;
		float frontFootYaw = -nose * 0.35F;
		float backFootYaw = nose * 0.1F;

		// Manual: front foot rises with the nose, weight on the back foot
		if (in.manual > 0.0F) {
			float tiltRad = f.tiltPitch * Mth.DEG_TO_RAD;
			frontFootY -= Mth.sin(Math.abs(tiltRad)) * 10.0F * (f.tiltPivot < 0 ? 1.0F : 0.0F);
			backFootY -= Mth.sin(Math.abs(tiltRad)) * 10.0F * (f.tiltPivot > 0 ? 1.0F : 0.0F);
		}

		// Pushing with the back foot
		if (in.pushing && in.air < 0.5F && in.grind < 0.5F) {
			float p = in.stroke;
			float groundY = 24.0F + f.standHeight * 16.0F;
			float w = Mth.sin(PI * Mth.clamp(p, 0.0F, 1.0F));
			float fx;
			float fy;
			float fz;
			if (p < 0.22F) {
				float t = ease(p / 0.22F);
				fx = lerp(t, backX, nose * 1.5F);
				fy = lerp(t, backFootY, groundY - 2.5F);
				fz = lerp(t, backFootZ, -3.2F);
			} else if (p < 0.68F) {
				float t = (p - 0.22F) / 0.46F;
				fx = lerp(t, nose * 1.5F, -nose * 7.5F);
				fy = groundY - (t < 0.1F ? (1.0F - t / 0.1F) * 2.5F : 0.0F);
				fz = -3.2F + t * 0.8F;
			} else {
				float t = ease((p - 0.68F) / 0.32F);
				fx = lerp(t, -nose * 7.5F, backX);
				fy = lerp(t, groundY - 1.5F, backFootY) - Mth.sin(PI * t) * 2.0F;
				fz = lerp(t, -2.4F, backFootZ);
			}
			sk.torso(hipX + nose * 1.2F * w, 12.0F + drop + 1.2F * w, hipZ - 0.8F * w, lean + 0.25F * w, nose * 0.45F * w, 0.0F);
			sk.step(frontLeg, frontX * 0.9F, frontFootY, frontFootZ, -nose * (0.35F + 0.9F * w));
			sk.step(backLeg, fx, fy, fz, -nose * 0.8F * w);
			swingArms(sk, frontArm, backArm, nose, w, p);
			return;
		}

		// Flip-trick feet: the front foot flicks, then both feet hover and catch
		float hover = 0.0F;
		float flick = 0.0F;
		if (isFlip(in.trick)) {
			hover = window(in.trickQ, 0.15F, 0.82F) * 3.0F;
			flick = window(in.trickQ * 3.0F, 0.3F, 0.5F);
		}
		float flickSide = in.trick != null && in.trick.eqRoll() < 0 ? 1.0F : -1.0F;
		frontFootY -= hover;
		backFootY -= hover;
		frontX += nose * flick * 2.5F;
		frontFootZ += flickSide * flick * 3.0F;

		// Foot brake drags the back foot
		if (in.brake > 0.01F && in.air < 0.5F) {
			float groundY = 24.0F + f.standHeight * 16.0F;
			backX = lerp(in.brake, backX, -nose * 7.5F);
			backFootY = lerp(in.brake, backFootY, groundY);
			backFootZ = lerp(in.brake, backFootZ, -1.5F);
			lean += 0.15F * in.brake;
		}

		// Benihana kicks the back foot off the board
		if (in.grabDef != null && "benihana".equals(in.grabDef.pose())) {
			backX = lerp(in.grab, backX, -nose * 6.0F);
			backFootY = lerp(in.grab, backFootY, 24.0F + 1.0F);
			backFootZ = lerp(in.grab, backFootZ, 4.0F);
		}
		if (in.grabDef != null && "method".equals(in.grabDef.pose())) {
			f.eqRoll += -nose * 35.0F * in.grab;
			frontFootZ += 3.0F * in.grab;
			backFootZ += 3.0F * in.grab;
			lean -= 0.3F * in.grab;
		}

		sk.torso(hipX, 12.0F + drop, hipZ, lean, twist, side);
		sk.step(frontLeg, frontX, frontFootY, frontFootZ, frontFootYaw);
		sk.step(backLeg, backX, backFootY, backFootZ, backFootYaw);

		// Arms: relaxed balance pose, raised and swaying on grinds/manuals, grabs reach for the board
		float balanceMode = Math.max(in.grind, Math.max(in.manual, in.air * 0.6F));
		float spread = 9.0F + 3.0F * balanceMode;
		float armY = 15.0F - 5.0F * balanceMode + 2.0F * c;
		float sway = in.balance * 4.0F;
		sk.reach(frontArm, nose * spread + nose * 0.5F, armY - sway * nose, -1.5F - 2.5F * toe);
		sk.reach(backArm, -nose * spread, armY + sway * nose, -1.0F - 2.5F * toe);
		if (in.grabDef != null && in.grab > 0.01F) {
			grab(sk, in, nose, deckY, frontArm, backArm);
		}
	}

	private static void swingArms(Skeleton sk, int frontArm, int backArm, float nose, float w, float p) {
		float swing = Mth.sin(PI * 2.0F * p) * 4.0F;
		sk.reach(frontArm, nose * 7.0F, 15.0F, -3.0F - swing);
		sk.reach(backArm, -nose * 7.0F, 14.0F + w * 2.0F, -1.0F + swing);
	}

	private static void grab(Skeleton sk, In in, float nose, float deckY, int frontArm, int backArm) {
		String pose = in.grabDef.pose();
		float y = deckY - 1.0F;
		float toeZ = -2.8F;
		float heelZ = 2.8F;
		int arm;
		float tx;
		float tz;
		switch (pose) {
			case "indy" -> {
				arm = backArm;
				tx = -nose * 1.0F;
				tz = toeZ;
			}
			case "melon", "method" -> {
				arm = frontArm;
				tx = nose * 1.5F;
				tz = heelZ;
			}
			case "mute" -> {
				arm = frontArm;
				tx = nose * 1.5F;
				tz = toeZ;
			}
			case "nosegrab" -> {
				arm = frontArm;
				tx = nose * 7.0F;
				tz = 0.0F;
			}
			case "tailgrab" -> {
				arm = backArm;
				tx = -nose * 7.0F;
				tz = 0.0F;
			}
			case "crail" -> {
				arm = backArm;
				tx = nose * 5.5F;
				tz = toeZ;
			}
			case "stalefish" -> {
				arm = backArm;
				tx = -nose * 2.0F;
				tz = heelZ;
			}
			default -> {
				arm = frontArm;
				tx = nose * 2.0F;
				tz = toeZ;
			}
		}
		float g = in.grab;
		float baseX = sk.x[arm];
		float baseY = sk.y[arm] + 9.0F;
		float baseZ = sk.z[arm];
		sk.reach(arm, lerp(g, baseX, tx), lerp(g, baseY, y), lerp(g, baseZ, tz));
		int other = arm == frontArm ? backArm : frontArm;
		float otherSide = other == frontArm ? nose : -nose;
		sk.reach(other, otherSide * 11.0F, lerp(g, 12.0F, 6.0F), -3.0F);
	}

	// ------------------------------------------------------------------ BMX

	private static void bmx(In in, RideFrame f) {
		Skeleton sk = f.skeleton;
		f.riderYaw = f.yaw;
		f.roll += 18.0F * in.lean * (1.0F - in.air);
		float c = in.crouch;
		float tuck = Math.max(bodyFlip(in, f), in.air * 0.4F);
		f.pivotY = 0.75F;

		TrickDef t = in.trick;
		float e = t == null ? 0.0F : ease(in.trickQ);
		float feetOff = 0.0F;
		float handsOff = 0.0F;
		if (t != null && t.category() == TrickCategory.WHIP) {
			f.whip = t.eqYaw() * in.multiple * e;
			f.partSpin = t.partSpin() * in.multiple * e;
			if (t.eqYaw() != 0.0F) {
				feetOff = window(in.trickQ, 0.12F, 0.85F);
			}
			if (t.partSpin() != 0.0F) {
				handsOff = window(in.trickQ, 0.15F, 0.8F);
			}
		}
		// Steering turns the bars
		f.partSpin += Mth.clamp(in.steer, -1.0F, 1.0F) * 22.0F * (1.0F - in.air);

		// Bunny hop: front comes up first, bike rises toward the rider in the air
		float hop = in.air * Mth.clamp(1.0F - in.state.airTicks / 8.0F, 0.0F, 1.0F);
		f.tiltPitch += 14.0F * hop;
		f.tiltPivot = -6.5F / 16.0F;
		f.lift = tuck * 3.0F / 16.0F;

		// Manual / wheelie: front wheel up, rider leans back
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.MANUAL) {
			f.tiltPitch += (in.holdDef.eqPitch() + in.balance * 7.0F) * in.manual;
			f.tiltPivot = in.holdDef.eqPitch() >= 0 ? -6.5F / 16.0F : 8.5F / 16.0F;
		}
		if (in.grind > 0.0F) {
			f.dropY = -0.22F * in.grind;
		}

		// Grab-style variations
		String pose = in.grabDef != null ? in.grabDef.pose() : "";
		float g = in.grab;
		if ("table_top".equals(pose)) {
			f.roll += 70.0F * g;
		} else if ("x_up".equals(pose)) {
			f.partSpin += 180.0F * g;
		} else if ("turndown".equals(pose)) {
			f.partSpin += 80.0F * g;
			f.roll -= 35.0F * g;
		}

		// Crank: level pedals while coasting
		float crank = f.crank;
		if (!in.pedaling) {
			float level = Math.round((crank - PI / 2.0F) / PI) * PI + PI / 2.0F;
			crank = level;
			f.crank = crank;
		}
		float liftPx = f.lift * 16.0F;
		float pedalR = 2.7F;
		float rightPedalY = 24.0F - liftPx - pedalR * Mth.cos(crank);
		float rightPedalZ = -pedalR * Mth.sin(crank);
		float leftPedalY = 24.0F - liftPx + pedalR * Mth.cos(crank);
		float leftPedalZ = pedalR * Mth.sin(crank);

		float hipY = 14.0F + 3.0F * c + 2.0F * tuck;
		float hipZ = 2.0F + 1.0F * c - 2.0F * in.manual;
		float lean = 0.62F + 0.18F * c - 0.35F * in.manual;
		float side = -in.lean * 0.15F;
		float pedalBob = in.pedaling ? Mth.sin(crank * 2.0F) * 0.6F : 0.0F;

		float rFootX = -2.5F;
		float lFootX = 2.5F;
		float rFootY = rightPedalY - 0.5F;
		float lFootY = leftPedalY - 0.5F;
		float rFootZ = rightPedalZ;
		float lFootZ = leftPedalZ;
		// Feet leave the pedals for tailwhips and leg variations
		if (feetOff > 0.0F) {
			rFootX = lerp(feetOff, rFootX, -6.0F);
			lFootX = lerp(feetOff, lFootX, 6.0F);
			rFootY = lerp(feetOff, rFootY, 19.0F);
			lFootY = lerp(feetOff, lFootY, 19.0F);
		}
		switch (pose) {
			case "superman" -> {
				hipY = lerp(g, hipY, 11.0F);
				hipZ = lerp(g, hipZ, 5.0F);
				lean = lerp(g, lean, 1.35F);
				rFootX = lerp(g, rFootX, -2.0F);
				lFootX = lerp(g, lFootX, 2.0F);
				rFootY = lerp(g, rFootY, 13.0F);
				lFootY = lerp(g, lFootY, 13.0F);
				rFootZ = lerp(g, rFootZ, 13.0F);
				lFootZ = lerp(g, lFootZ, 13.0F);
			}
			case "can_can" -> {
				lFootX = lerp(g, lFootX, -6.0F);
				lFootY = lerp(g, lFootY, 19.0F);
				lFootZ = lerp(g, lFootZ, -3.0F);
			}
			case "no_footer" -> {
				rFootX = lerp(g, rFootX, -9.0F);
				lFootX = lerp(g, lFootX, 9.0F);
				rFootY = lerp(g, rFootY, 20.0F);
				lFootY = lerp(g, lFootY, 20.0F);
			}
			case "tuck_no_hander", "table_top" -> {
				hipY = lerp(g, hipY, 16.0F);
				rFootY = lerp(g, rFootY, 18.0F);
				lFootY = lerp(g, lFootY, 18.0F);
				rFootZ = lerp(g, rFootZ, -3.0F);
				lFootZ = lerp(g, lFootZ, -3.0F);
			}
			default -> {
			}
		}

		sk.torso(0.0F, hipY + pedalBob, hipZ, lean, 0.0F, side);
		sk.step(Skeleton.RIGHT_LEG, rFootX, rFootY, rFootZ, 0.0F);
		sk.step(Skeleton.LEFT_LEG, lFootX, lFootY, lFootZ, 0.0F);

		// Hands on the grips (grips follow bar rotation)
		float barAngle = f.partSpin * Mth.DEG_TO_RAD;
		float gripHalf = 4.6F;
		float gripY = 24.0F - liftPx - 9.5F;
		float gripZ = -6.4F;
		float rGripX = -gripHalf * Mth.cos(barAngle);
		float rGripZ = gripZ + gripHalf * Mth.sin(barAngle);
		float lGripX = gripHalf * Mth.cos(barAngle);
		float lGripZ = gripZ - gripHalf * Mth.sin(barAngle);
		boolean noHands = switch (pose) {
			case "no_hander", "tuck_no_hander" -> true;
			default -> false;
		};
		float release = Math.max(handsOff, noHands ? g : 0.0F);
		float rx = lerp(release, rGripX, -10.0F);
		float ry = lerp(release, gripY, 5.0F);
		float rz = lerp(release, rGripZ, -3.0F);
		float lx = lerp(release, lGripX, 10.0F);
		float ly = lerp(release, gripY, 5.0F);
		float lz = lerp(release, lGripZ, -3.0F);
		if ("seat_grab".equals(pose)) {
			rx = lerp(g, rx, 0.0F);
			ry = lerp(g, ry, 24.0F - 10.5F);
			rz = lerp(g, rz, 2.5F);
		}
		sk.reach(Skeleton.RIGHT_ARM, rx, ry, rz);
		sk.reach(Skeleton.LEFT_ARM, lx, ly, lz);
	}

	// ------------------------------------------------------------------ scooter

	private static void scooter(In in, RideFrame f) {
		Skeleton sk = f.skeleton;
		f.riderYaw = f.yaw;
		f.roll += 14.0F * in.lean * (1.0F - in.air);
		float c = in.crouch;
		float tuck = Math.max(bodyFlip(in, f), in.air * 0.4F);
		f.pivotY = 0.85F;
		TrickDef t = in.trick;
		float e = t == null ? 0.0F : ease(in.trickQ);
		float feetOff = 0.0F;
		float handsOff = 0.0F;
		if (t != null && t.category() == TrickCategory.WHIP) {
			if ("briflip".equals(t.pose())) {
				f.eqRoll = 360.0F * in.multiple * e;
			} else {
				f.whip = t.eqYaw() * in.multiple * e;
			}
			f.partSpin = t.partSpin() * in.multiple * e;
			feetOff = t.eqYaw() != 0.0F || "briflip".equals(t.pose()) ? window(in.trickQ, 0.12F, 0.85F) : 0.0F;
			handsOff = t.partSpin() != 0.0F ? window(in.trickQ, 0.15F, 0.8F) : 0.0F;
		}
		f.partSpin += Mth.clamp(in.steer, -1.0F, 1.0F) * 18.0F * (1.0F - in.air);
		f.lift = tuck * 4.0F / 16.0F;
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.MANUAL) {
			f.tiltPitch += (in.holdDef.eqPitch() + in.balance * 6.0F) * in.manual;
			f.tiltPivot = in.holdDef.eqPitch() >= 0 ? -6.5F / 16.0F : 7.5F / 16.0F;
		}
		if (in.grind > 0.0F) {
			f.dropY = -0.08F * in.grind;
		}
		String pose = in.grabDef != null ? in.grabDef.pose() : "";
		float g = in.grab;

		float liftPx = f.lift * 16.0F;
		float deckY = 24.0F - liftPx;
		float hipY = 13.5F + 3.0F * c + 2.0F * tuck;
		float hipZ = 0.8F + 1.0F * c;
		float lean = 0.28F + 0.25F * c;
		float lFootX = 1.1F;
		float lFootY = deckY;
		float lFootZ = -2.2F;
		float rFootX = -1.1F;
		float rFootY = deckY;
		float rFootZ = 3.2F;
		float rFootYaw = -0.5F;

		if (in.pushing && in.air < 0.5F) {
			float p = in.stroke;
			float groundY = 24.0F + f.standHeight * 16.0F;
			float w = Mth.sin(PI * Mth.clamp(p, 0.0F, 1.0F));
			if (p < 0.25F) {
				float k = ease(p / 0.25F);
				rFootX = lerp(k, rFootX, -3.2F);
				rFootY = lerp(k, rFootY, groundY - 2.0F);
				rFootZ = lerp(k, rFootZ, -2.5F);
			} else if (p < 0.7F) {
				float k = (p - 0.25F) / 0.45F;
				rFootX = -3.2F;
				rFootY = groundY;
				rFootZ = lerp(k, -2.5F, 8.5F);
			} else {
				float k = ease((p - 0.7F) / 0.3F);
				rFootX = lerp(k, -3.2F, -1.1F);
				rFootY = lerp(k, groundY, deckY) - Mth.sin(PI * k) * 2.0F;
				rFootZ = lerp(k, 8.5F, 3.2F);
			}
			hipY += 1.5F * w;
			lean += 0.12F * w;
			rFootYaw = 0.0F;
		}
		if (in.brake > 0.01F) {
			rFootY -= 0.8F * in.brake;
			rFootZ = lerp(in.brake, rFootZ, 5.5F);
			lean -= 0.1F * in.brake;
		}
		if (feetOff > 0.0F) {
			lFootX = lerp(feetOff, lFootX, 5.0F);
			rFootX = lerp(feetOff, rFootX, -5.0F);
			lFootY = lerp(feetOff, lFootY, deckY - 6.0F);
			rFootY = lerp(feetOff, rFootY, deckY - 6.0F);
		}
		switch (pose) {
			case "superman" -> {
				hipY = lerp(g, hipY, 11.0F);
				hipZ = lerp(g, hipZ, 5.0F);
				lean = lerp(g, lean, 1.3F);
				rFootY = lerp(g, rFootY, 12.0F);
				lFootY = lerp(g, lFootY, 12.0F);
				rFootZ = lerp(g, rFootZ, 13.0F);
				lFootZ = lerp(g, lFootZ, 13.0F);
			}
			case "can_can" -> {
				lFootX = lerp(g, lFootX, -6.0F);
				lFootY = lerp(g, lFootY, 19.0F);
			}
			case "no_footer" -> {
				rFootX = lerp(g, rFootX, -9.0F);
				lFootX = lerp(g, lFootX, 9.0F);
				rFootY = lerp(g, rFootY, 20.0F);
				lFootY = lerp(g, lFootY, 20.0F);
			}
			case "tuck_no_hander" -> {
				hipY = lerp(g, hipY, 16.0F);
				rFootY = lerp(g, rFootY, 18.0F);
				lFootY = lerp(g, lFootY, 18.0F);
			}
			default -> {
			}
		}
		sk.torso(0.0F, hipY, hipZ, lean, 0.0F, -in.lean * 0.12F);
		sk.step(Skeleton.LEFT_LEG, lFootX, lFootY, lFootZ, 0.15F);
		sk.step(Skeleton.RIGHT_LEG, rFootX, rFootY, rFootZ, rFootYaw);

		float barAngle = f.partSpin * Mth.DEG_TO_RAD;
		float gripHalf = 4.6F;
		float gripY = deckY - 12.6F;
		float stemZ = -7.4F;
		float rGripX = -gripHalf * Mth.cos(barAngle);
		float rGripZ = stemZ + gripHalf * Mth.sin(barAngle);
		float lGripX = gripHalf * Mth.cos(barAngle);
		float lGripZ = stemZ - gripHalf * Mth.sin(barAngle);
		boolean noHands = "no_hander".equals(pose) || "tuck_no_hander".equals(pose);
		float release = Math.max(handsOff, noHands ? g : 0.0F);
		sk.reach(Skeleton.RIGHT_ARM, lerp(release, rGripX, -10.0F), lerp(release, gripY, 5.0F), lerp(release, rGripZ, -3.0F));
		sk.reach(Skeleton.LEFT_ARM, lerp(release, lGripX, 10.0F), lerp(release, gripY, 5.0F), lerp(release, lGripZ, -3.0F));
	}

	// ------------------------------------------------------------------ inline skates

	private static void skates(In in, RideFrame f) {
		Skeleton sk = f.skeleton;
		f.riderYaw = f.yaw;
		f.roll += 16.0F * in.lean * (1.0F - in.air);
		float c = in.crouch;
		float tuck = Math.max(bodyFlip(in, f), in.air * (0.35F + 0.65F * in.grab));
		f.pivotY = 0.9F;
		TrickDef t = in.trick;
		if (t != null && t.category() == TrickCategory.WHIP) {
			float e = ease(in.trickQ);
			switch (t.pose()) {
				case "flatspin" -> f.flipYaw = 360.0F * in.multiple * e;
				case "bio" -> {
					f.flipYaw = 360.0F * in.multiple * e;
					f.flipPitch = Mth.sin(PI * in.trickQ) * 60.0F;
				}
				case "cork" -> {
					f.flipYaw = 360.0F * in.multiple * e;
					f.flipRoll = Mth.sin(PI * in.trickQ) * 70.0F;
				}
				default -> {
				}
			}
			tuck = Math.max(tuck, window(in.trickQ, 0.2F, 0.7F));
		}
		// Grinds set the body yaw relative to the rail (H-block grinds face across it)
		f.riderYaw = f.yaw;
		if (in.grind > 0.0F) {
			f.dropY = -0.12F * in.grind;
		}

		float liftPx = tuck * 5.0F;
		float hipY = 13.0F + 3.5F * c + 2.5F * tuck;
		float hipZ = 0.8F * c + 0.4F;
		float lean = 0.32F + 0.32F * c;
		float hipX = 0.0F;
		float lFootX = 2.4F;
		float rFootX = -2.4F;
		float lFootY = 24.0F - liftPx;
		float rFootY = 24.0F - liftPx;
		float lFootZ = 0.0F;
		float rFootZ = 0.0F;
		float lYaw = 0.12F;
		float rYaw = -0.12F;
		float armSwing = 0.0F;

		if (in.pushing && in.air < 0.5F && in.grind < 0.5F) {
			float p = in.stroke;
			float push = Mth.sin(PI * Mth.clamp(p, 0.0F, 1.0F));
			float raise = p > 0.7F ? Mth.sin(PI * (p - 0.7F) / 0.3F) * 2.5F : 0.0F;
			float dirZ = in.backward ? -1.0F : 1.0F;
			if (in.state.strideSide == 0) {
				lFootX += 4.5F * push;
				lFootZ += dirZ * 3.5F * push;
				lFootY -= raise;
				lYaw += 0.55F * push;
				hipX -= 1.0F * push;
				armSwing = push;
			} else {
				rFootX -= 4.5F * push;
				rFootZ += dirZ * 3.5F * push;
				rFootY -= raise;
				rYaw -= 0.55F * push;
				hipX += 1.0F * push;
				armSwing = -push;
			}
			lean += 0.1F * push;
		}
		// T-stop: back skate drags across behind
		if (in.brake > 0.01F && in.air < 0.5F) {
			rFootX = lerp(in.brake, rFootX, -0.5F);
			rFootZ = lerp(in.brake, rFootZ, 5.0F);
			rYaw = lerp(in.brake, rYaw, -1.45F);
			lFootZ = lerp(in.brake, lFootZ, -1.0F);
		}
		// Grinds
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.GRIND) {
			float gr = in.grind;
			switch (in.holdDef.pose()) {
				case "h_block" -> {
					lFootX = lerp(gr, lFootX, 4.5F);
					rFootX = lerp(gr, rFootX, -4.5F);
				}
				case "soul" -> {
					lFootZ = lerp(gr, lFootZ, -3.5F);
					lYaw = lerp(gr, lYaw, 1.5F);
					rFootZ = lerp(gr, rFootZ, 3.5F);
					rFootX = lerp(gr, rFootX, -0.5F);
				}
				case "makio" -> {
					lFootZ = lerp(gr, lFootZ, -1.0F);
					rFootY = lerp(gr, rFootY, 18.5F);
					rFootZ = lerp(gr, rFootZ, -5.0F);
				}
				case "royale" -> {
					lYaw = lerp(gr, lYaw, 1.4F);
					rFootX = lerp(gr, rFootX, 3.0F);
					rFootZ = lerp(gr, rFootZ, 4.0F);
					rFootY = lerp(gr, rFootY, 22.0F);
				}
				default -> {
				}
			}
		}
		// Heel/toe rolls (manuals)
		if (in.holdDef != null && in.holdDef.category() == TrickCategory.MANUAL) {
			float m = in.manual;
			lFootZ = lerp(m, lFootZ, -4.5F);
			rFootZ = lerp(m, rFootZ, 3.5F);
			lFootY -= 1.5F * m;
			lean -= 0.1F * m;
		}
		// Grabs
		String pose = in.grabDef != null ? in.grabDef.pose() : "";
		float g = in.grab;
		switch (pose) {
			case "liu_kang" -> {
				lFootZ = lerp(g, lFootZ, -8.0F);
				lFootY = lerp(g, lFootY, 18.0F);
			}
			case "rocket" -> {
				lFootZ = lerp(g, lFootZ, -9.0F);
				rFootZ = lerp(g, rFootZ, -9.0F);
				lFootY = lerp(g, lFootY, 17.0F);
				rFootY = lerp(g, rFootY, 17.0F);
				lean = lerp(g, lean, 0.9F);
			}
			case "christ_air" -> {
				lFootX = lerp(g, lFootX, 1.0F);
				rFootX = lerp(g, rFootX, -1.0F);
				lean = lerp(g, lean, -0.1F);
			}
			default -> {
			}
		}

		sk.torso(hipX, hipY, hipZ, lean, 0.0F, -in.lean * 0.15F);
		sk.step(Skeleton.LEFT_LEG, lFootX, lFootY, lFootZ, lYaw);
		sk.step(Skeleton.RIGHT_LEG, rFootX, rFootY, rFootZ, rYaw);

		float armSpread = 8.0F + 3.0F * Math.max(in.grind, in.air);
		float armY = 15.0F - 5.0F * Math.max(in.grind, in.air * 0.7F);
		sk.reach(Skeleton.LEFT_ARM, armSpread, armY + in.balance * 3.0F, -2.0F - 4.0F * armSwing);
		sk.reach(Skeleton.RIGHT_ARM, -armSpread, armY - in.balance * 3.0F, -2.0F + 4.0F * armSwing);
		if (g > 0.01F) {
			switch (pose) {
				case "skate_mute" -> sk.reach(Skeleton.RIGHT_ARM, lFootX, lerp(g, 14.0F, lFootY - 2.0F), lFootZ - 1.0F);
				case "japan" -> sk.reach(Skeleton.RIGHT_ARM, lerp(g, -6.0F, lFootX), lerp(g, 14.0F, lFootY - 2.0F), lFootZ + 2.0F);
				case "stale" -> sk.reach(Skeleton.RIGHT_ARM, rFootX, lerp(g, 14.0F, rFootY - 2.0F), rFootZ + 2.0F);
				case "safety" -> sk.reach(Skeleton.LEFT_ARM, lFootX + 1.0F, lerp(g, 14.0F, lFootY - 2.0F), lFootZ);
				case "liu_kang" -> sk.reach(Skeleton.RIGHT_ARM, rFootX, lerp(g, 14.0F, rFootY - 2.0F), rFootZ);
				case "rocket" -> {
					sk.reach(Skeleton.LEFT_ARM, lFootX, lFootY - 1.0F, lFootZ + 1.0F);
					sk.reach(Skeleton.RIGHT_ARM, rFootX, rFootY - 1.0F, rFootZ + 1.0F);
				}
				case "christ_air" -> {
					sk.reach(Skeleton.LEFT_ARM, 11.0F, 1.0F, 0.0F);
					sk.reach(Skeleton.RIGHT_ARM, -11.0F, 1.0F, 0.0F);
				}
				default -> {
				}
			}
		}
	}

	/** Whether a player is riding sports equipment (for render hooks). */
	public static @Nullable SportEquipmentEntity ridden(Player player) {
		return player.getVehicle() instanceof SportEquipmentEntity entity ? entity : null;
	}

	public static boolean isAirborne(SportEquipmentEntity entity) {
		return RideAnimState.of(entity).contact == RideController.Contact.AIR;
	}

	/** Unused sport hook kept for symmetry with physics. */
	static boolean sidewaysStance(SportType sport) {
		return sport.sidewaysStance();
	}
}
