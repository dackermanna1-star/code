package com.extremesports.physics;

/**
 * One tick of rider input. Edge detection (pressed this tick) is handled by {@link RideController}.
 *
 * @param lookYaw   the rider's camera yaw, used when steering with the mouse
 * @param mouseSteer whether the board steers toward the camera direction instead of using left/right keys
 */
public record RideInput(
	boolean forward,
	boolean back,
	boolean left,
	boolean right,
	boolean jump,
	boolean flip,
	boolean grab,
	boolean grind,
	boolean whip,
	float lookYaw,
	boolean mouseSteer
) {
	public static final RideInput NONE = new RideInput(false, false, false, false, false, false, false, false, false, 0.0F, false);

	public RideInput withLookYaw(float yaw) {
		return new RideInput(forward, back, left, right, jump, flip, grab, grind, whip, yaw, mouseSteer);
	}
}
