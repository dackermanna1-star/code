package com.blademode.client.gore;

import com.blademode.BladeMode;
import com.blademode.gore.Body;
import com.blademode.gore.Piece;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldExtractionContext;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3f;
import org.joml.Matrix4d;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/** Draws the corpses: every piece with the creature's own textures, and raw flesh where it was cut. */
public final class CorpseRenderer {
	private static final RenderType FLESH = RenderTypes.entityCutoutNoCull(BladeMode.id("textures/entity/flesh.png"));
	/** Inside of creatures that are not meat: bone, metal, wood, snow. */
	private static final RenderType SOLID = RenderTypes.entityCutoutNoCull(BladeMode.id("textures/entity/solid.png"));

	/** Corpses in view this frame, picked while the frame's render states are extracted. */
	private static final List<Corpse> VISIBLE = new ArrayList<>();
	private static float partialTick;
	private static Vec3 camera = Vec3.ZERO;

	private CorpseRenderer() {
	}

	public static void extract(WorldExtractionContext context) {
		VISIBLE.clear();
		for (Corpse corpse : CorpseManager.corpses()) {
			if (context.frustum().isVisible(corpse.ragdoll.bounds())) {
				VISIBLE.add(corpse);
			}
		}
		partialTick = context.tickCounter().getGameTimeDeltaPartialTick(false);
		camera = context.camera().position();
	}

	public static void render(WorldRenderContext context) {
		if (VISIBLE.isEmpty()) {
			return;
		}
		PoseStack poseStack = context.matrices();
		for (Corpse corpse : VISIBLE) {
			List<Placed> placed = place(corpse);
			for (int layer = 0; layer < corpse.layers.size(); layer++) {
				CaptureCollector.Layer style = corpse.layers.get(layer);
				int index = layer;
				context.commandQueue().submitCustomGeometry(poseStack, style.renderType(), (pose, consumer) -> {
					VertexConsumer out = style.sprite() != null ? style.sprite().wrap(consumer) : consumer;
					for (Placed p : placed) {
						if (p.piece.layer == index) {
							emit(pose, out, p, p.mesh.faces, p.mesh.faceVertices, style.color());
						}
					}
				});
			}
			int flesh = 0xFF000000 | corpse.blood.flesh();
			RenderType inside = corpse.blood.kind().bleeds() ? FLESH : SOLID;
			context.commandQueue().submitCustomGeometry(poseStack, inside, (pose, consumer) -> {
				for (Placed p : placed) {
					if (p.mesh.capVertices > 0) {
						emit(pose, consumer, p, p.mesh.caps, p.mesh.capVertices, flesh);
					}
				}
			});
		}
		VISIBLE.clear();
	}

	/** A piece where it is this frame, relative to the camera. */
	private record Placed(Piece piece, PieceMesh mesh, Matrix4f matrix, Matrix3f normal, int light) {
	}

	private static List<Placed> place(Corpse corpse) {
		List<Placed> placed = new ArrayList<>();
		Matrix4d world = new Matrix4d();
		for (Body body : corpse.ragdoll.bodies) {
			for (Piece piece : body.pieces) {
				PieceMesh mesh = PieceMesh.of(piece);
				if (mesh.faceVertices == 0 && mesh.capVertices == 0) {
					continue;
				}
				body.pieceTransform(piece, partialTick, camera.x, camera.y, camera.z, world);
				Matrix4f matrix = new Matrix4f(world);
				Matrix3f normal = matrix.normal(new Matrix3f());
				placed.add(new Placed(piece, mesh, matrix, normal, body.light));
			}
		}
		return placed;
	}

	private static void emit(PoseStack.Pose pose, VertexConsumer out, Placed p, float[] data, int vertices, int color) {
		Matrix4f matrix = new Matrix4f(pose.pose()).mul(p.matrix);
		Matrix3f normal = new Matrix3f(pose.normal()).mul(p.normal);
		Vector3f pos = new Vector3f();
		Vector3f n = new Vector3f();
		int overlay = OverlayTexture.NO_OVERLAY;
		for (int i = 0, o = 0; i < vertices; i++, o += 8) {
			matrix.transformPosition(data[o], data[o + 1], data[o + 2], pos);
			normal.transform(data[o + 5], data[o + 6], data[o + 7], n);
			float len = n.length();
			if (len > 1.0E-6F) {
				n.div(len);
			}
			out.addVertex(pos.x, pos.y, pos.z, color, data[o + 3], data[o + 4], overlay, p.light, n.x, n.y, n.z);
		}
	}
}
