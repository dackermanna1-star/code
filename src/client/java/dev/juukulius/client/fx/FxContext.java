package dev.juukulius.client.fx;

import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.juukulius.client.render.JuliusRenderTypes;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/** Everything an effect needs to draw itself for one frame (camera-relative world space). */
public final class FxContext {
	public final MultiBufferSource buffers;
	public final Matrix4f matrix;
	public final Vec3 camera;
	public final Quaternionf cameraRotation;
	public final float partialTick;
	public final float time;
	public final boolean firstPersonLocal;

	public FxContext(MultiBufferSource buffers, Matrix4f matrix, Vec3 camera, Quaternionf cameraRotation, float partialTick, float time,
		boolean firstPersonLocal) {
		this.buffers = buffers;
		this.matrix = matrix;
		this.camera = camera;
		this.cameraRotation = cameraRotation;
		this.partialTick = partialTick;
		this.time = time;
		this.firstPersonLocal = firstPersonLocal;
	}

	public VertexConsumer glow(Identifier texture) {
		return this.buffers.getBuffer(JuliusRenderTypes.glow(texture));
	}

	public VertexConsumer veil(Identifier texture) {
		return this.buffers.getBuffer(JuliusRenderTypes.veil(texture));
	}

	/** World position → camera-relative vector. */
	public Vector3f rel(Vec3 world) {
		return new Vector3f((float) (world.x - this.camera.x), (float) (world.y - this.camera.y), (float) (world.z - this.camera.z));
	}

	public Vector3f rel(double x, double y, double z) {
		return new Vector3f((float) (x - this.camera.x), (float) (y - this.camera.y), (float) (z - this.camera.z));
	}
}
