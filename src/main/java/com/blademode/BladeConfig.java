package com.blademode;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.loader.api.FabricLoader;

/** Settings, stored in {@code config/blademode.json}. */
public final class BladeConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static BladeConfig instance = new BladeConfig();

	// --- Cutting -----------------------------------------------------------------------------
	/** How far the blade reaches along the drawn line, in blocks. */
	public double reach = 32.0;
	/** Maximum number of blocks a single slash may slice through. */
	public int maxSlicedBlocks = 6000;
	/** A connected structure bigger than this is treated as anchored to the ground (and cannot fall). */
	public int maxFallingBlocks = 6000;
	/** Ticks between slashes. */
	public int cooldownTicks = 6;
	/** Break plants, torches and other non-solid blocks the blade passes through. */
	public boolean cutPlants = true;
	/** Damage dealt to entities caught in a slash. */
	public float entityDamage = 24.0F;
	/** Push given to freshly cut pieces in the direction the blade travelled (blocks/second). */
	public double slashPush = 1.2;
	/** Slow the world down while a player is drawing a cut (single player / LAN with one player). */
	public boolean slowMotion = true;
	/** Tick rate used while slow motion is active (vanilla is 20). */
	public float slowMotionTickRate = 6.0F;

	// --- Physics -----------------------------------------------------------------------------
	public double gravity = 16.0;
	public double friction = 0.55;
	/** Friction on freshly cut faces: a high-frequency blade leaves them smooth, so parts slide off. */
	public double cutFriction = 0.25;
	public double restitution = 0.12;
	/** Falling pieces hurt entities they hit. */
	public boolean pieceDamage = true;
	/** Turn pieces that come to rest close to grid alignment back into normal blocks. */
	public boolean solidify = true;
	/** Maximum tilt (degrees) from a grid-aligned orientation for a resting piece to solidify. */
	public double solidifyMaxAngle = 12.0;
	/** Ticks a piece must rest before it solidifies. */
	public int solidifyDelayTicks = 60;

	public static BladeConfig get() {
		return instance;
	}

	public static void load() {
		Path path = FabricLoader.getInstance().getConfigDir().resolve("blademode.json");
		BladeConfig cfg = new BladeConfig();
		if (Files.exists(path)) {
			try (Reader reader = Files.newBufferedReader(path)) {
				BladeConfig read = GSON.fromJson(reader, BladeConfig.class);
				if (read != null) {
					cfg = read;
				}
			} catch (IOException | RuntimeException e) {
				BladeMode.LOGGER.warn("Could not read {}, using defaults", path, e);
			}
		}
		cfg.sanitize();
		instance = cfg;
		try (Writer writer = Files.newBufferedWriter(path)) {
			GSON.toJson(cfg, writer);
		} catch (IOException e) {
			BladeMode.LOGGER.warn("Could not write {}", path, e);
		}
	}

	private void sanitize() {
		this.reach = clamp(this.reach, 2, 128);
		this.maxSlicedBlocks = (int) clamp(this.maxSlicedBlocks, 1, 100000);
		this.maxFallingBlocks = (int) clamp(this.maxFallingBlocks, 1, 100000);
		this.cooldownTicks = (int) clamp(this.cooldownTicks, 0, 200);
		this.slowMotionTickRate = (float) clamp(this.slowMotionTickRate, 1, 20);
		this.gravity = clamp(this.gravity, 0, 100);
		this.friction = clamp(this.friction, 0, 2);
		this.cutFriction = clamp(this.cutFriction, 0, 2);
		this.restitution = clamp(this.restitution, 0, 1);
		this.solidifyMaxAngle = clamp(this.solidifyMaxAngle, 0, 45);
		this.solidifyDelayTicks = (int) clamp(this.solidifyDelayTicks, 1, 20 * 60 * 60);
	}

	private static double clamp(double v, double lo, double hi) {
		return Double.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
	}
}
