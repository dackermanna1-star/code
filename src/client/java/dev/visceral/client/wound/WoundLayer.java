package dev.visceral.client.wound;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.visceral.VisceralConfig;
import dev.visceral.client.VisceralClientKeys;
import dev.visceral.client.model.ModelTree;
import dev.visceral.client.render.Atlas;
import dev.visceral.client.render.VisceralRenderTypes;
import dev.visceral.wound.BodyFrame;
import dev.visceral.wound.Wound;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Draws cuts, punctures, bruises and burns on the model. The parent model is already posed for this
 * entity (and overridden by the ragdoll when dead), so the decals follow every limb.
 */
public class WoundLayer<S extends LivingEntityRenderState, M extends EntityModel<? super S>> extends RenderLayer<S, M> {
	public WoundLayer(RenderLayerParent<S, M> parent) {
		super(parent);
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, S state, float yRot, float xRot) {
		VisceralClientKeys.WoundRenderInfo info = state.getData(VisceralClientKeys.WOUNDS);
		if (info == null || info.wounds().isEmpty() || state.isInvisible || !VisceralConfig.get().woundDecals) {
			return;
		}
		Minecraft minecraft = Minecraft.getInstance();
		Vec3 camera = minecraft.gameRenderer.getMainCamera().position();
		ModelTree tree = ModelTree.of(this.getParentModel().root());
		Matrix4f[] matrices = tree.poseMatrices();
		Matrix4f pose = new Matrix4f(poseStack.last().pose());
		Matrix4f inversePose = null;
		VisceralConfig config = VisceralConfig.get();
		float healTicks = config.woundHealSeconds * 20.0F;
		long tick = minecraft.level != null ? minecraft.level.getGameTime() : 0L;

		Batch batch = new Batch();
		for (Wound wound : info.wounds()) {
			WoundPlacement placement = ClientWounds.get(info.entityId(), wound);
			if (placement == null || placement.tree != tree) {
				if (inversePose == null) {
					inversePose = new Matrix4f(pose).invert();
				}
				Vec3 origin = BodyFrame.fromBody(wound.origin().x(), wound.origin().y(), wound.origin().z(), state.bodyRot);
				Vec3 dir = BodyFrame.fromBody(wound.dir().x(), wound.dir().y(), wound.dir().z(), state.bodyRot);
				Vector3f originModel = inversePose.transformPosition(new Vector3f(
					(float) (state.x - camera.x + origin.x), (float) (state.y - camera.y + origin.y), (float) (state.z - camera.z + origin.z)
				), new Vector3f());
				Vector3f dirModel = inversePose.transformDirection(new Vector3f((float) dir.x, (float) dir.y, (float) dir.z), new Vector3f());
				if (dirModel.lengthSquared() < 1.0E-10F) {
					continue;
				}
				dirModel.normalize();
				placement = WoundResolver.resolve(tree, matrices, originModel, dirModel, wound, info.blood());
				if (placement == null) {
					continue;
				}
				ClientWounds.put(info.entityId(), wound, placement);
			}
			if (placement.nodeIndex >= matrices.length || !tree.isVisible(tree.nodes.get(placement.nodeIndex))) {
				continue;
			}

			float age = info.gameTime() - wound.time();
			Matrix4f partMatrix = matrices[placement.nodeIndex];
			Matrix3f normalMatrix = partMatrix.normal(new Matrix3f());

			int color = WoundStyle.color(wound, info.blood(), age, healTicks, info.dead());
			if ((color >>> 24) > 0) {
				batch.add(placement.polygons, placement.cell, partMatrix, normalMatrix, color);
			}
			if (!placement.tricklePolygons.isEmpty()) {
				int trickle = WoundStyle.trickleColor(wound, info.blood(), age, wound.bleedTicks(config.bleedDurationMultiplier), info.dead());
				if ((trickle >>> 24) > 0) {
					batch.add(placement.tricklePolygons, Atlas.W_TRICKLE, partMatrix, normalMatrix, trickle);
				}
			}

			// Remember where the wound is in the world so drips fall from the right place.
			Vector3f center = partMatrix.transformPosition(new Vector3f(placement.localCenter).div(16.0F), new Vector3f());
			pose.transformPosition(center);
			placement.lastWorldPos = new Vec3(center.x + camera.x, center.y + camera.y, center.z + camera.z);
			Vector3f normal = normalMatrix.transform(new Vector3f(placement.localNormal));
			pose.transformDirection(normal);
			if (normal.lengthSquared() > 1.0E-8F) {
				normal.normalize();
				placement.lastWorldNormal = new Vec3(normal.x, normal.y, normal.z);
			}
			placement.lastSeenTick = tick;
		}

		if (batch.vertexCount > 0) {
			Batch finished = batch;
			int packedLight = light;
			collector.submitCustomGeometry(poseStack, VisceralRenderTypes.WOUNDS, (p, consumer) -> finished.emit(p, consumer, packedLight));
		}
	}

	/** Vertices in model space, converted to quads (fans of degenerate quads for odd polygons). */
	private static final class Batch {
		private float[] data = new float[256];
		private int[] colors = new int[32];
		private int vertexCount;

		void add(List<float[]> polygons, int cell, Matrix4f partMatrix, Matrix3f normalMatrix, int color) {
			Vector3f position = new Vector3f();
			Vector3f normal = new Vector3f();
			for (float[] polygon : polygons) {
				int n = polygon.length / WoundGeometry.STRIDE;
				int i = 1;
				while (i + 1 < n) {
					if (i + 2 < n) {
						this.quad(polygon, 0, i, i + 1, i + 2, cell, partMatrix, normalMatrix, color, position, normal);
						i += 2;
					} else {
						this.quad(polygon, 0, i, i + 1, i + 1, cell, partMatrix, normalMatrix, color, position, normal);
						i += 1;
					}
				}
			}
		}

		private void quad(float[] polygon, int a, int b, int c, int d, int cell, Matrix4f partMatrix, Matrix3f normalMatrix, int color, Vector3f position, Vector3f normal) {
			this.vertex(polygon, a, cell, partMatrix, normalMatrix, color, position, normal);
			this.vertex(polygon, b, cell, partMatrix, normalMatrix, color, position, normal);
			this.vertex(polygon, c, cell, partMatrix, normalMatrix, color, position, normal);
			this.vertex(polygon, d, cell, partMatrix, normalMatrix, color, position, normal);
		}

		private void vertex(float[] polygon, int index, int cell, Matrix4f partMatrix, Matrix3f normalMatrix, int color, Vector3f position, Vector3f normal) {
			int o = index * WoundGeometry.STRIDE;
			partMatrix.transformPosition(polygon[o] / 16.0F, polygon[o + 1] / 16.0F, polygon[o + 2] / 16.0F, position);
			normalMatrix.transform(polygon[o + 5], polygon[o + 6], polygon[o + 7], normal);
			if (normal.lengthSquared() > 1.0E-8F) {
				normal.normalize();
			}
			int base = this.vertexCount * 8;
			if (base + 8 > this.data.length) {
				this.data = java.util.Arrays.copyOf(this.data, this.data.length * 2);
			}
			if (this.vertexCount >= this.colors.length) {
				this.colors = java.util.Arrays.copyOf(this.colors, this.colors.length * 2);
			}
			this.data[base] = position.x;
			this.data[base + 1] = position.y;
			this.data[base + 2] = position.z;
			this.data[base + 3] = Atlas.u(cell, polygon[o + 3]);
			this.data[base + 4] = Atlas.v(cell, polygon[o + 4]);
			this.data[base + 5] = normal.x;
			this.data[base + 6] = normal.y;
			this.data[base + 7] = normal.z;
			this.colors[this.vertexCount] = color;
			this.vertexCount++;
		}

		void emit(PoseStack.Pose pose, VertexConsumer consumer, int light) {
			for (int i = 0; i < this.vertexCount; i++) {
				int o = i * 8;
				consumer.addVertex(pose, this.data[o], this.data[o + 1], this.data[o + 2])
					.setColor(this.colors[i])
					.setUv(this.data[o + 3], this.data[o + 4])
					.setOverlay(OverlayTexture.NO_OVERLAY)
					.setLight(light)
					.setNormal(pose, this.data[o + 5], this.data[o + 6], this.data[o + 7]);
			}
		}
	}
}
