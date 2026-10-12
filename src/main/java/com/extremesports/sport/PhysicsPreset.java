package com.extremesports.sport;

/**
 * Global feel presets. Arcade is forgiving, Balanced mixes realism and fun, Realistic demands clean technique.
 */
public enum PhysicsPreset {
	//          gravity pop   landTol balance spin  wallBail step  autoGrind vert  prep   speed snap  score  bigDrop
	ARCADE("arcade", 0.040F, 1.10F, 1.60F, 0.45F, 1.20F, 0.62F, 0.60F, true, 1.00F, false, 1.08F, 0.60F, 1.00F, 99.0F),
	BALANCED("balanced", 0.046F, 1.00F, 1.00F, 1.00F, 1.00F, 0.44F, 0.55F, false, 0.92F, true, 1.00F, 0.46F, 1.10F, 1.25F),
	REALISTIC("realistic", 0.054F, 0.95F, 0.70F, 1.50F, 0.85F, 0.32F, 0.30F, false, 0.75F, true, 0.95F, 0.36F, 1.25F, 1.05F);

	private final String id;
	/** Gravity in blocks/tick^2. */
	public final float gravity;
	/** Multiplier for ollie / hop strength. */
	public final float popMultiplier;
	/** Multiplier for landing alignment tolerance. */
	public final float landingTolerance;
	/** Multiplier for grind/manual balance drift. */
	public final float balanceDifficulty;
	/** Multiplier for air spin speed. */
	public final float spinMultiplier;
	/** Head-on wall impact speed that causes a bail. */
	public final float wallBailSpeed;
	/** Maximum step-up height for curbs and slabs without an ollie. */
	public final float stepHeight;
	/** Whether rails grab you automatically when you land on them. */
	public final boolean autoGrind;
	/** How much forward speed is removed when launching off a vertical ramp lip (1 = always land back in). */
	public final float vertAssist;
	/** Whether a Perfect landing needs the landing-prep tap. */
	public final boolean perfectNeedsPrep;
	/** Multiplier for drive top speed. */
	public final float speedMultiplier;
	/** Rail snap radius in blocks. */
	public final float grindSnapRadius;
	/** Score multiplier rewarding harder presets. */
	public final float scoreMultiplier;
	/** Impact speed (blocks/tick into the ground) above which a landing bails. */
	public final float bigDropBailImpact;

	PhysicsPreset(String id, float gravity, float popMultiplier, float landingTolerance, float balanceDifficulty, float spinMultiplier,
				  float wallBailSpeed, float stepHeight, boolean autoGrind, float vertAssist, boolean perfectNeedsPrep,
				  float speedMultiplier, float grindSnapRadius, float scoreMultiplier, float bigDropBailImpact) {
		this.id = id;
		this.gravity = gravity;
		this.popMultiplier = popMultiplier;
		this.landingTolerance = landingTolerance;
		this.balanceDifficulty = balanceDifficulty;
		this.spinMultiplier = spinMultiplier;
		this.wallBailSpeed = wallBailSpeed;
		this.stepHeight = stepHeight;
		this.autoGrind = autoGrind;
		this.vertAssist = vertAssist;
		this.perfectNeedsPrep = perfectNeedsPrep;
		this.speedMultiplier = speedMultiplier;
		this.grindSnapRadius = grindSnapRadius;
		this.scoreMultiplier = scoreMultiplier;
		this.bigDropBailImpact = bigDropBailImpact;
	}

	public String id() {
		return id;
	}

	public String translationKey() {
		return "preset.extremesports." + id;
	}

	public PhysicsPreset next() {
		return values()[(ordinal() + 1) % values().length];
	}

	public static PhysicsPreset byId(String id) {
		for (PhysicsPreset preset : values()) {
			if (preset.id.equals(id)) {
				return preset;
			}
		}
		return BALANCED;
	}
}
