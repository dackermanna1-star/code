package com.extremesports.sport;

/**
 * Base handling numbers for one piece of equipment, in blocks and ticks (1 block = 1 m, 20 ticks = 1 s).
 * Part choices and the physics preset scale these at runtime through {@link EquipmentStats}.
 *
 * @param drive              how the rider generates speed
 * @param driveImpulse       speed added per push/kick/stride (impulse drives) or per tick (pedalling)
 * @param driveMaxSpeed      speed above which pushing no longer helps
 * @param strokeTicks        length of a push/kick/stride cycle
 * @param topSpeed           absolute speed cap
 * @param rollingResistance  constant deceleration on smooth ground
 * @param aeroDrag           deceleration factor multiplied by speed squared
 * @param turnRateSlow       steering rate in degrees/tick at walking pace
 * @param turnRateFast       steering rate in degrees/tick at speed
 * @param grip               fraction of sideways slip removed each tick (1 = rails, 0 = ice)
 * @param popVelocity        upward velocity of an ollie / bunny hop
 * @param spinRate           maximum air spin speed in degrees/tick
 * @param brakeDecel         deceleration while braking
 * @param roughHandling      multiplier applied to rough-surface rolling resistance (lower = better off-road)
 * @param wheelRadius        wheel radius in blocks, used to spin wheels at the right speed
 * @param canRideBackward    whether the drive key can be used while rolling backwards (skates)
 */
public record HandlingProfile(
	DriveType drive,
	float driveImpulse,
	float driveMaxSpeed,
	int strokeTicks,
	float topSpeed,
	float rollingResistance,
	float aeroDrag,
	float turnRateSlow,
	float turnRateFast,
	float grip,
	float popVelocity,
	float spinRate,
	float brakeDecel,
	float roughHandling,
	float wheelRadius,
	boolean canRideBackward
) {
	public enum DriveType {
		PUSH,
		PEDAL,
		KICK,
		STRIDE
	}
}
