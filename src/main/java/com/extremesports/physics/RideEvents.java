package com.extremesports.physics;

import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.LandingQuality;
import com.extremesports.trick.TrickDef;
import java.util.List;

/**
 * Callbacks from the ride simulation. The client implementation drives sounds, particles, HUD and networking;
 * tests record them. All methods run on the simulating side only.
 */
public interface RideEvents {
	RideEvents NONE = new RideEvents() {
	};

	default void onPop(RideController ride, boolean nollie) {
	}

	default void onPush(RideController ride) {
	}

	default void onTrickStart(RideController ride, TrickDef trick, int multiple) {
	}

	default void onGrabStart(RideController ride, TrickDef grab) {
	}

	default void onLand(RideController ride, LandingQuality quality, float impact, ComboEntry entry, boolean scored) {
	}

	default void onBail(RideController ride, BailReason reason) {
	}

	default void onGrindStart(RideController ride, TrickDef grind, GrindSegment segment) {
	}

	default void onGrindEnd(RideController ride, ComboEntry entry) {
	}

	default void onManualStart(RideController ride, TrickDef manual) {
	}

	default void onManualEnd(RideController ride, ComboEntry entry) {
	}

	default void onComboUpdate(RideController ride, List<ComboEntry> entries) {
	}

	default void onComboEnd(RideController ride, List<ComboEntry> entries, boolean landed) {
	}

	default void onWallBonk(RideController ride, float impact) {
	}

	default void onBrake(RideController ride, boolean powerslide) {
	}
}
