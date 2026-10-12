package com.extremesports.client.render;

import com.extremesports.ExtremeSports;
import com.extremesports.client.anim.RideAnimator;
import com.extremesports.client.anim.RideFrame;
import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.extremesports.sport.SportType;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.AABB;

/**
 * Renders skateboards, BMX bikes, scooters and (when nobody wears them) inline skates.
 */
public class EquipmentRenderer extends EntityRenderer<SportEquipmentEntity, EquipmentRenderState> {
	public static final Map<EquipmentKind, ModelLayerLocation> LAYERS = new EnumMap<>(EquipmentKind.class);
	public static final Map<EquipmentKind, EquipmentModel.Spec> SPECS = new EnumMap<>(EquipmentKind.class);

	static {
		for (EquipmentKind kind : EquipmentKind.values()) {
			LAYERS.put(kind, new ModelLayerLocation(ExtremeSports.id(kind.itemId()), "main"));
			SPECS.put(kind, switch (kind.sport()) {
				case SKATEBOARD -> EquipmentModels.skateboard(kind);
				case BMX -> EquipmentModels.bmx();
				case SCOOTER -> EquipmentModels.scooter();
				case SKATES -> EquipmentModels.skate();
			});
		}
	}

	private final Map<EquipmentKind, EquipmentModel> models = new EnumMap<>(EquipmentKind.class);

	public EquipmentRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.shadowRadius = 0.4F;
		for (EquipmentKind kind : EquipmentKind.values()) {
			models.put(kind, new EquipmentModel(context.bakeLayer(LAYERS.get(kind)), SPECS.get(kind)));
		}
	}

	public EquipmentModel model(EquipmentKind kind) {
		return models.get(kind);
	}

	@Override
	public EquipmentRenderState createRenderState() {
		return new EquipmentRenderState();
	}

	@Override
	public void extractRenderState(SportEquipmentEntity entity, EquipmentRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.kind = entity.kind();
		state.config = entity.config();
		state.ridden = entity.getControllingPassenger() != null;
		state.frame = RideAnimator.frame(entity, partialTick);
		state.preview = false;
	}

	@Override
	protected AABB getBoundingBoxForCulling(SportEquipmentEntity entity) {
		return entity.getBoundingBox().inflate(1.2, 1.2, 1.2);
	}

	@Override
	public void submit(EquipmentRenderState state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		RideFrame frame = state.frame;
		if (frame == null) {
			return;
		}
		if (state.kind == EquipmentKind.SKATES) {
			if (!state.ridden || state.preview) {
				poseStack.pushPose();
				poseStack.mulPose(Axis.YP.rotationDegrees(-frame.yaw));
				for (int side = 0; side < 2; side++) {
					poseStack.pushPose();
					poseStack.translate(side == 0 ? 0.16F : -0.16F, EquipmentModels.SKATE_HEIGHT / 16.0F, 0.0F);
					poseStack.mulPose(Axis.YP.rotationDegrees(180.0F));
					submitModel(models.get(EquipmentKind.SKATES), state, poseStack, collector, frame.wheel, 0.0F, Set.of());
					poseStack.popPose();
				}
				poseStack.popPose();
			}
			super.submit(state, poseStack, collector, camera);
			return;
		}
		poseStack.pushPose();
		if (!state.preview) {
			RideTransforms.applyShared(poseStack, frame, 0.0F);
		}
		poseStack.mulPose(Axis.YP.rotationDegrees(-frame.yaw));
		submitEquipment(state, frame, poseStack, collector);
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}

	/** Draws the equipment in its own frame (+z forward); used by the world renderer and GUI previews. */
	public void submitEquipment(EquipmentRenderState state, RideFrame frame, PoseStack poseStack, SubmitNodeCollector collector) {
		EquipmentKind kind = state.kind;
		EquipmentModel model = models.get(kind);
		poseStack.translate(0.0F, frame.lift, 0.0F);
		float centerY = kind.sport() == SportType.SKATEBOARD ? EquipmentModels.boardDims(kind).deckBottom() / 16.0F : 0.45F;
		if (frame.eqYaw != 0.0F || frame.eqRoll != 0.0F || frame.eqPitch != 0.0F) {
			poseStack.translate(0.0F, centerY, 0.0F);
			poseStack.mulPose(Axis.YP.rotationDegrees(-frame.eqYaw));
			poseStack.mulPose(Axis.ZP.rotationDegrees(frame.eqRoll));
			poseStack.mulPose(Axis.XP.rotationDegrees(-frame.eqPitch));
			poseStack.translate(0.0F, -centerY, 0.0F);
		}
		if (frame.tiltPitch != 0.0F || frame.tiltRoll != 0.0F) {
			poseStack.translate(0.0F, 0.0F, frame.tiltPivot);
			poseStack.mulPose(Axis.XP.rotationDegrees(-frame.tiltPitch));
			poseStack.mulPose(Axis.ZP.rotationDegrees(frame.tiltRoll));
			poseStack.translate(0.0F, 0.0F, -frame.tiltPivot);
		}
		Set<String> hidden = kind == EquipmentKind.BMX && "none".equals(state.config.part(SportType.BMX, "pegs")) ? Set.of("pegs") : Set.of();
		for (EquipmentModel.PassKey key : model.passes()) {
			poseStack.pushPose();
			if (key.group() == EquipmentModel.Group.FRONT) {
				if (kind == EquipmentKind.BMX) {
					RideTransforms.steeringAxis(poseStack, EquipmentModels.BMX_PIVOT_Y, EquipmentModels.BMX_PIVOT_Z, EquipmentModels.BMX_HEAD_ANGLE, frame.partSpin);
				} else {
					RideTransforms.steeringAxis(poseStack, 8.0F, EquipmentModels.SCOOTER_STEM_Z, 0.0F, frame.partSpin);
				}
			} else if (key.group() == EquipmentModel.Group.FRAME) {
				if (kind == EquipmentKind.BMX) {
					RideTransforms.steeringAxis(poseStack, EquipmentModels.BMX_PIVOT_Y, EquipmentModels.BMX_PIVOT_Z, EquipmentModels.BMX_HEAD_ANGLE, frame.whip);
				} else {
					RideTransforms.steeringAxis(poseStack, 8.0F, EquipmentModels.SCOOTER_STEM_Z, 0.0F, frame.whip);
				}
			}
			int color = resolveColor(key.color(), state.config, kind);
			collector.submitModel(model, new EquipmentModel.Pass(key, frame.wheel, frame.crank, hidden), poseStack,
				RenderTypes.entityCutout(key.material().texture), state.lightCoords, OverlayTexture.NO_OVERLAY, color, null, state.outlineColor, null);
			poseStack.popPose();
		}
		if (kind.sport() == SportType.SKATEBOARD) {
			submitBoardArt(state, poseStack, collector);
		}
	}

	private void submitModel(EquipmentModel model, EquipmentRenderState state, PoseStack poseStack, SubmitNodeCollector collector,
							 float wheel, float crank, Set<String> hidden) {
		for (EquipmentModel.PassKey key : model.passes()) {
			int color = resolveColor(key.color(), state.config, state.kind);
			collector.submitModel(model, new EquipmentModel.Pass(key, wheel, crank, hidden), poseStack,
				RenderTypes.entityCutout(key.material().texture), state.lightCoords, OverlayTexture.NO_OVERLAY, color, null, state.outlineColor, null);
		}
	}

	/** Deck graphic underneath and sticker on top. */
	private void submitBoardArt(EquipmentRenderState state, PoseStack poseStack, SubmitNodeCollector collector) {
		EquipmentModels.BoardDims dims = EquipmentModels.boardDims(state.kind);
		String graphic = state.config.part(SportType.SKATEBOARD, "graphic");
		int light = state.lightCoords;
		if (!"none".equals(graphic)) {
			Identifier texture = ExtremeSports.id("textures/entity/graphic/" + graphic + ".png");
			float x0 = -dims.halfWidth() / 16.0F + 0.002F;
			float x1 = dims.halfWidth() / 16.0F - 0.002F;
			float z0 = -dims.halfLength() / 16.0F;
			float z1 = dims.halfLength() / 16.0F;
			float y = dims.deckBottom() / 16.0F - 0.003F;
			collector.submitCustomGeometry(poseStack, RenderTypes.entityCutoutNoCull(texture), (pose, consumer) -> {
				vertex(consumer, pose, x1, y, z1, 0.0F, 0.0F, light);
				vertex(consumer, pose, x0, y, z1, 1.0F, 0.0F, light);
				vertex(consumer, pose, x0, y, z0, 1.0F, 1.0F, light);
				vertex(consumer, pose, x1, y, z0, 0.0F, 1.0F, light);
			});
		}
		String sticker = state.config.part(SportType.SKATEBOARD, "sticker");
		if (!"none".equals(sticker)) {
			Identifier texture = ExtremeSports.id("textures/entity/sticker/" + sticker + ".png");
			float size = Math.min(dims.halfWidth() * 0.8F, 2.2F) / 16.0F;
			float cz = (dims.halfLength() - 2.6F) / 16.0F;
			float y = (dims.deckTop() + 0.08F) / 16.0F;
			collector.submitCustomGeometry(poseStack, RenderTypes.entityCutoutNoCull(texture), (pose, consumer) -> {
				vertex(consumer, pose, -size, y, cz - size, 0.0F, 1.0F, light);
				vertex(consumer, pose, size, y, cz - size, 1.0F, 1.0F, light);
				vertex(consumer, pose, size, y, cz + size, 1.0F, 0.0F, light);
				vertex(consumer, pose, -size, y, cz + size, 0.0F, 0.0F, light);
			});
		}
	}

	private static void vertex(VertexConsumer consumer, PoseStack.Pose pose, float x, float y, float z, float u, float v, int light) {
		consumer.addVertex(pose, x, y, z).setColor(-1).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(pose, 0.0F, 1.0F, 0.0F);
	}

	public static int resolveColor(String slot, EquipmentConfig config, EquipmentKind kind) {
		if (slot.startsWith("#")) {
			return 0xFF000000 | Integer.parseInt(slot.substring(1), 16);
		}
		return 0xFF000000 | config.color(kind, slot);
	}
}
