package com.extremesports.client.render;

import com.extremesports.client.anim.RideFrame;
import com.extremesports.sport.EquipmentConfig;
import com.extremesports.sport.EquipmentKind;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import java.util.Set;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.joml.Quaternionf;

/** Draws inline skates on the rider's feet, following each leg's animated pose. */
public class SkatesLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final EquipmentModel model;

	public SkatesLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent, EquipmentModel model) {
		super(parent);
		this.model = model;
	}

	@Override
	public void submit(PoseStack poseStack, SubmitNodeCollector collector, int light, AvatarRenderState state, float yRot, float xRot) {
		RiderRenderHooks.RiderData data = state.getData(RiderRenderHooks.KEY);
		if (data == null || data.frame() == null || !data.frame().skatesOnFeet || data.blend() < 0.3F) {
			return;
		}
		RideFrame frame = data.frame();
		EquipmentConfig config = state.getData(SKATE_CONFIG);
		if (config == null) {
			config = EquipmentConfig.EMPTY;
		}
		PlayerModel parent = getParentModel();
		renderSkate(poseStack, collector, light, parent, parent.leftLeg, frame, config, state.outlineColor);
		renderSkate(poseStack, collector, light, parent, parent.rightLeg, frame, config, state.outlineColor);
	}

	public static final net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey<EquipmentConfig> SKATE_CONFIG =
		net.fabricmc.fabric.api.client.rendering.v1.RenderStateDataKey.create(() -> "extremesports:skate_config");

	private void renderSkate(PoseStack poseStack, SubmitNodeCollector collector, int light, PlayerModel parent, ModelPart leg,
							 RideFrame frame, EquipmentConfig config, int outline) {
		poseStack.pushPose();
		parent.root().translateAndRotate(poseStack);
		poseStack.translate(leg.x / 16.0F, leg.y / 16.0F, leg.z / 16.0F);
		poseStack.mulPose(new Quaternionf().rotationZYX(leg.zRot, leg.yRot, leg.xRot));
		// To the sole (legs are 12px; account for knee squash without squashing the skate)
		poseStack.translate(0.0F, 12.0F * leg.yScale / 16.0F, 0.0F);
		// Model is y-up; the leg space is y-down
		poseStack.mulPose(Axis.ZP.rotationDegrees(180.0F));
		for (EquipmentModel.PassKey key : model.passes()) {
			int color = EquipmentRenderer.resolveColor(key.color(), config, EquipmentKind.SKATES);
			collector.submitModel(model, new EquipmentModel.Pass(key, frame.wheel, 0.0F, Set.of()), poseStack,
				RenderTypes.entityCutout(key.material().texture), light, OverlayTexture.NO_OVERLAY, color, null, outline, null);
		}
		poseStack.popPose();
	}
}
