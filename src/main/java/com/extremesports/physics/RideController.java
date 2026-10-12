package com.extremesports.physics;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.EquipmentStats;
import com.extremesports.sport.HandlingProfile;
import com.extremesports.sport.PhysicsPreset;
import com.extremesports.sport.SportType;
import com.extremesports.sport.SurfaceType;
import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.InputDir;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickCategory;
import com.extremesports.trick.TrickDef;
import com.extremesports.trick.Tricks;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Fixed-timestep (20 Hz) ride simulation for one piece of equipment: momentum physics, surface contact,
 * ramps, grinds, manuals, trick input, landing evaluation and combo building.
 * <p>
 * It runs on whichever side is authoritative for the entity: the rider's client while ridden
 * (like vanilla boats), or the server for an empty board rolling to a stop.
 */
public final class RideController {
	public enum Contact {
		GROUND,
		RAMP,
		AIR,
		GRIND
	}

	/** A flip or whip currently animating. */
	public static final class ActiveTrick {
		public final TrickDef def;
		public int multiple = 1;
		public float progress;
		public final float speed;

		ActiveTrick(TrickDef def, float speed) {
			this.def = def;
			this.speed = speed;
		}

		public boolean done() {
			return progress >= multiple;
		}
	}

	/** Rail currently being ground. */
	public static final class GrindState {
		public GrindSegment segment;
		public double t;
		public float speed;
		public final TrickDef def;
		public int ticks;
		public float distance;
		public float balance;
		float balanceVel;

		GrindState(GrindSegment segment, double t, float speed, TrickDef def) {
			this.segment = segment;
			this.t = t;
			this.speed = speed;
			this.def = def;
		}
	}

	private static final Vec3 UP = new Vec3(0.0, 1.0, 0.0);
	private static final int COMBO_IDLE_TICKS = 14;
	private static final int MIN_SCORED_AIR = 6;

	private final SportEquipmentEntity entity;
	public RideEvents events = RideEvents.NONE;

	private RideInput prev = RideInput.NONE;
	private RideInput input = RideInput.NONE;

	// Contact
	public Contact contact = Contact.AIR;
	public Vec3 normal = UP;
	public SurfaceType surface = SurfaceType.SMOOTH;
	public int airTicks;
	public int groundTicks;
	private boolean wasRampLip;
	private float lastLipAngle;
	/** Flip/whip presses made on the ground (e.g. together with the pop) that fire on takeoff. */
	private int flipBuffer;
	private int whipBuffer;
	private static final int TRICK_BUFFER_TICKS = 4;
	private Vec3 lastRampNormal = UP;

	// Heading / spin
	public float yawRate;
	public float spinAccum;
	private float steer;
	private float relChestAtTakeoff;

	// Drive
	public int strokeTick;
	private int strokeCooldown;
	public int strideSide;
	public float pedalAngle;
	public boolean pedaling;
	public boolean braking;
	public boolean powerslide;
	public float powerslideAngle;
	public boolean backward;

	// Pop / landing
	public boolean charging;
	private int chargeTicks;
	private int landPrep;
	public float landingAbsorb;
	public LandingQuality lastQuality = LandingQuality.CLEAN;
	public int lastLandTick = -100;
	public boolean fakie;
	public boolean bailed;
	/** Diagnostics of the most recent landing, used for practice-mode coaching. */
	public float lastLandingError;
	public boolean lastLandingHadGrab;
	public boolean lastLandingIncomplete;
	/** Yaw change caused by steering this tick; the client turns the camera with it. */
	public float yawSteerDelta;
	public @Nullable BailReason bailReason;

	// Air segment
	public boolean popped;
	private boolean nollieAir;
	private boolean fakieAtTakeoff;
	public @Nullable ActiveTrick activeTrick;
	public @Nullable TrickDef grab;
	public int grabTicks;
	private int grabHoldTotal;
	private final List<String> airTricks = new ArrayList<>();
	private final List<Integer> airMultiples = new ArrayList<>();
	public int trickSequence;

	// Grind / manual
	public @Nullable GrindState grind;
	public @Nullable TrickDef manual;
	public float manualBalance;
	private float manualVel;
	public int manualTicks;

	// Combo
	public final List<ComboEntry> combo = new ArrayList<>();
	private int comboIdle;

	// Animation outputs (tick values; renderers interpolate)
	public float crouch;
	public float crouchO;
	public float lean;
	public float leanO;
	public float wheelAngle;
	public float wheelAngleO;
	public float surfacePitch;
	public float surfacePitchO;
	public float surfaceRoll;
	public float surfaceRollO;
	public float speed;

	public RideController(SportEquipmentEntity entity) {
		this.entity = entity;
	}

	// ------------------------------------------------------------------ accessors

	private EquipmentKind kind() {
		return entity.kind();
	}

	private HandlingProfile handling() {
		return entity.kind().handling();
	}

	private EquipmentStats stats() {
		return entity.stats();
	}

	private PhysicsPreset preset() {
		return entity.preset();
	}

	public PhysicsPreset entityPreset() {
		return entity.preset();
	}

	private SportType sport() {
		return entity.kind().sport();
	}

	private boolean pressed(boolean now, boolean before) {
		return now && !before;
	}

	public boolean grounded() {
		return contact == Contact.GROUND || contact == Contact.RAMP;
	}

	public RideInput input() {
		return input;
	}

	public float gravity() {
		return preset().gravity;
	}

	public InputDir heldDir() {
		return InputDir.of(input.forward(), input.back(), input.left(), input.right());
	}

	public float activeProgress() {
		return activeTrick == null ? 0.0F : activeTrick.progress / activeTrick.multiple;
	}

	public static Vec3 forward(float yawDeg) {
		float rad = yawDeg * Mth.DEG_TO_RAD;
		return new Vec3(-Mth.sin(rad), 0.0, Mth.cos(rad));
	}

	public static float yawOf(Vec3 dir) {
		return (float) (Mth.atan2(-dir.x, dir.z) * Mth.RAD_TO_DEG);
	}

	private static Vec3 projectOnPlane(Vec3 v, Vec3 n) {
		return v.subtract(n.scale(v.dot(n)));
	}

	// ------------------------------------------------------------------ main tick

	public void tick(RideInput newInput) {
		input = newInput;
		crouchO = crouch;
		leanO = lean;
		wheelAngleO = wheelAngle;
		surfacePitchO = surfacePitch;
		surfaceRollO = surfaceRoll;
		boolean ridden = entity.hasRider();

		if (bailed) {
			input = RideInput.NONE;
		}
		if (ridden && !bailed && entity.isInWater()) {
			bail(BailReason.WATER);
		}

		if (contact == Contact.GRIND && grind != null) {
			tickGrind();
		} else {
			tickFree(ridden);
		}

		updateAnimation();
		prev = input;
	}

	// ------------------------------------------------------------------ free movement (ground and air)

	private void tickFree(boolean ridden) {
		HandlingProfile h = handling();
		Vec3 v = entity.getDeltaMovement();
		float yaw = entity.getYRot();
		boolean grounded = grounded();
		float g = gravity();

		if (grounded) {
			groundTicks++;
			airTicks = 0;
			v = projectOnPlane(v, normal);
			yaw = steer(yaw, v, h);
			v = applyGrip(v, yaw, h);
			v = applyDrive(v, yaw, h, ridden);
			v = applyResistance(v, h);
			Vec3 gravityVec = new Vec3(0.0, -g, 0.0);
			v = v.add(projectOnPlane(gravityVec, normal));
			if (contact == Contact.GROUND) {
				v = new Vec3(v.x, -g, v.z);
			}
			entity.setDeltaMovement(v);
			entity.setYRot(yaw);
			handleGroundTricks(ridden, h);
			if (contact == Contact.AIR) {
				// popped this tick
				v = entity.getDeltaMovement();
				yaw = entity.getYRot();
			}
		} else {
			airTicks++;
			groundTicks = 0;
			v = new Vec3(v.x * 0.996, Math.max(v.y - g, -2.4), v.z * 0.996);
			yaw = airControl(yaw, h);
			handleAirTricks(ridden);
			if (contact == Contact.GRIND) {
				entity.setYRot(entity.getYRot());
				return;
			}
		}

		double horizontal = Math.sqrt(v.x * v.x + v.z * v.z);
		double total = v.length();
		float top = h.topSpeed() * stats().speedMultiplier();
		if (total > top) {
			v = v.scale(top / total);
		}
		if (grounded && contact == Contact.GROUND && horizontal < 0.004 && !input.forward() && !input.back()) {
			v = new Vec3(0.0, v.y, 0.0);
		}

		entity.setYRot(yaw);
		moveAndResolve(v, ridden);
	}

	private float steer(float yaw, Vec3 v, HandlingProfile h) {
		float target;
		if (manual != null || charging && sport() == SportType.SKATEBOARD && !input.mouseSteer()) {
			target = (input.right() ? 0.6F : 0.0F) - (input.left() ? 0.6F : 0.0F);
		} else if (input.mouseSteer()) {
			float travelYaw = yaw + (fakie ? 180.0F : 0.0F);
			float diff = Mth.wrapDegrees(input.lookYaw() - travelYaw);
			target = Mth.clamp(diff / 28.0F, -1.0F, 1.0F);
		} else {
			target = (input.right() ? 1.0F : 0.0F) - (input.left() ? 1.0F : 0.0F);
		}
		if (powerslide) {
			target *= 0.3F;
		}
		steer += (target - steer) * 0.35F;
		double speedNow = v.length();
		float t = (float) Mth.clamp(speedNow / 0.5, 0.0, 1.0);
		float rate = Mth.lerp(t, h.turnRateSlow(), h.turnRateFast()) * stats().steeringMultiplier();
		if (speedNow < 0.02 && sport() != SportType.SKATEBOARD && sport() != SportType.SKATES) {
			rate *= 0.4F;
		}
		yawSteerDelta += steer * rate;
		return yaw + steer * rate;
	}

	private Vec3 applyGrip(Vec3 v, float yaw, HandlingProfile h) {
		Vec3 axis = projectOnPlane(forward(yaw), normal);
		if (axis.lengthSqr() < 1.0E-6) {
			return v;
		}
		axis = axis.normalize();
		Vec3 lateral = normal.cross(axis).normalize();
		double a = v.dot(axis);
		double l = v.dot(lateral);
		float grip = h.grip() * surface.grip;
		if (powerslide) {
			grip = 0.18F;
		}
		double newL = l * (1.0 - Mth.clamp(grip, 0.0F, 1.0F));
		double newA = a;
		if (Math.abs(a) > 1.0E-4 && !powerslide) {
			// Carving: sideways slip is turned back into rolling speed, so turns keep momentum
			double gained = 0.8 * (l * l - newL * newL);
			newA = Math.signum(a) * Math.sqrt(a * a + gained);
		}
		fakie = Math.abs(newA) > 0.03 ? newA < 0.0 : fakie;
		return axis.scale(newA).add(lateral.scale(newL)).add(normal.scale(v.dot(normal)));
	}

	private Vec3 applyDrive(Vec3 v, float yaw, HandlingProfile h, boolean ridden) {
		pedaling = false;
		braking = false;
		boolean wasPowerslide = powerslide;
		powerslide = false;
		if (!ridden || bailed || manual != null || charging) {
			strokeTick = 0;
			return v;
		}
		Vec3 axis = projectOnPlane(forward(yaw), normal);
		if (axis.lengthSqr() < 1.0E-6) {
			return v;
		}
		axis = axis.normalize();
		double along = v.dot(axis);
		double speedNow = v.length();
		float maxDrive = h.driveMaxSpeed() * stats().speedMultiplier() * preset().speedMultiplier;
		float impulse = h.driveImpulse() * stats().accelMultiplier();
		double slope = Math.toDegrees(Math.acos(Mth.clamp(normal.y, -1.0, 1.0)));

		// Braking and powerslides
		boolean movingForward = along > 0.02;
		boolean movingBackward = along < -0.02;
		if (input.back() && (sport() == SportType.SKATEBOARD ? speedNow > 0.02 : movingForward)) {
			boolean slideCapable = sport() == SportType.SKATEBOARD || sport() == SportType.SKATES;
			if (slideCapable && (input.left() || input.right()) && speedNow > 0.18) {
				powerslide = true;
				v = v.scale(Math.max(0.0, 1.0 - 0.022 / Math.max(speedNow, 0.022)));
				if (!wasPowerslide) {
					events.onBrake(this, true);
				}
			} else {
				braking = true;
				v = v.scale(Math.max(0.0, 1.0 - h.brakeDecel() / Math.max(speedNow, h.brakeDecel())));
				if (groundTicks % 8 == 1) {
					events.onBrake(this, false);
				}
			}
			strokeTick = 0;
			backward = false;
			return v;
		}

		// Pumping: on ramp transitions you can't push, but bending and extending through the curve adds speed
		if (contact == Contact.RAMP && slope > 10.0) {
			strokeTick = 0;
			if (input.forward() && speedNow > 0.05 && speedNow < 0.95) {
				v = v.add(v.normalize().scale(0.0065 * preset().popMultiplier));
			}
			return v;
		}

		boolean wantsBackward = h.canRideBackward() && input.back() && (movingBackward || speedNow < 0.06);
		boolean driving = (input.forward() || wantsBackward) && slope < 40.0;
		backward = wantsBackward || (h.canRideBackward() && movingBackward && !input.forward());

		if (h.drive() == HandlingProfile.DriveType.PEDAL) {
			if (input.forward() && slope < 40.0) {
				pedaling = true;
				double forwardSpeed = Math.max(0.0, along);
				double accel = impulse * Math.max(0.0, 1.0 - forwardSpeed / maxDrive);
				if (along < 0.0) {
					accel = impulse * 1.5;
				}
				v = v.add(axis.scale(accel));
				pedalAngle += (float) (0.25 + forwardSpeed * 2.2);
			}
			return v;
		}

		if (strokeCooldown > 0) {
			strokeCooldown--;
		}
		if (driving && strokeTick == 0 && strokeCooldown == 0 && speedNow < maxDrive * 1.12) {
			strokeTick = 1;
			if (h.drive() == HandlingProfile.DriveType.STRIDE) {
				strideSide ^= 1;
			}
			events.onPush(this);
		}
		if (strokeTick > 0) {
			int stroke = h.strokeTicks();
			int powerStart = Math.max(1, stroke / 5);
			int powerEnd = Math.max(powerStart + 1, stroke * 3 / 5);
			if (strokeTick >= powerStart && strokeTick < powerEnd) {
				double direction;
				if (h.drive() == HandlingProfile.DriveType.PUSH) {
					direction = Math.abs(along) > 0.02 ? Math.signum(along) : (fakie ? -1.0 : 1.0);
				} else if (wantsBackward) {
					direction = -1.0;
				} else {
					direction = 1.0;
				}
				float limit = wantsBackward ? maxDrive * 0.55F : maxDrive;
				double currentAlong = along * direction;
				double factor = Math.max(0.0, 1.0 - (currentAlong / limit) * (currentAlong / limit));
				if (currentAlong < 0.0) {
					factor = 1.0;
				}
				v = v.add(axis.scale(direction * impulse / (powerEnd - powerStart) * factor));
			}
			strokeTick++;
			if (strokeTick > stroke) {
				strokeTick = 0;
				strokeCooldown = 1;
			}
		}
		return v;
	}

	private Vec3 applyResistance(Vec3 v, HandlingProfile h) {
		Vec3 planar = projectOnPlane(v, normal);
		double speedNow = planar.length();
		if (speedNow < 1.0E-5) {
			return v;
		}
		float rr = h.rollingResistance() * surface.rollingFor(h) * (1.0F - (stats().speed() - 5) * 0.03F);
		float drag = h.aeroDrag() * (float) (speedNow * speedNow);
		if (manual != null) {
			rr += 0.0006F;
		}
		rr += 0.0005F * Math.abs(steer) * (float) Math.min(speedNow, 0.6);
		if (charging) {
			drag *= 0.8F;
		}
		double newSpeed = Math.max(0.0, speedNow - rr - drag);
		return v.subtract(planar).add(planar.scale(newSpeed / speedNow));
	}

	private float airControl(float yaw, HandlingProfile h) {
		float max = h.spinRate() * preset().spinMultiplier * stats().trickMultiplier();
		float dir = (input.right() ? 1.0F : 0.0F) - (input.left() ? 1.0F : 0.0F);
		if (contact == Contact.AIR && dir != 0.0F) {
			float target = dir * max;
			float step = max * 0.3F;
			yawRate += Mth.clamp(target - yawRate, -step, step);
		} else {
			yawRate *= 0.78F;
			if (Math.abs(yawRate) < 0.3F) {
				yawRate = 0.0F;
			}
		}
		spinAccum += yawRate;
		return yaw + yawRate;
	}

	// ------------------------------------------------------------------ tricks on the ground

	private void handleGroundTricks(boolean ridden, HandlingProfile h) {
		if (!ridden || bailed) {
			charging = false;
			flipBuffer = 0;
			whipBuffer = 0;
			return;
		}
		// Trick keys pressed just before or together with the pop are buffered for the takeoff
		flipBuffer = pressed(input.flip(), prev.flip()) ? TRICK_BUFFER_TICKS : Math.max(0, flipBuffer - 1);
		whipBuffer = pressed(input.whip(), prev.whip()) ? TRICK_BUFFER_TICKS : Math.max(0, whipBuffer - 1);
		// Manual
		if (manual != null) {
			tickManual();
			if (manual == null && bailed) {
				return;
			}
		} else if (pressed(input.grind(), prev.grind()) && !charging && speed > 0.08) {
			TrickDef def = Tricks.select(sport(), TrickCategory.MANUAL, InputDir.of(input.forward(), input.back(), false, false));
			if (def != null) {
				manual = def;
				manualTicks = 0;
				manualBalance = 0.0F;
				manualVel = (entity.getRandom().nextFloat() - 0.5F) * 0.02F;
				events.onManualStart(this, def);
			}
		}

		// Ollie: crouch on press, pop on release
		if (input.jump() && !prev.jump() && !charging) {
			charging = true;
			chargeTicks = 0;
		}
		if (charging) {
			chargeTicks++;
			if (!input.jump()) {
				pop(h, input.forward() && sport() == SportType.SKATEBOARD && manual == null);
			}
		}

		// Combo banking while rolling normally
		if (!combo.isEmpty() && manual == null && contact != Contact.AIR) {
			comboIdle++;
			if (comboIdle > COMBO_IDLE_TICKS) {
				endCombo(true);
			}
		}
	}

	private void pop(HandlingProfile h, boolean nollie) {
		charging = false;
		if (manual != null) {
			endManual();
		}
		float strength = h.popVelocity() * preset().popMultiplier * (0.85F + 0.15F * Math.min(chargeTicks, 6) / 6.0F)
			* (1.0F + (stats().tricks() - 5) * 0.02F);
		Vec3 v = entity.getDeltaMovement();
		Vec3 popDir = normal.add(UP).normalize();
		Vec3 newV = projectOnPlane(v, normal).add(popDir.scale(strength));
		if (contact == Contact.GROUND) {
			newV = new Vec3(newV.x, strength, newV.z);
		}
		entity.setDeltaMovement(newV);
		startAir(true, nollie);
		float dir = (input.right() ? 1.0F : 0.0F) - (input.left() ? 1.0F : 0.0F);
		if (dir != 0.0F) {
			yawRate = dir * handling().spinRate() * preset().spinMultiplier * 0.45F;
		}
		events.onPop(this, nollie);
		comboIdle = 0;
	}

	private void startAir(boolean popped, boolean nollie) {
		contact = Contact.AIR;
		this.popped = popped;
		this.nollieAir = nollie;
		this.fakieAtTakeoff = fakie;
		airTicks = 0;
		spinAccum = 0.0F;
		activeTrick = null;
		grab = null;
		grabTicks = 0;
		grabHoldTotal = 0;
		airTricks.clear();
		airMultiples.clear();
		landPrep = 0;
		float travelYaw = yawOf(entity.getDeltaMovement().lengthSqr() > 1.0E-4 ? entity.getDeltaMovement() : forward(entity.getYRot()));
		float chest = entity.getYRot() + (entity.isGoofy() ? -90.0F : 90.0F);
		relChestAtTakeoff = Mth.wrapDegrees(chest - travelYaw);
		if (popped) {
			airTricks.add(Tricks.ollieFor(sport(), nollie).id());
			airMultiples.add(1);
		}
	}

	// ------------------------------------------------------------------ tricks in the air

	private void handleAirTricks(boolean ridden) {
		if (!ridden || bailed) {
			return;
		}
		InputDir dir = heldDir();
		if (activeTrick != null && !activeTrick.done()) {
			activeTrick.progress = Math.min(activeTrick.multiple, activeTrick.progress + activeTrick.speed);
		}
		boolean bufferedTakeoff = popped && airTicks <= 2;
		if (pressed(input.flip(), prev.flip()) || flipBuffer > 0 && bufferedTakeoff) {
			flipBuffer = 0;
			startTrick(TrickCategory.FLIP, dir);
		}
		if (pressed(input.whip(), prev.whip()) || whipBuffer > 0 && bufferedTakeoff) {
			whipBuffer = 0;
			startTrick(TrickCategory.WHIP, dir);
		}
		if (!bufferedTakeoff) {
			flipBuffer = 0;
			whipBuffer = 0;
		}
		if (input.grab()) {
			if (grab == null && (activeTrick == null || activeTrick.progress / activeTrick.multiple > 0.7F)) {
				TrickDef def = Tricks.select(sport(), TrickCategory.GRAB, dir);
				if (def != null) {
					grab = def;
					grabTicks = 0;
					addAirTrick(def);
					trickSequence++;
					events.onGrabStart(this, def);
				}
			}
			if (grab != null) {
				grabTicks++;
				grabHoldTotal++;
			}
		} else if (grab != null) {
			grab = null;
		}
		if (pressed(input.jump(), prev.jump())) {
			landPrep = 7;
		} else if (landPrep > 0) {
			landPrep--;
		}
		if (input.grind() || preset().autoGrind) {
			if (airTicks >= 2 || !popped) {
				tryGrind(pressed(input.grind(), prev.grind()) || input.grind());
			}
		}
	}

	private void addAirTrick(TrickDef def) {
		String ollieId = Tricks.ollieFor(sport(), nollieAir).id();
		if (airTricks.size() == 1 && airTricks.getFirst().equals(ollieId) && def.category() != TrickCategory.OLLIE) {
			// keep the ollie entry for scoring only when nothing else happens
			airTricks.clear();
			airMultiples.clear();
		}
		airTricks.add(def.id());
		airMultiples.add(1);
	}

	private void startTrick(TrickCategory category, InputDir dir) {
		TrickDef def = Tricks.select(sport(), category, dir);
		if (def == null) {
			return;
		}
		if (activeTrick != null && !activeTrick.done()) {
			if (activeTrick.def == def && activeTrick.multiple < 3 && activeTrick.progress < activeTrick.multiple - 0.35F) {
				activeTrick.multiple++;
				airMultiples.set(airMultiples.size() - 1, activeTrick.multiple);
				trickSequence++;
				events.onTrickStart(this, def, activeTrick.multiple);
			}
			return;
		}
		if (grab != null) {
			return;
		}
		float speedMul = stats().trickMultiplier();
		activeTrick = new ActiveTrick(def, speedMul / Math.max(1, def.duration()));
		addAirTrick(def);
		trickSequence++;
		events.onTrickStart(this, def, 1);
	}

	// ------------------------------------------------------------------ movement and contact resolution

	private void moveAndResolve(Vec3 v, boolean ridden) {
		Level level = entity.level();
		Contact before = contact;
		Vec3 start = entity.position();
		int steps = Mth.clamp(Mth.ceil(v.length() / 0.2), 1, 8);
		Vec3 step = v.scale(1.0 / steps);
		Vec3 blocked = Vec3.ZERO;
		boolean steppedUp = false;
		SurfaceSampler.RampHit rampHit = null;

		for (int i = 0; i < steps; i++) {
			Vec3 from = entity.position();
			entity.move(MoverType.SELF, step);
			Vec3 moved = entity.position().subtract(from);
			if (moved.y > step.y + 0.2 && grounded()) {
				steppedUp = true;
			}
			if (ridden && !riderSpaceCheck(from, moved)) {
				moved = entity.position().subtract(from);
			}
			double bx = Math.abs(moved.x - step.x) > 1.0E-4 ? step.x - moved.x : 0.0;
			double bz = Math.abs(moved.z - step.z) > 1.0E-4 ? step.z - moved.z : 0.0;
			if (bx != 0.0 || bz != 0.0) {
				blocked = blocked.add(bx, 0.0, bz);
				step = new Vec3(bx != 0.0 ? 0.0 : step.x, step.y, bz != 0.0 ? 0.0 : step.z);
			}
			// Resolve penetration into ramp surfaces
			Vec3 pos = entity.position();
			double maxUp = Math.min(1.05, Mth.floor(pos.y) + 1.0 - pos.y + 0.002);
			SurfaceSampler.RampHit hit = SurfaceSampler.sample(level, pos.x, pos.y, pos.z, maxUp, 0.0);
			if (hit != null && hit.height() >= pos.y - 1.0E-4) {
				entity.setPos(pos.x, hit.height(), pos.z);
				rampHit = hit;
			}
		}

		Vec3 pos = entity.position();
		boolean wasGrounded = before == Contact.GROUND || before == Contact.RAMP;
		boolean justPopped = before == Contact.AIR && airTicks == 0;

		// Look for a ramp surface just below us if we were attached (crests, downslopes)
		if (rampHit == null) {
			double stick = wasGrounded && !justPopped ? Math.max(gravity() * 2.0, 0.14) : 0.0;
			SurfaceSampler.RampHit below = SurfaceSampler.sample(level, pos.x, pos.y, pos.z, 0.0, stick + 1.0E-3);
			if (below != null) {
				rampHit = below;
				entity.setPos(pos.x, below.height(), pos.z);
				pos = entity.position();
			}
		}

		Vec3 newV = v;
		if (blocked.lengthSqr() > 0.0) {
			newV = handleWall(newV, blocked.scale(steps), before);
			if (bailed) {
				return;
			}
		}

		if (rampHit != null) {
			// On (or landing onto) a ramp surface
			Vec3 n = rampHit.normal();
			if (before == Contact.AIR) {
				land(newV, n, rampHit.state().getBlock() instanceof com.extremesports.block.ParkSurface ps ? ps.surfaceType(rampHit.state()) : SurfaceType.WOOD);
				newV = entity.getDeltaMovement();
			} else {
				newV = redirect(newV, n);
				surface = rampHit.state().getBlock() instanceof com.extremesports.block.ParkSurface ps ? ps.surfaceType(rampHit.state()) : SurfaceType.WOOD;
			}
			contact = Contact.RAMP;
			normal = n;
			lastRampNormal = n;
			lastLipAngle = rampHit.provider().lipAngle(rampHit.state());
			wasRampLip = true;
		} else if (entity.onGround() || steppedUp) {
			BlockState ground = groundState();
			SurfaceType type = SurfaceType.classify(ground);
			if (before == Contact.AIR) {
				land(newV, UP, type);
				newV = entity.getDeltaMovement();
			} else if (before == Contact.RAMP) {
				newV = redirect(newV, UP);
			}
			newV = new Vec3(newV.x, 0.0, newV.z);
			if (steppedUp) {
				newV = newV.scale(0.88);
			}
			surface = type;
			contact = Contact.GROUND;
			normal = UP;
			wasRampLip = false;
		} else {
			// Not supported: try snapping down small drops (slab steps) to keep rolling smoothly
			if (wasGrounded && !justPopped && before == Contact.GROUND && trySnapDown(newV)) {
				double drop = pos.y - entity.position().y;
				double horizontal = Math.sqrt(newV.x * newV.x + newV.z * newV.z);
				if (horizontal > 1.0E-4) {
					double gained = Math.sqrt(horizontal * horizontal + 2.0 * gravity() * drop * 0.8);
					newV = new Vec3(newV.x / horizontal * gained, 0.0, newV.z / horizontal * gained);
				}
				contact = Contact.GROUND;
				normal = UP;
			} else {
				if (before != Contact.AIR) {
					if (before == Contact.RAMP && wasRampLip) {
						newV = applyVertAssist(newV);
					}
					startAir(false, false);
				}
				contact = Contact.AIR;
				normal = UP;
			}
		}

		entity.setDeltaMovement(newV);
		speed = (float) newV.length();
		Vec3 actual = entity.position().subtract(start);
		wheelAngle += (float) (Math.sqrt(actual.x * actual.x + actual.z * actual.z) / handling().wheelRadius()) * (fakie ? -1.0F : 1.0F);
	}

	/** Keeps the rider's body out of low ceilings and walls; the board's own hitbox is tiny so it can ride ramp transitions. */
	private boolean riderSpaceCheck(Vec3 from, Vec3 moved) {
		if (contact != Contact.GROUND) {
			return true;
		}
		Vec3 to = entity.position();
		if (entity.riderSpaceFree(to)) {
			return true;
		}
		double x = entity.riderSpaceFree(new Vec3(to.x, to.y, from.z)) ? to.x : from.x;
		double z = entity.riderSpaceFree(new Vec3(x, to.y, to.z)) ? to.z : from.z;
		if (!entity.riderSpaceFree(new Vec3(x, to.y, z))) {
			x = from.x;
			z = from.z;
		}
		entity.setPos(x, to.y, z);
		return false;
	}

	private boolean trySnapDown(Vec3 v) {
		if (charging || Math.abs(v.y) > 0.3 || bailed) {
			return false;
		}
		Vec3 pos = entity.position();
		float maxDrop = 0.55F;
		entity.move(MoverType.SELF, new Vec3(0.0, -maxDrop, 0.0));
		if (entity.onGround() && pos.y - entity.position().y <= maxDrop + 1.0E-3) {
			return true;
		}
		entity.setPos(pos.x, pos.y, pos.z);
		return false;
	}

	private BlockState groundState() {
		Vec3 pos = entity.position();
		BlockPos below = BlockPos.containing(pos.x, pos.y - 0.05, pos.z);
		BlockState state = entity.level().getBlockState(below);
		if (state.isAir() || state.getCollisionShape(entity.level(), below).isEmpty()) {
			state = entity.level().getBlockState(below.below());
		}
		return state;
	}

	/** Re-aims velocity along a new surface, keeping most of the speed through kinks. */
	private Vec3 redirect(Vec3 v, Vec3 n) {
		double speedBefore = v.length();
		Vec3 projected = projectOnPlane(v, n);
		double speedAfter = projected.length();
		if (speedAfter < 1.0E-5) {
			return projected;
		}
		double kept = speedAfter + 0.85 * (speedBefore - speedAfter);
		return projected.scale(kept / speedAfter);
	}

	private Vec3 applyVertAssist(Vec3 v) {
		if (lastLipAngle < 60.0F) {
			return v;
		}
		Vec3 horizontalNormal = new Vec3(lastRampNormal.x, 0.0, lastRampNormal.z);
		if (horizontalNormal.lengthSqr() < 1.0E-4) {
			return v;
		}
		Vec3 uphill = horizontalNormal.normalize().scale(-1.0);
		double toward = v.x * uphill.x + v.z * uphill.z;
		if (toward <= 0.0) {
			return v;
		}
		// Steer the outward drift toward a re-entry about a third of a block inside the coping. The preset decides how
		// much of that guidance is applied: Arcade always comes back in, Realistic needs a clean, vertical launch.
		double flight = v.y > 0.02 ? 2.0 * v.y / gravity() : 0.0;
		double target = flight > 1.0 ? -0.35 / flight : 0.0;
		double newToward = Mth.lerp(preset().vertAssist, toward, target);
		double change = newToward - toward;
		return new Vec3(v.x + uphill.x * change, v.y, v.z + uphill.z * change);
	}

	private Vec3 handleWall(Vec3 v, Vec3 blockedVelocity, Contact before) {
		double impact = Math.sqrt(blockedVelocity.x * blockedVelocity.x + blockedVelocity.z * blockedVelocity.z);
		boolean steep = before == Contact.RAMP && normal.y < 0.6;
		double bx = blockedVelocity.x != 0.0 ? -v.x * 0.25 : v.x;
		double bz = blockedVelocity.z != 0.0 ? -v.z * 0.25 : v.z;
		if (steep) {
			// Meeting the deck at the top of a steep transition: the wall is effectively vertical, so the blocked
			// horizontal momentum carries on upward instead of vanishing (this is what sends riders into the air).
			double lost = Math.sqrt((blockedVelocity.x != 0.0 ? v.x * v.x : 0.0) + (blockedVelocity.z != 0.0 ? v.z * v.z : 0.0));
			double vy = v.y > 0.0 ? Math.sqrt(v.y * v.y + 0.85 * lost * lost) : v.y;
			return new Vec3(blockedVelocity.x != 0.0 ? 0.0 : v.x, vy, blockedVelocity.z != 0.0 ? 0.0 : v.z);
		}
		if (entity.hasRider() && impact > preset().wallBailSpeed * (0.85 + 0.15 * stats().stabilityMultiplier())) {
			bail(BailReason.WALL);
			return Vec3.ZERO;
		}
		if (impact > 0.08) {
			events.onWallBonk(this, (float) impact);
		}
		return new Vec3(bx, v.y, bz);
	}

	// ------------------------------------------------------------------ landing

	private void land(Vec3 v, Vec3 n, SurfaceType type) {
		Vec3 tangent = projectOnPlane(v, n);
		double impact = Math.max(0.0, -v.dot(n));
		Vec3 axis = projectOnPlane(forward(entity.getYRot()), n);
		axis = axis.lengthSqr() > 1.0E-6 ? axis.normalize() : forward(entity.getYRot());
		Vec3 travel = tangent.lengthSqr() > 0.0016 ? tangent.normalize() : axis;
		double alignment = Mth.clamp(axis.dot(travel), -1.0, 1.0);
		double error = Math.toDegrees(Math.acos(Math.abs(alignment)));
		boolean landedFakie = alignment < 0.0;
		surface = type;

		boolean scored = popped || airTricks.size() > (popped ? 1 : 0) || Math.abs(spinAccum) >= 150.0F || grabHoldTotal > 0;
		boolean ridden = entity.hasRider();
		float tolerance = preset().landingTolerance * stats().stabilityMultiplier();
		boolean incomplete = activeTrick != null && !activeTrick.done();
		float progress = activeTrick == null ? 1.0F : activeTrick.progress / activeTrick.multiple;
		lastLandingError = (float) error;
		lastLandingHadGrab = grab != null;
		lastLandingIncomplete = incomplete;
		float midTrickLimit = preset() == PhysicsPreset.ARCADE ? 0.62F : 0.82F;

		LandingQuality quality = LandingQuality.CLEAN;
		BailReason reason = null;
		if (incomplete && progress < midTrickLimit) {
			reason = BailReason.MID_TRICK;
		} else if (error > 42.0F * tolerance && tangent.length() > 0.05) {
			reason = BailReason.OVER_ROTATED;
		} else if (impact > preset().bigDropBailImpact) {
			reason = BailReason.BIG_DROP;
		}
		if (reason != null && ridden && !bailed) {
			lastQuality = LandingQuality.BAIL;
			bail(reason);
			return;
		}
		if (error <= 9.0F * tolerance && !incomplete && grab == null && (landPrep > 0 || !preset().perfectNeedsPrep)) {
			quality = LandingQuality.PERFECT;
		} else if (error > 22.0F * tolerance || incomplete || grab != null || impact > preset().bigDropBailImpact * 0.75F) {
			quality = LandingQuality.SKETCHY;
		}

		// Align the board with the travel direction and absorb the impact
		float travelYaw = yawOf(travel);
		float target = landedFakie ? travelYaw + 180.0F : travelYaw;
		float diff = Mth.wrapDegrees(target - entity.getYRot());
		entity.setYRot(entity.getYRot() + diff * (quality == LandingQuality.SKETCHY ? 0.6F : 0.85F));
		fakie = landedFakie;
		double keep = 1.0 - Math.min(0.3, impact * 0.18) - (quality == LandingQuality.SKETCHY ? 0.12 : 0.0);
		entity.setDeltaMovement(tangent.scale(keep));
		landingAbsorb = (float) Mth.clamp(impact * 1.6 + 0.25, 0.25, 1.0);
		yawRate = 0.0F;
		lastLandTick = entity.tickCount;

		int spin = Math.round(Math.abs(spinAccum) / 180.0F) * 180;
		int spinSign = spinAccum == 0.0F ? 0 : (Math.signum(spinAccum) * Math.signum(relChestAtTakeoff) < 0 ? 1 : -1);
		ComboEntry entry = new ComboEntry(ComboEntry.Kind.AIR, List.copyOf(airTricks), List.copyOf(airMultiples), spin, spinSign,
			airTicks, grabHoldTotal, 0.0F, quality, fakieAtTakeoff, nollieAir);
		boolean worthScoring = scored && ridden && (airTicks >= MIN_SCORED_AIR || airTricks.size() > (popped ? 1 : 0) || spin >= 180);
		if (worthScoring) {
			lastQuality = quality;
			combo.add(entry);
			comboIdle = 0;
			events.onComboUpdate(this, combo);
		}
		events.onLand(this, quality, (float) impact, entry, worthScoring);
		activeTrick = null;
		grab = null;
		popped = false;
		landPrep = 0;
		airTricks.clear();
		airMultiples.clear();
	}

	// ------------------------------------------------------------------ grinding

	private void tryGrind(boolean wantsGrind) {
		if (!wantsGrind && !preset().autoGrind) {
			return;
		}
		Vec3 pos = entity.position();
		Vec3 v = entity.getDeltaMovement();
		float radius = preset().grindSnapRadius;
		AABB area = new AABB(pos, pos).inflate(radius + 0.6, 1.1, radius + 0.6).expandTowards(v.x, v.y, v.z);
		List<GrindSegment> segments = GrindFinder.collect(entity.level(), area);
		GrindSegment best = null;
		double bestT = 0.0;
		double bestScore = Double.MAX_VALUE;
		Vec3 horizontalV = new Vec3(v.x, 0.0, v.z);
		double horizontalSpeed = horizontalV.length();
		for (GrindSegment segment : segments) {
			double t = segment.closestT(pos);
			Vec3 closest = segment.at(t);
			double dx = pos.x - closest.x;
			double dz = pos.z - closest.z;
			double horizontalDistance = Math.sqrt(dx * dx + dz * dz);
			if (horizontalDistance > radius) {
				continue;
			}
			double dy = pos.y - closest.y;
			if (dy < -0.3 || dy > 0.9) {
				continue;
			}
			if (v.y > 0.1 && dy < 0.05) {
				continue;
			}
			Vec3 dir = segment.direction();
			Vec3 dirH = new Vec3(dir.x, 0.0, dir.z);
			double alignment = 1.0;
			if (horizontalSpeed > 0.05 && dirH.lengthSqr() > 1.0E-4) {
				alignment = Math.abs(horizontalV.normalize().dot(dirH.normalize()));
				if (alignment < 0.57) {
					continue;
				}
			}
			double score = horizontalDistance + Math.abs(dy) * 0.5 + (1.0 - alignment);
			if (score < bestScore) {
				bestScore = score;
				best = segment;
				bestT = t;
			}
		}
		if (best != null) {
			enterGrind(best, bestT);
		}
	}

	private void enterGrind(GrindSegment segment, double t) {
		Vec3 v = entity.getDeltaMovement();
		Vec3 dir = segment.direction();
		double along = v.dot(dir);
		if (Math.abs(along) < 1.0E-3) {
			along = forward(entity.getYRot()).dot(dir) >= 0.0 ? 0.1 : -0.1;
		}
		GrindSegment oriented = along >= 0.0 ? segment : segment.reversed();
		double orientedT = along >= 0.0 ? t : 1.0 - t;
		Vec3 perpendicular = v.subtract(dir.scale(v.dot(dir)));
		float grindSpeed = (float) Math.max(0.12, Math.abs(along) * 0.95 + perpendicular.length() * 0.1);

		// The air before the grind counts as landed onto the rail
		boolean incomplete = activeTrick != null && !activeTrick.done() && activeTrick.progress / activeTrick.multiple < 0.8F;
		if (incomplete) {
			bail(BailReason.MID_TRICK);
			return;
		}
		InputDir dirInput = heldDir();
		TrickDef def = Tricks.select(sport(), TrickCategory.GRIND, dirInput);
		if (def == null) {
			return;
		}
		boolean hadTricks = airTricks.size() > (popped ? 1 : 0) || Math.abs(spinAccum) >= 150.0F || grabHoldTotal > 0;
		if (hadTricks) {
			int spin = Math.round(Math.abs(spinAccum) / 180.0F) * 180;
			int spinSign = spinAccum == 0.0F ? 0 : (Math.signum(spinAccum) * Math.signum(relChestAtTakeoff) < 0 ? 1 : -1);
			combo.add(new ComboEntry(ComboEntry.Kind.AIR, List.copyOf(airTricks), List.copyOf(airMultiples), spin, spinSign,
				airTicks, grabHoldTotal, 0.0F, LandingQuality.CLEAN, fakieAtTakeoff, nollieAir));
		}
		activeTrick = null;
		grab = null;
		popped = false;
		airTricks.clear();
		airMultiples.clear();
		yawRate = 0.0F;

		grind = new GrindState(oriented, orientedT, grindSpeed, def);
		grind.balance = (entity.getRandom().nextFloat() - 0.5F) * 0.15F;
		contact = Contact.GRIND;
		Vec3 point = oriented.at(orientedT);
		entity.setPos(point.x, point.y, point.z);
		float railYaw = yawOf(oriented.direction());
		float diff = Mth.wrapDegrees(railYaw - entity.getYRot());
		boolean reverse = Math.abs(diff) > 90.0F;
		entity.setYRot(reverse ? railYaw + 180.0F : railYaw);
		fakie = reverse;
		entity.setDeltaMovement(oriented.direction().scale(grindSpeed));
		comboIdle = 0;
		trickSequence++;
		events.onGrindStart(this, def, oriented);
	}

	private void tickGrind() {
		GrindState state = grind;
		if (state == null) {
			contact = Contact.AIR;
			return;
		}
		boolean ridden = entity.hasRider();
		Vec3 dir = state.segment.direction();
		state.speed += (float) (-gravity() * dir.y) - (state.segment.metal() ? 0.0012F : 0.0026F);
		state.speed = Math.min(state.speed, handling().topSpeed());
		if (state.speed < 0.035F || !ridden) {
			exitGrind(false, 0.0F);
			return;
		}
		double length = Math.max(1.0E-3, state.segment.length());
		state.t += state.speed / length;
		while (state.t > 1.0) {
			GrindSegment next = GrindFinder.findContinuation(entity.level(), state.segment.end(), dir, state.segment);
			if (next == null) {
				Vec3 end = state.segment.end();
				entity.setPos(end.x, end.y, end.z);
				exitGrind(false, 0.0F);
				return;
			}
			double overflow = (state.t - 1.0) * length;
			state.segment = next;
			length = Math.max(1.0E-3, next.length());
			state.t = overflow / length;
			dir = next.direction();
		}
		Vec3 point = state.segment.at(state.t);
		if (!entity.riderSpaceFree(point)) {
			if (preset() == PhysicsPreset.ARCADE) {
				exitGrind(false, 0.0F);
			} else {
				bail(BailReason.GRIND_BLOCKED);
			}
			return;
		}
		entity.setPos(point.x, point.y, point.z);
		entity.setDeltaMovement(dir.scale(state.speed));
		float railYaw = yawOf(dir);
		entity.setYRot(fakie ? railYaw + 180.0F : railYaw);
		state.ticks++;
		state.distance += state.speed;
		speed = state.speed;
		wheelAngleO = wheelAngle;

		// Balance: unstable equilibrium the rider counters with left/right
		float difficulty = preset().balanceDifficulty / stats().stabilityMultiplier();
		float noise = (entity.getRandom().nextFloat() - 0.5F) * 0.012F * difficulty * (1.0F + state.speed);
		state.balanceVel += noise + state.balance * 0.010F * difficulty;
		if (input.left()) {
			state.balanceVel -= 0.0105F;
		}
		if (input.right()) {
			state.balanceVel += 0.0105F;
		}
		state.balanceVel *= 0.88F;
		state.balance += state.balanceVel;
		if (Math.abs(state.balance) >= 1.0F) {
			if (preset() == PhysicsPreset.ARCADE) {
				exitGrind(false, Math.signum(state.balance));
			} else {
				bail(BailReason.GRIND_BALANCE);
			}
			return;
		}
		if (pressed(input.jump(), prev.jump())) {
			exitGrind(true, 0.0F);
		}
	}

	private void exitGrind(boolean ollie, float fallSide) {
		GrindState state = grind;
		grind = null;
		if (state == null) {
			contact = Contact.AIR;
			return;
		}
		Vec3 dir = state.segment.direction();
		Vec3 v = dir.scale(state.speed);
		if (state.ticks >= 3) {
			combo.add(new ComboEntry(ComboEntry.Kind.GRIND, List.of(state.def.id()), List.of(1), 0, 0, state.ticks, 0,
				state.distance, LandingQuality.CLEAN, fakie, false));
			comboIdle = 0;
			events.onComboUpdate(this, combo);
			events.onGrindEnd(this, combo.getLast());
		}
		Vec3 side = new Vec3(-dir.z, 0.0, dir.x);
		if (ollie) {
			float strength = handling().popVelocity() * preset().popMultiplier * 0.9F;
			float lateral = (input.right() ? 0.13F : 0.0F) - (input.left() ? 0.13F : 0.0F);
			v = v.add(0.0, strength, 0.0).add(side.scale(lateral));
		} else {
			v = v.add(0.0, 0.05, 0.0).add(side.scale(0.09F * fallSide));
		}
		entity.setDeltaMovement(v);
		entity.setPos(entity.getX(), entity.getY() + 0.02, entity.getZ());
		startAir(ollie, false);
		if (ollie) {
			events.onPop(this, false);
		}
	}

	// ------------------------------------------------------------------ manuals

	private void tickManual() {
		TrickDef def = manual;
		if (def == null) {
			return;
		}
		manualTicks++;
		float difficulty = preset().balanceDifficulty / stats().stabilityMultiplier();
		float noise = (entity.getRandom().nextFloat() - 0.5F) * 0.010F * difficulty;
		manualVel += noise + manualBalance * 0.008F * difficulty;
		if (input.forward()) {
			manualVel -= 0.0085F;
		}
		if (input.back()) {
			manualVel += 0.0085F;
		}
		manualVel *= 0.88F;
		manualBalance += manualVel;
		if (Math.abs(manualBalance) >= 1.0F) {
			if (preset() == PhysicsPreset.ARCADE) {
				endManual();
			} else {
				manual = null;
				bail(BailReason.MANUAL_BALANCE);
			}
			return;
		}
		if (pressed(input.grind(), prev.grind()) && manualTicks > 2 || speed < 0.04F) {
			endManual();
		}
	}

	private void endManual() {
		TrickDef def = manual;
		manual = null;
		if (def != null && manualTicks >= 5) {
			combo.add(new ComboEntry(ComboEntry.Kind.MANUAL, List.of(def.id()), List.of(1), 0, 0, manualTicks, 0, 0.0F,
				LandingQuality.CLEAN, fakie, false));
			comboIdle = 0;
			events.onComboUpdate(this, combo);
			events.onManualEnd(this, combo.getLast());
		}
		manualTicks = 0;
		manualBalance = 0.0F;
	}

	// ------------------------------------------------------------------ bails and combos

	public void bail(BailReason reason) {
		if (bailed) {
			return;
		}
		bailed = true;
		bailReason = reason;
		lastQuality = LandingQuality.BAIL;
		charging = false;
		manual = null;
		grind = null;
		activeTrick = null;
		grab = null;
		if (contact == Contact.GRIND) {
			contact = Contact.AIR;
		}
		events.onBail(this, reason);
		endCombo(false);
	}

	private void endCombo(boolean landed) {
		if (!combo.isEmpty()) {
			events.onComboEnd(this, List.copyOf(combo), landed);
			combo.clear();
		}
		comboIdle = 0;
	}

	/** Called when the rider gets off: finish whatever was in progress without a bail. */
	public void reset() {
		if (manual != null) {
			endManual();
		}
		endCombo(true);
		bailed = false;
		bailReason = null;
		charging = false;
		grind = null;
		if (contact == Contact.GRIND) {
			contact = Contact.AIR;
		}
		activeTrick = null;
		grab = null;
		strokeTick = 0;
		powerslide = false;
		braking = false;
		pedaling = false;
	}

	// ------------------------------------------------------------------ animation targets

	private void updateAnimation() {
		float target = 0.18F;
		if (charging) {
			target = 1.0F;
		} else if (contact == Contact.GRIND) {
			target = 0.5F;
		} else if (manual != null) {
			target = 0.35F;
		} else if (contact == Contact.AIR) {
			target = activeTrick != null && !activeTrick.done() || grab != null ? 0.85F : 0.45F;
			if (landPrep > 0) {
				target = 0.75F;
			}
		} else if (powerslide) {
			target = 0.65F;
		} else if (strokeTick > 0) {
			target = 0.3F;
		}
		target = Math.max(target, landingAbsorb);
		landingAbsorb = Math.max(0.0F, landingAbsorb - 0.12F);
		crouch += (target - crouch) * (charging || landingAbsorb > 0.0F ? 0.55F : 0.3F);

		float leanTarget = contact == Contact.AIR ? 0.0F : steer * Mth.clamp(speed / 0.3F, 0.0F, 1.0F);
		if (powerslide) {
			leanTarget = -Math.signum(steer) * 0.8F;
		}
		if (grind != null) {
			leanTarget = grind.balance * 0.8F;
		}
		lean += (leanTarget - lean) * 0.25F;

		float slideTarget = powerslide ? (steer >= 0.0F ? 80.0F : -80.0F) : 0.0F;
		powerslideAngle += (slideTarget - powerslideAngle) * 0.3F;

		// Board pitch/roll following the surface
		float targetPitch = 0.0F;
		float targetRoll = 0.0F;
		if (contact == Contact.RAMP) {
			Vec3 axis = forward(entity.getYRot());
			Vec3 side = new Vec3(-axis.z, 0.0, axis.x);
			targetPitch = (float) Math.toDegrees(Math.asin(Mth.clamp(-normal.dot(axis), -1.0, 1.0)));
			targetRoll = (float) Math.toDegrees(Math.asin(Mth.clamp(normal.dot(side), -1.0, 1.0)));
		} else if (contact == Contact.GRIND && grind != null) {
			Vec3 dir = grind.segment.direction();
			targetPitch = (float) Math.toDegrees(Math.asin(Mth.clamp(dir.y, -1.0, 1.0))) * (fakie ? -1.0F : 1.0F);
		} else if (contact == Contact.AIR) {
			targetPitch = surfacePitch * 0.85F;
			targetRoll = surfaceRoll * 0.85F;
		}
		surfacePitch += (targetPitch - surfacePitch) * (contact == Contact.AIR ? 0.25F : 0.6F);
		surfaceRoll += (targetRoll - surfaceRoll) * 0.5F;
		// Synced to other clients through the vanilla vehicle movement packets
		entity.setXRot(Mth.clamp(surfacePitch, -89.0F, 89.0F));
	}

	public int chargeTicks() {
		return chargeTicks;
	}

	public int landPrep() {
		return landPrep;
	}

	public float steerAmount() {
		return steer;
	}
}
