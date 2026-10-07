package dev.visceral.client.wound;

import dev.visceral.client.model.ModelTree;
import java.util.List;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Where a wound ended up on a specific model: the part it sticks to and pre-built decal polygons
 * in that part's local space, so it follows every animation (and the ragdoll) for free.
 */
public final class WoundPlacement {
	public final ModelTree tree;
	public final int nodeIndex;
	public final int cell;
	public final List<float[]> polygons;
	/** Blood running down from the wound, empty for wounds that don't bleed. */
	public final List<float[]> tricklePolygons;
	/** Centre of the wound in part space, pixels. */
	public final Vector3f localCenter;
	/** Outward normal of the hit face in part space. */
	public final Vector3f localNormal;

	/** World position of the wound the last time it was rendered, used to drip blood from the right spot. */
	public Vec3 lastWorldPos;
	public Vec3 lastWorldNormal;
	public long lastSeenTick = Long.MIN_VALUE;

	public WoundPlacement(ModelTree tree, int nodeIndex, int cell, List<float[]> polygons, List<float[]> tricklePolygons, Vector3f localCenter, Vector3f localNormal) {
		this.tree = tree;
		this.nodeIndex = nodeIndex;
		this.cell = cell;
		this.polygons = polygons;
		this.tricklePolygons = tricklePolygons;
		this.localCenter = localCenter;
		this.localNormal = localNormal;
	}
}
