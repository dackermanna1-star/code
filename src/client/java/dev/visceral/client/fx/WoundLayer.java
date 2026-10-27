package dev.visceral.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.visceral.Visceral;
import dev.visceral.client.anim.Bone;
import dev.visceral.client.anim.Rig;
import dev.visceral.client.config.ClientConfig;
import dev.visceral.client.net.ClientNet;
import dev.visceral.state.BloodType;
import dev.visceral.state.BodyRegion;
import dev.visceral.state.Wound;
import dev.visceral.state.WoundList;
import dev.visceral.state.WoundType;
import net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Persistent visual damage: draws each synced wound as a decal on the face of the body part it
 * landed on, following the part through animation and ragdoll physics. Severed limbs leave a
 * stump cap on the torso.
 */
public final class WoundLayer<S extends HumanoidRenderState, M extends HumanoidModel<S>> extends RenderLayer<S, M> {
	public static final RenderStateDataKey<WoundList> WOUNDS = RenderStateDataKey.create(() -> "visceral:wounds");
	public static final RenderStateDataKey<BloodType> BLOOD = RenderStateDataKey.create(() -> "visceral:blood");
	private static final Identifier CUT = Visceral.id("textures/entity/wound/cut.png");
	private static final Identifier STAB = Visceral.id("textures/entity/wound/stab.png");
	private static final Identifier BRUISE = Visceral.id("textures/entity/wound/bruise.png");
	private static final Identifier GORE = Visceral.id("textures/entity/wound/gore.png");
	private static final Identifier STUMP = Visceral.id("textures/entity/wound/stump.png");

	public WoundLayer(RenderLayerParent<S, M> parent) {
		super(parent);
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, S state, float yRot, float xRot) {
		ClientConfig cfg = ClientConfig.get();
		if (!cfg.woundOverlays || state.isInvisible) return;
		WoundList wounds = state.getData(WOUNDS);
		if (wounds == null || wounds.isEmpty()) return;
		BloodType blood = state.getDataOrDefault(BLOOD, BloodType.RED);
		int gore = Math.min(cfg.goreLevel, ClientNet.serverMaxGore);
		M model = getParentModel();
		Rig rig = Rig.of(model);
		for (Wound w : wounds.wounds()) {
			Identifier tex = texture(w, gore, blood);
			if (tex == null) continue;
			int bone = w.type() == WoundType.SEVERED ? Bone.BODY.ordinal() : Bone.of(w.region()).ordinal();
			ModelPart part = rig.parts[bone];
			if (part.xScale == 0) continue;
			poseStack.pushPose();
			model.root().translateAndRotate(poseStack);
			part.translateAndRotate(poseStack);
			Vector3f n = new Vector3f();
			Vector3f center = new Vector3f();
			float size = placement(w, rig, bone, center, n);
			int color = tint(w, blood);
			float rot = w.rotation() * Mth.DEG_TO_RAD;
			collector.submitCustomGeometry(poseStack, RenderTypes.entityTranslucent(tex),
				(pose, vc) -> quad(vc, pose.pose(), center, n, size, rot, color, light));
			poseStack.popPose();
		}
	}

	private static Identifier texture(Wound w, int gore, BloodType blood) {
		return switch (w.type()) {
			case CUT -> blood == BloodType.BONE ? BRUISE : (gore >= 1 && w.severity() > 0.65f ? GORE : CUT);
			case STAB -> blood == BloodType.BONE ? BRUISE : STAB;
			case BLUNT, BURN -> BRUISE;
			case SEVERED -> gore >= 2 ? STUMP : null;
		};
	}

	private static int tint(Wound w, BloodType blood) {
		if (w.type() == WoundType.BURN) return ARGB.colorFromFloat(0.95f, 0.25f, 0.2f, 0.18f);
		return switch (blood) {
			case BONE -> ARGB.colorFromFloat(0.85f, 0.75f, 0.72f, 0.68f);
			case GREEN -> ARGB.colorFromFloat(1f, 0.55f, 1.0f, 0.35f);
			case PURPLE -> ARGB.colorFromFloat(1f, 0.85f, 0.45f, 1.0f);
			case DARK -> ARGB.colorFromFloat(1f, 0.7f, 0.65f, 0.6f);
			default -> 0xFFFFFFFF;
		};
	}

	/** Centre (pixels, part space) and outward normal of the wound; returns half-size in pixels. */
	private static float placement(Wound w, Rig rig, int bone, Vector3f center, Vector3f normal) {
		Vector3f min = rig.cubeMin[bone], max = rig.cubeMax[bone];
		int face = w.face();
		float u = w.u(), v = w.v();
		if (w.type() == WoundType.SEVERED) {
			BodyRegion r = w.region();
			switch (r) {
				case HEAD -> {
					face = 4;
					u = 0.5f;
					v = 0.5f;
				}
				case RIGHT_ARM -> {
					face = 2;
					u = 0.5f;
					v = 0.12f;
				}
				case LEFT_ARM -> {
					face = 3;
					u = 0.5f;
					v = 0.12f;
				}
				case RIGHT_LEG -> {
					face = 5;
					u = 0.25f;
					v = 0.5f;
				}
				default -> {
					face = 5;
					u = 0.75f;
					v = 0.5f;
				}
			}
		}
		float x = Mth.lerp(u, min.x, max.x), y = Mth.lerp(v, min.y, max.y), z = Mth.lerp(u, min.z, max.z);
		float eps = 0.06f;
		switch (face) {
			case 0 -> {
				center.set(x, y, min.z - eps);
				normal.set(0, 0, -1);
			}
			case 1 -> {
				center.set(x, y, max.z + eps);
				normal.set(0, 0, 1);
			}
			case 2 -> {
				center.set(min.x - eps, y, z);
				normal.set(-1, 0, 0);
			}
			case 3 -> {
				center.set(max.x + eps, y, z);
				normal.set(1, 0, 0);
			}
			case 4 -> {
				center.set(Mth.lerp(u, min.x, max.x), min.y - eps, Mth.lerp(v, min.z, max.z));
				normal.set(0, -1, 0);
			}
			default -> {
				center.set(Mth.lerp(u, min.x, max.x), max.y + eps, Mth.lerp(v, min.z, max.z));
				normal.set(0, 1, 0);
			}
		}
		float faceSpan = switch (face) {
			case 0, 1 -> Math.min(max.x - min.x, max.y - min.y);
			case 2, 3 -> Math.min(max.z - min.z, max.y - min.y);
			default -> Math.min(max.x - min.x, max.z - min.z);
		};
		float half = w.type() == WoundType.SEVERED ? faceSpan * 0.45f : (1.2f + w.severity() * 2.2f) * (w.type() == WoundType.BLUNT ? 1.25f : 1f);
		return Math.min(half, faceSpan * 0.55f) / 16f;
	}

	private static void quad(VertexConsumer vc, Matrix4f m, Vector3f centerPx, Vector3f n, float half, float rot, int color, int light) {
		Vector3f c = new Vector3f(centerPx).div(16f);
		Vector3f t = Math.abs(n.y) > 0.5f ? new Vector3f(1, 0, 0) : new Vector3f(0, 1, 0);
		Vector3f b = new Vector3f(n).cross(t).normalize();
		t = new Vector3f(b).cross(n).normalize();
		float cs = Mth.cos(rot), sn = Mth.sin(rot);
		Vector3f u = new Vector3f(t).mul(cs).add(new Vector3f(b).mul(sn)).mul(half);
		Vector3f v = new Vector3f(b).mul(cs).sub(new Vector3f(t).mul(sn)).mul(half);
		float[][] k = {{-1, -1, 0, 1}, {1, -1, 1, 1}, {1, 1, 1, 0}, {-1, 1, 0, 0}};
		for (float[] q : k) {
			float x = c.x + u.x * q[0] + v.x * q[1], y = c.y + u.y * q[0] + v.y * q[1], z = c.z + u.z * q[0] + v.z * q[1];
			vc.addVertex(m, x, y, z).setColor(color).setUv(q[2], q[3]).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(n.x, n.y, n.z);
		}
	}
}
