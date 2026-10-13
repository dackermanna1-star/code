package dev.calibercraft.client.screen;

import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.navigation.ScreenRectangle;
import net.minecraft.client.gui.render.pip.PictureInPictureRenderer;
import net.minecraft.client.gui.render.state.pip.PictureInPictureRenderState;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.feature.FeatureRenderDispatcher;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.jspecify.annotations.Nullable;

/** Renders a large, freely rotatable weapon into the gunsmith screen (picture-in-picture element). */
public final class WeaponPreviewRenderer extends PictureInPictureRenderer<WeaponPreviewRenderer.State> {
	private final ItemStackRenderState itemState = new ItemStackRenderState();

	public WeaponPreviewRenderer(MultiBufferSource.BufferSource bufferSource) {
		super(bufferSource);
	}

	/** @param yaw/pitch degrees, @param scale GUI pixels per block */
	public record State(ItemStack stack, float yaw, float pitch, int x0, int y0, int x1, int y1, float scale,
			@Nullable ScreenRectangle scissorArea, @Nullable ScreenRectangle bounds) implements PictureInPictureRenderState {
		public State(ItemStack stack, float yaw, float pitch, int x0, int y0, int x1, int y1, float scale, @Nullable ScreenRectangle scissor) {
			this(stack, yaw, pitch, x0, y0, x1, y1, scale, scissor, PictureInPictureRenderState.getBounds(x0, y0, x1, y1, scissor));
		}
	}

	@Override
	public Class<State> getRenderStateClass() {
		return State.class;
	}

	@Override
	protected void renderToTexture(State state, PoseStack pose) {
		Minecraft mc = Minecraft.getInstance();
		mc.gameRenderer.getLighting().setupFor(Lighting.Entry.ITEMS_3D);
		pose.scale(1.0F, -1.0F, -1.0F);
		pose.mulPose(Axis.XP.rotationDegrees(state.pitch()));
		pose.mulPose(Axis.YP.rotationDegrees(state.yaw()));
		mc.getItemModelResolver().updateForTopItem(itemState, state.stack(), ItemDisplayContext.GUI, mc.level, null, 0);
		FeatureRenderDispatcher dispatcher = mc.gameRenderer.getFeatureRenderDispatcher();
		itemState.submit(pose, dispatcher.getSubmitNodeStorage(), 0xF000F0, OverlayTexture.NO_OVERLAY, 0);
		dispatcher.renderAllFeatures();
	}

	@Override
	protected float getTranslateY(int height, int guiScale) {
		return height / 2.0F;
	}

	@Override
	protected String getTextureLabel() {
		return "calibercraft weapon preview";
	}
}
