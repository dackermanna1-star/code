package com.extremesports.client.anim;

import com.extremesports.client.fx.RideFx;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.RideController;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickDef;
import com.extremesports.trick.Tricks;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;
import org.jspecify.annotations.Nullable;

/**
 * Per-entity animation state on the client, advanced once per tick. Values are smoothed with critically damped
 * springs and kept with their previous-tick copies so rendering can interpolate at any frame rate.
 * <p>
 * For the local rider the inputs come straight from the physics simulation; for everyone else they come from the
 * synced entity data, so all players see the same tricks.
 */
public final class RideAnimState {
	public static final class Channel {
		public float value;
		public float prev;
		private float velocity;

		/** Critically damped spring toward target; stiffness in 1/ticks. */
		void spring(float target, float stiffness) {
			prev = value;
			float omega = stiffness;
			float x = value - target;
			float exp = (float) Math.exp(-omega);
			float newX = (x + (velocity + omega * x)) * exp;
			velocity = (velocity - omega * (velocity + omega * x)) * exp;
			value = target + newX;
		}

		void set(float target) {
			prev = value;
			value = target;
			velocity = 0.0F;
		}

		public float get(float partialTick) {
			return Mth.lerp(partialTick, prev, value);
		}
	}

	// Raw state
	public boolean local;
	public int flags;
	public RideController.Contact contact = RideController.Contact.GROUND;
	public @Nullable TrickDef trick;
	public int trickMultiple = 1;
	public float trickProgress;
	public float trickProgressPrev;
	private int trickSeq = -1;
	public @Nullable TrickDef grab;
	public @Nullable TrickDef grindOrManual;
	public int landingTick = -100;
	public LandingQuality landingQuality = LandingQuality.CLEAN;
	private int landingSeq = -1;
	public int age;
	public int airTicks;

	// Smoothed channels
	public final Channel crouch = new Channel();
	public final Channel lean = new Channel();
	public final Channel balance = new Channel();
	public final Channel grabBlend = new Channel();
	public final Channel grindBlend = new Channel();
	public final Channel manualBlend = new Channel();
	public final Channel airBlend = new Channel();
	public final Channel brakeBlend = new Channel();
	public final Channel slideAngle = new Channel();
	public final Channel mountBlend = new Channel();
	public final Channel landing = new Channel();
	public final Channel pitch = new Channel();
	public final Channel roll = new Channel();
	public final Channel speed = new Channel();
	public final Channel steer = new Channel();
	public final Channel prep = new Channel();
	public final Channel chargeBlend = new Channel();
	/** 0..1 phase of the current push/kick/stride stroke. */
	public final Channel stroke = new Channel();
	public float pedalAngle;
	public float pedalAnglePrev;
	public float wheelAngle;
	public float wheelAnglePrev;
	public int strideSide;

	public static RideAnimState of(SportEquipmentEntity entity) {
		if (entity.clientAnim instanceof RideAnimState state) {
			return state;
		}
		RideAnimState state = new RideAnimState();
		entity.clientAnim = state;
		return state;
	}

	public void tick(SportEquipmentEntity entity) {
		age++;
		trickProgressPrev = trickProgress;
		pedalAnglePrev = pedalAngle;
		wheelAnglePrev = wheelAngle;
		Minecraft mc = Minecraft.getInstance();
		local = entity.getControllingPassenger() == mc.player && mc.player != null;
		RideController ride = entity.ride;

		float crouchTarget;
		float leanTarget;
		float balanceTarget;
		float strokePhase;
		if (local) {
			flags = ClientAnimSync.packFlags(entity);
			contact = ride.contact;
			crouchTarget = ride.crouch;
			leanTarget = ride.lean;
			balanceTarget = ride.grind != null ? ride.grind.balance : ride.manual != null ? ride.manualBalance : 0.0F;
			strokePhase = ride.strokeTick > 0 ? (float) ride.strokeTick / entity.kind().handling().strokeTicks() : 0.0F;
			if (ride.activeTrick != null) {
				if (trick != ride.activeTrick.def || ride.activeTrick.progress < trickProgress - 0.5F) {
					trickProgressPrev = 0.0F;
				}
				trick = ride.activeTrick.def;
				trickMultiple = ride.activeTrick.multiple;
				trickProgress = ride.activeTrick.progress;
			} else if (trick != null) {
				trickProgress = Math.min(trickProgress + 0.25F, trickMultiple);
				if (contact != RideController.Contact.AIR) {
					trick = null;
				}
			}
			grab = ride.grab;
			grindOrManual = ride.grind != null ? ride.grind.def : ride.manual;
			if (ride.lastLandTick == entity.tickCount) {
				landingTick = age;
				landingQuality = ride.lastQuality;
			}
			pedalAngle = ride.pedalAngle;
			wheelAngle = ride.wheelAngle;
			strideSide = ride.strideSide;
			airTicks = ride.airTicks;
		} else {
			int oldFlags = flags;
			flags = entity.animFlags();
			if ((flags & SportEquipmentEntity.FLAG_AIRBORNE) != 0 && (oldFlags & SportEquipmentEntity.FLAG_AIRBORNE) == 0
				&& (oldFlags & SportEquipmentEntity.FLAG_CHARGING) != 0) {
				RideFx.pop(entity);
			}
			if ((flags & SportEquipmentEntity.FLAG_PUSHING) != 0 && (oldFlags & SportEquipmentEntity.FLAG_PUSHING) == 0) {
				RideFx.push(entity);
			}
			int pack = entity.animPack();
			leanTarget = (byte) (pack & 0xFF) / 127.0F;
			balanceTarget = (byte) ((pack >> 8) & 0xFF) / 127.0F;
			crouchTarget = ((pack >> 16) & 0xFF) / 255.0F;
			strokePhase = ((pack >> 24) & 0xFF) / 255.0F;
			boolean airborne = (flags & SportEquipmentEntity.FLAG_AIRBORNE) != 0;
			boolean grinding = (flags & SportEquipmentEntity.FLAG_GRINDING) != 0;
			contact = grinding ? RideController.Contact.GRIND : airborne ? RideController.Contact.AIR : RideController.Contact.GROUND;
			airTicks = airborne ? airTicks + 1 : 0;
			int trickData = entity.trickData();
			int seq = trickData >>> 16;
			TrickDef def = Tricks.byIndex((trickData & 0xFFFF) - 1);
			int held = entity.heldData();
			trickMultiple = Math.max(1, held >>> 24);
			if (seq != trickSeq) {
				if (trickSeq != -1 && def != null && def.isAirTrick() && (def != trick || trickProgress >= trickMultiple)) {
					trick = def;
					trickProgress = 0.0F;
					trickProgressPrev = 0.0F;
					RideFx.trick(entity, def);
				}
				trickSeq = seq;
			}
			if (trick != null) {
				float speedMul = entity.stats().trickMultiplier() / Math.max(1, trick.duration());
				trickProgress = Math.min(trickMultiple, trickProgress + speedMul);
				if (!airborne && trickProgress >= trickMultiple) {
					trick = null;
				}
			}
			grab = Tricks.byIndex((held & 0xFFF) - 1);
			grindOrManual = Tricks.byIndex(((held >> 12) & 0xFFF) - 1);
			int landingData = entity.landingData();
			int landSeq = landingData >>> 4;
			if (landSeq != landingSeq) {
				if (landingSeq != -1) {
					landingTick = age;
					landingQuality = LandingQuality.byOrdinal(landingData & 0xF);
					RideFx.land(entity, 0.3F, landingQuality);
				}
				landingSeq = landSeq;
			}
			wheelAngle = entity.clientWheelAngle;
			strideSide = (flags & SportEquipmentEntity.FLAG_STRIDE_SIDE) != 0 ? 1 : 0;
			if ((flags & SportEquipmentEntity.FLAG_PEDALING) != 0) {
				pedalAngle += 0.25F + entity.observedSpeed * 2.2F;
			}
		}

		boolean ridden = entity.getControllingPassenger() != null;
		boolean air = contact == RideController.Contact.AIR;
		crouch.spring(crouchTarget, 0.55F);
		lean.spring(leanTarget, 0.35F);
		balance.spring(balanceTarget, 0.5F);
		grabBlend.spring(grab != null ? 1.0F : 0.0F, 0.6F);
		grindBlend.spring(contact == RideController.Contact.GRIND ? 1.0F : 0.0F, 0.6F);
		manualBlend.spring((flags & SportEquipmentEntity.FLAG_MANUAL) != 0 ? 1.0F : 0.0F, 0.45F);
		airBlend.spring(air ? 1.0F : 0.0F, 0.4F);
		brakeBlend.spring((flags & SportEquipmentEntity.FLAG_BRAKING) != 0 ? 1.0F : 0.0F, 0.4F);
		boolean powerslide = (flags & SportEquipmentEntity.FLAG_POWERSLIDE) != 0;
		slideAngle.spring(powerslide ? (leanTarget > 0 ? -80.0F : 80.0F) : 0.0F, 0.35F);
		mountBlend.spring(ridden ? 1.0F : 0.0F, 0.32F);
		chargeBlend.spring((flags & SportEquipmentEntity.FLAG_CHARGING) != 0 ? 1.0F : 0.0F, 0.6F);
		float sinceLanding = age - landingTick;
		landing.spring(sinceLanding < 3 ? 1.0F : 0.0F, 0.5F);
		prep.spring(air && (flags & SportEquipmentEntity.FLAG_CROUCH) != 0 ? 1.0F : 0.0F, 0.5F);
		if (local) {
			pitch.spring(ride.surfacePitch, 0.7F);
			roll.spring(ride.surfaceRoll, 0.7F);
			speed.spring(ride.speed, 0.5F);
			steer.spring(ride.steerAmount(), 0.5F);
		} else {
			pitch.spring(entity.getXRot(), 0.5F);
			roll.spring(0.0F, 0.5F);
			speed.spring(entity.observedSpeed, 0.3F);
			steer.spring(leanTarget, 0.4F);
		}
		if (strokePhase > 0.0F && stroke.value > strokePhase + 0.5F) {
			stroke.set(strokePhase);
		} else {
			stroke.spring(strokePhase, 0.8F);
		}
	}

	/** Trick progress 0..1 for the current repetition window, interpolated. */
	public float trickProgress(float partialTick) {
		return Mth.lerp(partialTick, trickProgressPrev, trickProgress);
	}
}
