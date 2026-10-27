package dev.visceral.client.config;

import dev.visceral.config.ConfigIO;

/** Client-only visual and input settings. Stored in {@code config/visceral-client.json}. */
public final class ClientConfig {
	public static final String FILE = "visceral-client.json";
	private static ClientConfig instance = new ClientConfig();

	public static ClientConfig get() {
		return instance;
	}

	public static void load() {
		instance = ConfigIO.load(FILE, ClientConfig.class, ClientConfig::new);
		instance.clamp();
	}

	public static void save() {
		instance.clamp();
		ConfigIO.save(FILE, instance);
	}

	// --- Camera --------------------------------------------------------------------------------
	/** Replaces the vanilla third-person-back camera with a smoothed over-the-shoulder camera. */
	public boolean shoulderCamera = true;
	/** Camera orbits freely; the character turns to face its movement direction (GTA style). */
	public boolean decoupledCamera = true;
	public float cameraDistance = 2.8f;
	public float shoulderOffset = 0.7f;
	public float cameraHeight = 0.15f;
	/** 0 = rigid, 1 = very floaty. Positional lag of the camera pivot. */
	public float cameraSmoothing = 0.45f;
	public float cameraSensitivity = 1.0f;
	/** Extra distance while sprinting (blocks). */
	public float sprintPullback = 0.4f;
	/** 0..1 scale of impact/landing camera shake. Keep low if prone to motion sickness. */
	public float cameraShake = 0.35f;
	/** Converge the character's aim onto whatever is under the crosshair (bows, block placement). */
	public boolean aimConvergence = true;
	public boolean autoShoulderSwap = true;
	public float lockOnRange = 18f;

	// --- Controls & movement -------------------------------------------------------------------
	/** Apply the GTA control preset (Shift sprint, Ctrl crouch, E lock-on, Q kick) on first launch. */
	public boolean applyControlPreset = true;
	public boolean controlPresetApplied = false;
	/** 0 = vanilla instant movement, 1 = heavy momentum. */
	public float movementInertia = 0.55f;
	/** Character turn speed when the camera is decoupled (degrees/second at jog speed). */
	public float turnSpeed = 600f;

	// --- Animation -----------------------------------------------------------------------------
	public boolean animationOverhaul = true;
	public boolean animatePlayers = true;
	public boolean animateMobs = true;
	/** Global scale for procedural motion (leans, sway, flinches). */
	public float animationIntensity = 1.0f;
	public boolean hitReactions = true;
	public boolean hitStop = true;
	public boolean footPlacement = true;
	/** Beyond this distance entities fall back to vanilla animation (performance). */
	public float animationDistance = 64f;

	// --- Physics & ragdolls --------------------------------------------------------------------
	public boolean ragdolls = true;
	public boolean deathRagdolls = true;
	/** Euphoria-style protective reflexes, struggling and bracing on top of the ragdoll. */
	public boolean activeRagdollBehaviours = true;
	public float muscleStrength = 1.0f;
	public int maxActiveRagdolls = 24;
	public int ragdollSubsteps = 8;
	public float ragdollGravity = 24f;
	public float ragdollDistance = 64f;
	public float corpseSeconds = 25f;
	public int maxCorpses = 24;

	// --- Wounds, blood & gore ------------------------------------------------------------------
	public boolean blood = true;
	public float bloodAmount = 1.0f;
	public boolean bloodDecals = true;
	public int maxDecals = 300;
	public float decalSeconds = 120f;
	public boolean woundOverlays = true;
	/** 0 = no gore (still wounds/blood if enabled), 1 = wounds and blood, 2 = dismemberment. Capped by the server. */
	public int goreLevel = 1;

	private void clamp() {
		cameraDistance = clamp(cameraDistance, 1.2f, 8f);
		shoulderOffset = clamp(shoulderOffset, 0f, 1.5f);
		cameraHeight = clamp(cameraHeight, -0.5f, 1f);
		cameraSmoothing = clamp(cameraSmoothing, 0f, 1f);
		cameraSensitivity = clamp(cameraSensitivity, 0.1f, 3f);
		sprintPullback = clamp(sprintPullback, 0f, 2f);
		cameraShake = clamp(cameraShake, 0f, 1f);
		movementInertia = clamp(movementInertia, 0f, 1f);
		turnSpeed = clamp(turnSpeed, 90f, 2000f);
		animationIntensity = clamp(animationIntensity, 0f, 2f);
		muscleStrength = clamp(muscleStrength, 0f, 2f);
		maxActiveRagdolls = Math.max(0, Math.min(128, maxActiveRagdolls));
		ragdollSubsteps = Math.max(2, Math.min(24, ragdollSubsteps));
		ragdollGravity = clamp(ragdollGravity, 5f, 40f);
		corpseSeconds = clamp(corpseSeconds, 0f, 600f);
		maxCorpses = Math.max(0, Math.min(200, maxCorpses));
		bloodAmount = clamp(bloodAmount, 0f, 3f);
		maxDecals = Math.max(0, Math.min(2000, maxDecals));
		decalSeconds = clamp(decalSeconds, 5f, 1800f);
		goreLevel = Math.max(0, Math.min(2, goreLevel));
		lockOnRange = clamp(lockOnRange, 6f, 40f);
	}

	private static float clamp(float v, float lo, float hi) {
		return Math.max(lo, Math.min(hi, v));
	}
}
