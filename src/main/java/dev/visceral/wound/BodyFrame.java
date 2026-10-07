package dev.visceral.wound;

import net.minecraft.util.Mth;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3f;

/**
 * Conversion between world-relative vectors and the body frame of a living entity.
 *
 * <p>Body frame: origin at the entity position, +Y up and the body facing +Z. A body yaw of
 * {@code yaw} degrees rotates the frame by {@code -yaw} around +Y, exactly matching how
 * {@code LivingEntityRenderer} rotates models by {@code 180 - bodyRot}.
 */
public final class BodyFrame {
	private BodyFrame() {
	}

	public static Vector3f toBody(double wx, double wy, double wz, float bodyYawDegrees) {
		float rad = bodyYawDegrees * Mth.DEG_TO_RAD;
		float cos = Mth.cos(rad);
		float sin = Mth.sin(rad);
		return new Vector3f((float) (wx * cos + wz * sin), (float) wy, (float) (-wx * sin + wz * cos));
	}

	public static Vector3f toBody(Vec3 worldRelative, float bodyYawDegrees) {
		return toBody(worldRelative.x, worldRelative.y, worldRelative.z, bodyYawDegrees);
	}

	public static Vec3 fromBody(float bx, float by, float bz, float bodyYawDegrees) {
		float rad = bodyYawDegrees * Mth.DEG_TO_RAD;
		float cos = Mth.cos(rad);
		float sin = Mth.sin(rad);
		return new Vec3(bx * cos - bz * sin, by, bx * sin + bz * cos);
	}
}
