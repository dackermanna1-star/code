package dev.visceral.client.anim;

import dev.visceral.mixin.client.ModelPartAccessor;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/**
 * Rest geometry of a humanoid model instance: part references, rest pivots/rotations and the
 * bounds of each part's own cubes (pixels, part-local). Read from the live model so variants
 * (slim arms, skeleton limbs, piglin heads, baby proportions, modded humanoids) just work.
 */
public final class Rig {
	private static final Map<HumanoidModel<?>, Rig> CACHE = new WeakHashMap<>();

	public final ModelPart[] parts = new ModelPart[Bone.COUNT];
	public final Vector3f[] restPivot = new Vector3f[Bone.COUNT];
	public final Quaternionf[] restRot = new Quaternionf[Bone.COUNT];
	public final Vector3f[] cubeMin = new Vector3f[Bone.COUNT];
	public final Vector3f[] cubeMax = new Vector3f[Bone.COUNT];
	/** Waist height below the body pivot (pixels): bottom of the torso cube. */
	public final float waistY;
	public final float legLength;
	public final float armLength;

	private Rig(HumanoidModel<?> model) {
		ModelPart[] p = {model.head, model.body, model.rightArm, model.leftArm, model.rightLeg, model.leftLeg};
		for (int i = 0; i < Bone.COUNT; i++) {
			parts[i] = p[i];
			PartPose rest = p[i].getInitialPose();
			restPivot[i] = new Vector3f(rest.x(), rest.y(), rest.z());
			restRot[i] = new Quaternionf().rotationZYX(rest.zRot(), rest.yRot(), rest.xRot());
			Vector3f min = new Vector3f(Float.MAX_VALUE), max = new Vector3f(-Float.MAX_VALUE);
			for (ModelPart.Cube c : ((ModelPartAccessor) (Object) p[i]).visceral$cubes()) {
				min.min(new Vector3f(c.minX, c.minY, c.minZ));
				max.max(new Vector3f(c.maxX, c.maxY, c.maxZ));
			}
			if (min.x > max.x) {
				// Part without own cubes (e.g. stripped armour model): fall back to vanilla dimensions.
				Vector3f[] fallback = fallbackBounds(Bone.ALL[i]);
				min.set(fallback[0]);
				max.set(fallback[1]);
			}
			cubeMin[i] = min;
			cubeMax[i] = max;
		}
		waistY = cubeMax[Bone.BODY.ordinal()].y;
		legLength = cubeMax[Bone.RIGHT_LEG.ordinal()].y - Math.min(0, cubeMin[Bone.RIGHT_LEG.ordinal()].y);
		armLength = cubeMax[Bone.RIGHT_ARM.ordinal()].y - cubeMin[Bone.RIGHT_ARM.ordinal()].y;
	}

	private static Vector3f[] fallbackBounds(Bone bone) {
		return switch (bone) {
			case HEAD -> new Vector3f[] {new Vector3f(-4, -8, -4), new Vector3f(4, 0, 4)};
			case BODY -> new Vector3f[] {new Vector3f(-4, 0, -2), new Vector3f(4, 12, 2)};
			case RIGHT_ARM -> new Vector3f[] {new Vector3f(-3, -2, -2), new Vector3f(1, 10, 2)};
			case LEFT_ARM -> new Vector3f[] {new Vector3f(-1, -2, -2), new Vector3f(3, 10, 2)};
			default -> new Vector3f[] {new Vector3f(-2, 0, -2), new Vector3f(2, 12, 2)};
		};
	}

	public static Rig of(HumanoidModel<?> model) {
		return CACHE.computeIfAbsent(model, Rig::new);
	}

	public static @Nullable Rig peek(HumanoidModel<?> model) {
		return CACHE.get(model);
	}

	public Vector3f cubeCenter(int bone, Vector3f out) {
		return out.set(cubeMin[bone]).add(cubeMax[bone]).mul(0.5f);
	}

	public Vector3f cubeHalf(int bone, Vector3f out) {
		return out.set(cubeMax[bone]).sub(cubeMin[bone]).mul(0.5f);
	}
}
