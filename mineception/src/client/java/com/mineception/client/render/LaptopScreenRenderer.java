package com.mineception.client.render;

import com.mineception.block.LaptopBlock;
import com.mineception.block.LaptopBlockEntity;
import com.mineception.dream.Face;
import com.mineception.dream.render.ScreenQuad;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * Draws the live picture on a real-world laptop: a full-bright textured quad lying exactly on the block model's screen
 * (from {@link ScreenQuad}, rotated by the block's FACING), refreshed by the laptop's {@link DreamSession}.
 */
public final class LaptopScreenRenderer implements BlockEntityRenderer<LaptopBlockEntity, LaptopScreenRenderer.State> {
	private static final double[][][] CORNERS = new double[Face.values().length][][];

	static {
		for (Face facing : Face.HORIZONTAL) {
			CORNERS[facing.ordinal()] = ScreenQuad.corners(facing);
		}
	}

	/** What the renderer needs from the block entity for one frame. */
	public static final class State extends BlockEntityRenderState {
		Face facing = Face.SOUTH;
		@Nullable Identifier texture;
	}

	public LaptopScreenRenderer(BlockEntityRendererProvider.Context context) {
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(LaptopBlockEntity laptop, State state, float partialTick, Vec3 cameraPos,
								   ModelFeatureRenderer.@Nullable CrumblingOverlay crumbling) {
		BlockEntityRenderer.super.extractRenderState(laptop, state, partialTick, cameraPos, crumbling);
		state.facing = facing(laptop);
		state.texture = null;
		DreamSession session = DreamSession.get(laptop.getBlockPos());
		if (session != null) {
			state.texture = session.screenTexture(cameraPos, state.facing, partialTick);
		}
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		Identifier texture = state.texture;
		if (texture == null) {
			return;
		}
		double[][] corners = CORNERS[state.facing.ordinal()];
		collector.submitCustomGeometry(poseStack, RenderTypes.textPolygonOffset(texture), (pose, consumer) -> {
			for (int i = 0; i < 4; i++) {
				double[] corner = corners[i];
				consumer.addVertex(pose, (float) corner[0], (float) corner[1], (float) corner[2])
					.setColor(-1)
					.setUv(ScreenQuad.u(i), ScreenQuad.v(i))
					.setLight(LightTexture.FULL_BRIGHT);
			}
		});
	}

	private static Face facing(LaptopBlockEntity laptop) {
		if (!laptop.getBlockState().hasProperty(LaptopBlock.FACING)) {
			return Face.SOUTH;
		}
		Direction direction = laptop.getBlockState().getValue(LaptopBlock.FACING);
		return switch (direction) {
			case NORTH -> Face.NORTH;
			case WEST -> Face.WEST;
			case EAST -> Face.EAST;
			default -> Face.SOUTH;
		};
	}
}
