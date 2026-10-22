package com.ordnance.client.render;

import com.ordnance.entity.OrdnanceProjectileEntity;
import net.minecraft.client.item.ItemModelManager;
import net.minecraft.client.render.OverlayTexture;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import net.minecraft.client.render.entity.EntityRenderer;
import net.minecraft.client.render.entity.EntityRendererFactory;
import net.minecraft.client.render.entity.state.EntityRenderState;
import net.minecraft.client.render.item.ItemRenderState;
import net.minecraft.client.render.state.CameraRenderState;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.item.ItemDisplayContext;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.RotationAxis;

/**
 * Renders a projectile with the 3D model of the item it was made from. {@link Mode#ALIGN} points the model's +Z
 * axis along the flight direction (rockets, missiles, launcher rounds); {@link Mode#TUMBLE} spins it end over end
 * (thrown grenades).
 */
public class ProjectileItemRenderer<T extends OrdnanceProjectileEntity> extends EntityRenderer<T, ProjectileItemRenderer.State> {
	private final ItemModelManager itemModelManager;
	private final float scale;
	private final Mode mode;
	private final boolean lit;

	public ProjectileItemRenderer(EntityRendererFactory.Context context, float scale, Mode mode, boolean lit) {
		super(context);
		this.itemModelManager = context.getItemModelManager();
		this.scale = scale;
		this.mode = mode;
		this.lit = lit;
		this.shadowRadius = 0.12F * scale;
		this.shadowOpacity = 0.6F;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void updateRenderState(T entity, State state, float tickProgress) {
		super.updateRenderState(entity, state, tickProgress);
		this.itemModelManager.updateForNonLivingEntity(state.item, entity.getStack(), ItemDisplayContext.FIXED, entity);
		state.yaw = MathHelper.lerpAngleDegrees(tickProgress, entity.lastYaw, entity.getYaw());
		state.pitch = MathHelper.lerp(tickProgress, entity.lastPitch, entity.getPitch());
		state.spin = MathHelper.lerp(tickProgress, entity.lastSpin, entity.spin);
	}

	@Override
	protected int getBlockLight(T entity, BlockPos pos) {
		return this.lit ? 15 : super.getBlockLight(entity, pos);
	}

	@Override
	public void render(State state, MatrixStack matrices, OrderedRenderCommandQueue queue, CameraRenderState cameraState) {
		matrices.push();
		matrices.translate(0.0F, state.height * 0.5F, 0.0F);
		if (this.mode == Mode.ALIGN) {
			matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(state.yaw));
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(-state.pitch));
			matrices.multiply(RotationAxis.POSITIVE_Z.rotationDegrees(state.spin));
		} else {
			matrices.multiply(RotationAxis.POSITIVE_Y.rotationDegrees(state.yaw));
			matrices.multiply(RotationAxis.POSITIVE_X.rotationDegrees(state.spin));
		}

		matrices.scale(this.scale, this.scale, this.scale);
		state.item.render(matrices, queue, state.light, OverlayTexture.DEFAULT_UV, state.outlineColor);
		matrices.pop();
		super.render(state, matrices, queue, cameraState);
	}

	public enum Mode {
		ALIGN,
		TUMBLE
	}

	public static class State extends EntityRenderState {
		public final ItemRenderState item = new ItemRenderState();
		public float yaw;
		public float pitch;
		public float spin;
	}
}
