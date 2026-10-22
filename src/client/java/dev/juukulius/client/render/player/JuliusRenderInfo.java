package dev.juukulius.client.render.player;

import dev.juukulius.client.anim.PoseSnapshot;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;

/**
 * Per-frame Julius rendering data attached to a player's render state (outfit visibility, physics angles, aura).
 * Filled during render-state extraction so deferred rendering always sees this frame's values.
 */
public final class JuliusRenderInfo {
	public static final RenderStateDataKey<PoseSnapshot> POSE = RenderStateDataKey.create(() -> "julius_juukulius:pose");
	public static final RenderStateDataKey<JuliusRenderInfo> INFO = RenderStateDataKey.create(() -> "julius_juukulius:info");

	/** 0 → 1 while the outfit materializes, 1 → 0 while it dissolves. */
	public float outfit;
	/** Whether the body uses Julius's skin this frame (swapped at the midpoint of the transition flash). */
	public boolean juliusSkin;
	/** Rainbow aura strength (Al Cranvel and the transformation flash). */
	public float aura;
	/** Al Clarista light on the blade (0 = none). */
	public float clad;
	public boolean holdingSword;
	/** Owns the sword but is not holding it: the hilt shows in the scabbard. */
	public boolean swordSheathed;
	public float coatPitch;
	public float coatRoll;
	public float hairPitch;
	public float hairRoll;
	public float time;

	public boolean visible() {
		return this.outfit > 0.001F || this.aura > 0.001F;
	}
}
