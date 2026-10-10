package com.blademode.client.gore;

import com.blademode.client.mixin.ModelPartAccessor;
import com.blademode.gore.Cube;
import com.blademode.gore.Piece;
import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.client.gui.Font;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.OrderedSubmitNodeCollector;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.block.MovingBlockRenderState;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.block.model.BlockStateModel;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4d;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.jspecify.annotations.Nullable;

/**
 * Stands in for the render queue while an entity renderer draws a creature once, and keeps every
 * model it submits (the creature itself and each layer: armor, wool, saddles, glowing eyes...) as
 * posed parts. Everything else (items, name tags, shadows, flames) is ignored.
 */
final class CaptureCollector implements SubmitNodeCollector {
	/** How one captured model was drawn. */
	record Layer(RenderType renderType, @Nullable TextureAtlasSprite sprite, int color) {
	}

	final List<Layer> layers = new ArrayList<>();
	final List<Piece> pieces = new ArrayList<>();

	@Override
	public OrderedSubmitNodeCollector order(int order) {
		return this;
	}

	@Override
	public <S> void submitModel(Model<? super S> model, S state, PoseStack poseStack, RenderType renderType, int light, int overlay, int color,
		@Nullable TextureAtlasSprite sprite, int outlineColor, ModelFeatureRenderer.@Nullable CrumblingOverlay crumbling) {
		// The deferred renderer poses every model right before drawing it; do the same.
		model.setupAnim(state);
		int layer = this.layers.size();
		this.layers.add(new Layer(renderType, sprite, color));
		this.walk(model.root(), new Matrix4f(poseStack.last().pose()), "", layer);
	}

	@Override
	public void submitModelPart(ModelPart part, PoseStack poseStack, RenderType renderType, int light, int overlay, @Nullable TextureAtlasSprite sprite,
		boolean sheeted, boolean foil, int color, ModelFeatureRenderer.@Nullable CrumblingOverlay crumbling, int outlineColor) {
		int layer = this.layers.size();
		this.layers.add(new Layer(renderType, sprite, color));
		this.walk(part, new Matrix4f(poseStack.last().pose()), "#" + layer, layer);
	}

	/** Same traversal as {@code ModelPart.render}: invisible parts hide their children, skipped parts only themselves. */
	private void walk(ModelPart part, Matrix4f parent, String path, int layer) {
		if (!part.visible) {
			return;
		}
		Matrix4f matrix = new Matrix4f(parent).translate(part.x / 16.0F, part.y / 16.0F, part.z / 16.0F);
		if (part.xRot != 0.0F || part.yRot != 0.0F || part.zRot != 0.0F) {
			matrix.rotate(new Quaternionf().rotationZYX(part.zRot, part.yRot, part.xRot));
		}
		if (part.xScale != 1.0F || part.yScale != 1.0F || part.zScale != 1.0F) {
			matrix.scale(part.xScale, part.yScale, part.zScale);
		}
		ModelPartAccessor accessor = (ModelPartAccessor) (Object) part;
		List<ModelPart.Cube> cubes = accessor.blademode$cubes();
		if (!part.skipDraw && !cubes.isEmpty()) {
			List<Cube> converted = new ArrayList<>(cubes.size());
			for (ModelPart.Cube cube : cubes) {
				Cube c = convert(cube);
				if (c != null) {
					converted.add(c);
				}
			}
			if (!converted.isEmpty()) {
				this.pieces.add(new Piece(layer, path, new Matrix4d(matrix), converted, List.of()));
			}
		}
		for (Map.Entry<String, ModelPart> child : accessor.blademode$children().entrySet()) {
			this.walk(child.getValue(), matrix, path + "/" + child.getKey(), layer);
		}
	}

	/** Copies a model cube's faces: positions in blocks, texture coordinates as drawn. */
	static @Nullable Cube convert(ModelPart.Cube cube) {
		int floats = 0;
		for (ModelPart.Polygon polygon : cube.polygons) {
			floats += 4 + polygon.vertices().length * 5;
		}
		if (floats == 0) {
			return null;
		}
		float[] faces = new float[floats];
		float minX = Float.POSITIVE_INFINITY, minY = Float.POSITIVE_INFINITY, minZ = Float.POSITIVE_INFINITY;
		float maxX = Float.NEGATIVE_INFINITY, maxY = Float.NEGATIVE_INFINITY, maxZ = Float.NEGATIVE_INFINITY;
		int o = 0;
		for (ModelPart.Polygon polygon : cube.polygons) {
			faces[o++] = polygon.vertices().length;
			faces[o++] = polygon.normal().x();
			faces[o++] = polygon.normal().y();
			faces[o++] = polygon.normal().z();
			for (ModelPart.Vertex vertex : polygon.vertices()) {
				float x = vertex.worldX();
				float y = vertex.worldY();
				float z = vertex.worldZ();
				faces[o++] = x;
				faces[o++] = y;
				faces[o++] = z;
				faces[o++] = vertex.u();
				faces[o++] = vertex.v();
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				minZ = Math.min(minZ, z);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
				maxZ = Math.max(maxZ, z);
			}
		}
		return new Cube(minX, minY, minZ, maxX, maxY, maxZ, faces);
	}

	// ------------------------------------------------------------------------------------------
	// Everything that is not a model is not part of the body.

	@Override
	public void submitShadow(PoseStack poseStack, float radius, List<EntityRenderState.ShadowPiece> pieces) {
	}

	@Override
	public void submitNameTag(PoseStack poseStack, @Nullable Vec3 attachment, int offset, Component text, boolean seeThrough, int light, double distance,
		CameraRenderState camera) {
	}

	@Override
	public void submitText(PoseStack poseStack, float x, float y, FormattedCharSequence text, boolean dropShadow, Font.DisplayMode mode, int light, int color,
		int background, int outline) {
	}

	@Override
	public void submitFlame(PoseStack poseStack, EntityRenderState state, Quaternionf rotation) {
	}

	@Override
	public void submitLeash(PoseStack poseStack, EntityRenderState.LeashState leash) {
	}

	@Override
	public void submitBlock(PoseStack poseStack, BlockState state, int light, int overlay, int outline) {
	}

	@Override
	public void submitMovingBlock(PoseStack poseStack, MovingBlockRenderState state) {
	}

	@Override
	public void submitBlockModel(PoseStack poseStack, RenderType renderType, BlockStateModel model, float r, float g, float b, int light, int overlay, int outline) {
	}

	@Override
	public void submitItem(PoseStack poseStack, ItemDisplayContext context, int light, int overlay, int outline, int[] tints, List<BakedQuad> quads,
		RenderType renderType, ItemStackRenderState.FoilType foil) {
	}

	@Override
	public void submitCustomGeometry(PoseStack poseStack, RenderType renderType, SubmitNodeCollector.CustomGeometryRenderer renderer) {
	}

	@Override
	public void submitParticleGroup(SubmitNodeCollector.ParticleGroupRenderer renderer) {
	}
}
