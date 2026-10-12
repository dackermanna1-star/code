package com.extremesports.client.render;

import com.extremesports.ExtremeSports;
import com.extremesports.block.RampBlock;
import com.extremesports.block.RampProfile;
import com.extremesports.registry.ModBlocks;
import java.util.List;
import net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin;
import net.fabricmc.fabric.api.renderer.v1.Renderer;
import net.fabricmc.fabric.api.renderer.v1.mesh.Mesh;
import net.fabricmc.fabric.api.renderer.v1.mesh.MutableMesh;
import net.fabricmc.fabric.api.renderer.v1.mesh.MutableQuadView;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import net.fabricmc.fabric.api.renderer.v1.model.MeshBakedGeometry;
import net.minecraft.client.renderer.block.model.BlockModelPart;
import net.minecraft.client.renderer.block.model.BlockStateModel;
import net.minecraft.client.renderer.block.model.SimpleModelWrapper;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.Material;
import net.minecraft.client.resources.model.ModelBaker;
import net.minecraft.client.resources.model.ResolvableModel;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.StairsShape;
import org.joml.Vector3f;

/**
 * Smooth ramp geometry generated from the same height field the physics uses: a subdivided riding surface,
 * profile-shaped side walls, a base and steel coping along quarter-pipe lips.
 */
public final class RampModels {
	private RampModels() {
	}

	public static void register() {
		ModelLoadingPlugin.register(context -> {
			for (RampBlock block : ModBlocks.RAMPS) {
				context.registerBlockStateResolver(block, resolver -> {
					for (BlockState state : block.getStateDefinition().getPossibleStates()) {
						resolver.setModel(state, new Unbaked(block, state));
					}
				});
			}
		});
	}

	/** Texture names for a ramp block: top surface, sides. */
	static Identifier[] textures(RampBlock block) {
		if (block == ModBlocks.BOWL_WALL || block == ModBlocks.SLOPE) {
			return new Identifier[]{ExtremeSports.id("block/park_concrete"), ExtremeSports.id("block/park_concrete_dark")};
		}
		if (block == ModBlocks.DIRT_LIP || block == ModBlocks.DIRT_RAMP) {
			return new Identifier[]{ExtremeSports.id("block/dirt_jump"), ExtremeSports.id("block/dirt_jump_side")};
		}
		return new Identifier[]{ExtremeSports.id("block/ramp_plywood"), ExtremeSports.id("block/ramp_plywood_side")};
	}

	record Unbaked(RampBlock block, BlockState state) implements BlockStateModel.UnbakedRoot {
		@Override
		public void resolveDependencies(ResolvableModel.Resolver resolver) {
		}

		@Override
		public BlockStateModel bake(BlockState blockState, ModelBaker baker) {
			Identifier[] names = textures(block);
			TextureAtlasSprite top = baker.sprites().get(new Material(TextureAtlas.LOCATION_BLOCKS, names[0]), () -> "extremesports ramp");
			TextureAtlasSprite side = baker.sprites().get(new Material(TextureAtlas.LOCATION_BLOCKS, names[1]), () -> "extremesports ramp");
			TextureAtlasSprite coping = baker.sprites().get(new Material(TextureAtlas.LOCATION_BLOCKS, ExtremeSports.id("block/coping")), () -> "extremesports ramp");
			Mesh mesh = build(block, blockState, top, side, coping);
			return new Baked(new SimpleModelWrapper(new MeshBakedGeometry(mesh), true, top), top);
		}

		@Override
		public Object visualEqualityGroup(BlockState blockState) {
			return blockState;
		}
	}

	record Baked(BlockModelPart part, TextureAtlasSprite particle) implements BlockStateModel {
		@Override
		public void collectParts(RandomSource random, List<BlockModelPart> parts) {
			parts.add(part);
		}

		@Override
		public TextureAtlasSprite particleIcon() {
			return particle;
		}
	}

	// ------------------------------------------------------------------ geometry

	static Mesh build(RampBlock block, BlockState state, TextureAtlasSprite top, TextureAtlasSprite side, TextureAtlasSprite coping) {
		MutableMesh mesh = Renderer.get().mutableMesh();
		QuadEmitter emitter = mesh.emitter();
		RampProfile profile = block.profile();
		StairsShape shape = state.getValue(RampBlock.SHAPE);
		boolean corner = shape != StairsShape.STRAIGHT;
		boolean linear = !profile.curved && !corner;
		int n = linear ? 1 : profile.curved ? 10 : 6;
		int nx = n;
		int nz = n;
		Direction facing = state.getValue(RampBlock.FACING);
		if (!corner) {
			// Straight ramps only vary along the uphill axis
			if (facing.getAxis() == Direction.Axis.X) {
				nz = 1;
			} else {
				nx = 1;
			}
		}
		// Riding surface
		for (int i = 0; i < nx; i++) {
			for (int k = 0; k < nz; k++) {
				float x0 = (float) i / nx;
				float x1 = (float) (i + 1) / nx;
				float z0 = (float) k / nz;
				float z1 = (float) (k + 1) / nz;
				Vector3f[] v = {
					new Vector3f(x0, h(block, state, x0, z0), z0),
					new Vector3f(x0, h(block, state, x0, z1), z1),
					new Vector3f(x1, h(block, state, x1, z1), z1),
					new Vector3f(x1, h(block, state, x1, z0), z0)
				};
				float[][] uv = {{x0, z0}, {x0, z1}, {x1, z1}, {x1, z0}};
				quad(emitter, top, v, uv, new Vector3f(0, 1, 0), Direction.UP, null);
			}
		}
		// Side walls following the profile
		int strips = linear ? 1 : 10;
		for (Direction dir : Direction.Plane.HORIZONTAL) {
			for (int s = 0; s < strips; s++) {
				float a0 = (float) s / strips;
				float a1 = (float) (s + 1) / strips;
				float[] p0 = edgePoint(dir, a0);
				float[] p1 = edgePoint(dir, a1);
				float h0 = h(block, state, p0[0], p0[1]);
				float h1 = h(block, state, p1[0], p1[1]);
				if (h0 < 0.002F && h1 < 0.002F) {
					continue;
				}
				Vector3f[] v = {
					new Vector3f(p0[0], 0, p0[1]),
					new Vector3f(p1[0], 0, p1[1]),
					new Vector3f(p1[0], h1, p1[1]),
					new Vector3f(p0[0], h0, p0[1])
				};
				float[][] uv = {{a0, 1.0F}, {a1, 1.0F}, {a1, 1.0F - h1}, {a0, 1.0F - h0}};
				quad(emitter, side, v, uv, new Vector3f(dir.getStepX(), 0, dir.getStepZ()), dir, null);
			}
		}
		// Base
		Vector3f[] base = {new Vector3f(0, 0, 0), new Vector3f(1, 0, 0), new Vector3f(1, 0, 1), new Vector3f(0, 0, 1)};
		quad(emitter, side, base, new float[][]{{0, 0}, {1, 0}, {1, 1}, {0, 1}}, new Vector3f(0, -1, 0), Direction.DOWN, Direction.DOWN);
		// Coping along lips
		if (block.hasCoping() && shape != StairsShape.OUTER_LEFT && shape != StairsShape.OUTER_RIGHT) {
			float topY = (float) profile.height(block.part(state), 1.0);
			copingTube(emitter, coping, facing, topY);
			Direction second = RampBlock.cornerDirection(facing, shape);
			if (second != null) {
				copingTube(emitter, coping, second, topY);
			}
		}
		return mesh.immutableCopy();
	}

	private static float h(RampBlock block, BlockState state, float x, float z) {
		return (float) Math.min(1.0, Math.max(0.0, block.height(state, x, z)));
	}

	/** Point along a block edge (a in 0..1) as {x, z}. */
	private static float[] edgePoint(Direction dir, float a) {
		return switch (dir) {
			case NORTH -> new float[]{a, 0.0F};
			case SOUTH -> new float[]{a, 1.0F};
			case WEST -> new float[]{0.0F, a};
			default -> new float[]{1.0F, a};
		};
	}

	private static void copingTube(QuadEmitter emitter, TextureAtlasSprite sprite, Direction edge, float topY) {
		float t = 2.2F / 16.0F;
		float y1 = topY + 0.6F / 16.0F;
		float y0 = y1 - t;
		// Tube runs along the edge on the uphill side of the block
		float in0;
		float in1;
		boolean alongX = edge.getAxis() == Direction.Axis.Z;
		if (edge == Direction.NORTH || edge == Direction.WEST) {
			in0 = 0.0F;
			in1 = t;
		} else {
			in0 = 1.0F - t;
			in1 = 1.0F;
		}
		Vector3f[][] faces;
		if (alongX) {
			faces = new Vector3f[][]{
				{new Vector3f(0, y1, in0), new Vector3f(0, y1, in1), new Vector3f(1, y1, in1), new Vector3f(1, y1, in0)},
				{new Vector3f(0, y0, in0), new Vector3f(1, y0, in0), new Vector3f(1, y1, in0), new Vector3f(0, y1, in0)},
				{new Vector3f(0, y0, in1), new Vector3f(0, y1, in1), new Vector3f(1, y1, in1), new Vector3f(1, y0, in1)}
			};
		} else {
			faces = new Vector3f[][]{
				{new Vector3f(in0, y1, 0), new Vector3f(in0, y1, 1), new Vector3f(in1, y1, 1), new Vector3f(in1, y1, 0)},
				{new Vector3f(in0, y0, 0), new Vector3f(in0, y1, 0), new Vector3f(in0, y1, 1), new Vector3f(in0, y0, 1)},
				{new Vector3f(in1, y0, 0), new Vector3f(in1, y0, 1), new Vector3f(in1, y1, 1), new Vector3f(in1, y1, 0)}
			};
		}
		Vector3f[] normals = alongX
			? new Vector3f[]{new Vector3f(0, 1, 0), new Vector3f(0, 0, -1), new Vector3f(0, 0, 1)}
			: new Vector3f[]{new Vector3f(0, 1, 0), new Vector3f(-1, 0, 0), new Vector3f(1, 0, 0)};
		float[][] uv = {{0, 0}, {0, 0.25F}, {1, 0.25F}, {1, 0}};
		for (int i = 0; i < faces.length; i++) {
			quad(emitter, sprite, faces[i], uv, normals[i], null, null);
		}
	}

	/** Emits a quad, flipping the winding so it faces {@code outward}. */
	private static void quad(QuadEmitter emitter, TextureAtlasSprite sprite, Vector3f[] v, float[][] uv, Vector3f outward,
							 Direction nominal, Direction cull) {
		Vector3f e1 = new Vector3f(v[1]).sub(v[0]);
		Vector3f e2 = new Vector3f(v[2]).sub(v[0]);
		Vector3f normal = e1.cross(e2);
		if (normal.lengthSquared() < 1.0E-10F) {
			e1 = new Vector3f(v[2]).sub(v[0]);
			e2 = new Vector3f(v[3]).sub(v[0]);
			normal = e1.cross(e2);
		}
		boolean flip = normal.dot(outward) < 0.0F;
		for (int i = 0; i < 4; i++) {
			int index = flip ? 3 - i : i;
			emitter.pos(i, v[index].x, v[index].y, v[index].z);
			emitter.uv(i, uv[index][0], uv[index][1]);
		}
		emitter.spriteBake(sprite, MutableQuadView.BAKE_NORMALIZED);
		emitter.color(-1, -1, -1, -1);
		emitter.nominalFace(nominal);
		emitter.cullFace(cull);
		emitter.emit();
	}
}
