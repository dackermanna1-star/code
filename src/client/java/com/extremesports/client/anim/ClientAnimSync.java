package com.extremesports.client.anim;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.Payloads;
import com.extremesports.physics.RideController;
import com.extremesports.trick.Tricks;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.util.Mth;

/**
 * Packs the local rider's simulation state into compact values and sends them to the server when they change,
 * so other players can animate the same tricks.
 */
public final class ClientAnimSync {
	private static int lastFlags = Integer.MIN_VALUE;
	private static int lastPack = Integer.MIN_VALUE;
	private static int lastTrick = Integer.MIN_VALUE;
	private static int lastHeld = Integer.MIN_VALUE;
	private static int lastLanding = Integer.MIN_VALUE;
	private static int lastEntity = -1;
	private static int landingSeq;
	private static int lastLandTickSeen = -1;
	private static int ticksSinceSend;

	private ClientAnimSync() {
	}

	public static int packFlags(SportEquipmentEntity entity) {
		RideController ride = entity.ride;
		int flags = 0;
		if (ride.crouch > 0.6F) {
			flags |= SportEquipmentEntity.FLAG_CROUCH;
		}
		if (ride.strokeTick > 0) {
			flags |= SportEquipmentEntity.FLAG_PUSHING;
		}
		if (ride.braking) {
			flags |= SportEquipmentEntity.FLAG_BRAKING;
		}
		if (ride.powerslide) {
			flags |= SportEquipmentEntity.FLAG_POWERSLIDE;
		}
		if (ride.contact == RideController.Contact.GRIND) {
			flags |= SportEquipmentEntity.FLAG_GRINDING;
		}
		if (ride.manual != null) {
			flags |= SportEquipmentEntity.FLAG_MANUAL;
		}
		if (ride.contact == RideController.Contact.AIR) {
			flags |= SportEquipmentEntity.FLAG_AIRBORNE;
		}
		if (ride.fakie) {
			flags |= SportEquipmentEntity.FLAG_FAKIE;
		}
		if (ride.pedaling) {
			flags |= SportEquipmentEntity.FLAG_PEDALING;
		}
		if (ride.backward) {
			flags |= SportEquipmentEntity.FLAG_BACKWARD;
		}
		if (ride.strideSide != 0) {
			flags |= SportEquipmentEntity.FLAG_STRIDE_SIDE;
		}
		if (ride.charging) {
			flags |= SportEquipmentEntity.FLAG_CHARGING;
		}
		return flags;
	}

	/** Called after each local simulation tick. */
	public static void afterTick(SportEquipmentEntity entity) {
		RideController ride = entity.ride;
		if (entity.getId() != lastEntity) {
			lastEntity = entity.getId();
			lastFlags = Integer.MIN_VALUE;
		}
		int flags = packFlags(entity);
		float balance = ride.grind != null ? ride.grind.balance : ride.manual != null ? ride.manualBalance : 0.0F;
		float stroke = ride.strokeTick > 0 ? (float) ride.strokeTick / entity.kind().handling().strokeTicks() : 0.0F;
		int pack = ((byte) Mth.clamp(Math.round(ride.lean * 127.0F), -127, 127) & 0xFF)
			| (((byte) Mth.clamp(Math.round(balance * 127.0F), -127, 127) & 0xFF) << 8)
			| ((Mth.clamp(Math.round(ride.crouch * 255.0F), 0, 255) & 0xFF) << 16)
			| ((Mth.clamp(Math.round(stroke * 255.0F), 0, 255) & 0xFF) << 24);
		int trickIndex = ride.activeTrick != null ? Tricks.indexOf(ride.activeTrick.def) : -1;
		int trick = ((trickIndex + 1) & 0xFFFF) | ((ride.trickSequence & 0xFFFF) << 16);
		int grabIndex = ride.grab != null ? Tricks.indexOf(ride.grab) : -1;
		int holdIndex = ride.grind != null ? Tricks.indexOf(ride.grind.def) : ride.manual != null ? Tricks.indexOf(ride.manual) : -1;
		int multiple = ride.activeTrick != null ? ride.activeTrick.multiple : 1;
		int held = ((grabIndex + 1) & 0xFFF) | (((holdIndex + 1) & 0xFFF) << 12) | (multiple << 24);
		if (ride.lastLandTick != lastLandTickSeen && ride.lastLandTick == entity.tickCount) {
			lastLandTickSeen = ride.lastLandTick;
			landingSeq++;
		}
		int landing = (landingSeq << 4) | (ride.lastQuality.ordinal() & 0xF);

		ticksSinceSend++;
		boolean changed = flags != lastFlags || trick != lastTrick || held != lastHeld || landing != lastLanding;
		boolean packChanged = pack != lastPack;
		if (changed || packChanged && ticksSinceSend >= 2 || packChanged && ticksSinceSend >= 1 && Math.abs((byte) pack - (byte) lastPack) > 20) {
			ClientPlayNetworking.send(new Payloads.RiderState(entity.getId(), flags, pack, trick, held, landing));
			lastFlags = flags;
			lastPack = pack;
			lastTrick = trick;
			lastHeld = held;
			lastLanding = landing;
			ticksSinceSend = 0;
		}
	}
}
