package net.earthscapes.client.entity;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.earthscapes.Earthscapes;
import net.earthscapes.client.model.EsMobLayers;
import net.earthscapes.entity.Fennec;
import net.minecraft.client.model.animal.fox.FoxModel;
import net.minecraft.client.renderer.entity.AgeableMobRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.layers.FoxHeldItemLayer;
import net.minecraft.client.renderer.entity.state.FoxRenderState;
import net.minecraft.client.renderer.entity.state.HoldingEntityRenderState;
import net.minecraft.resources.Identifier;

/** The fennec: the vanilla fox model and animations on its own big-eared geometry. */
public class FennecRenderer extends AgeableMobRenderer<Fennec, FoxRenderState, FoxModel> {
	private static final Identifier TEXTURE = Earthscapes.id("textures/entity/fennec.png");

	public FennecRenderer(EntityRendererProvider.Context context) {
		super(context, new FoxModel(context.bakeLayer(EsMobLayers.FENNEC)), new FoxModel(context.bakeLayer(EsMobLayers.FENNEC_BABY)), 0.3F);
		this.addLayer(new FoxHeldItemLayer(this));
	}

	@Override
	protected void setupRotations(FoxRenderState state, PoseStack poseStack, float bodyRot, float scale) {
		super.setupRotations(state, poseStack, bodyRot, scale);
		if (state.isPouncing || state.isFaceplanted) {
			poseStack.mulPose(Axis.XP.rotationDegrees(-state.xRot));
		}
	}

	@Override
	public Identifier getTextureLocation(FoxRenderState state) {
		return TEXTURE;
	}

	@Override
	public FoxRenderState createRenderState() {
		return new FoxRenderState();
	}

	@Override
	public void extractRenderState(Fennec fennec, FoxRenderState state, float partialTick) {
		super.extractRenderState(fennec, state, partialTick);
		HoldingEntityRenderState.extractHoldingEntityRenderState(fennec, state, this.itemModelResolver);
		state.headRollAngle = fennec.getHeadRollAngle(partialTick);
		state.isCrouching = fennec.isCrouching();
		state.crouchAmount = fennec.getCrouchAmount(partialTick);
		state.isSleeping = fennec.isSleeping();
		state.isSitting = fennec.isSitting();
		state.isFaceplanted = fennec.isFaceplanted();
		state.isPouncing = fennec.isPouncing();
		state.variant = fennec.getVariant();
	}
}
