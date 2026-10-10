package com.blademode.client.render;

import com.blademode.geom.BlockGeometry;
import com.blademode.geom.ConvexPart;
import com.blademode.geom.Plane;
import com.blademode.geom.Poly;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.registry.StrippableBlockRegistry;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.builders.UVPair;
import net.minecraft.client.renderer.ItemBlockRenderTypes;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.block.model.BlockModelPart;
import net.minecraft.client.renderer.block.model.BlockStateModel;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.ARGB;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.AABB;
import org.joml.Vector3d;
import org.joml.Vector3fc;
import org.jspecify.annotations.Nullable;

/**
 * Builds the visible geometry of a cut block: the block's real model with every quad clipped
 * against the cut planes, plus textured cap faces where the blade went through.
 */
public final class ClippedMesher {
	private static final Direction[] CULL_DIRS = {null, Direction.DOWN, Direction.UP, Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST};

	/** Output meshes: one for alpha-tested geometry, one for translucent geometry. */
	public record Target(BlockMesh cutout, BlockMesh translucent) {
		public Target() {
			this(new BlockMesh(), new BlockMesh());
		}
	}

	private ClippedMesher() {
	}

	/**
	 * Adds one block to the meshes.
	 *
	 * @param ox,oy,oz offset of the block's [0,1]^3 cell in mesh space
	 * @param group    light group index for this block
	 * @param culled   faces (by cull direction) hidden by neighbours
	 * @param tintView world used for biome tints (may be null)
	 */
	public static void addBlock(Target out, BlockState state, List<Plane> planes, float ox, float oy, float oz, int group, long seed,
		Predicate<Direction> culled, @Nullable BlockAndTintGetter tintView, @Nullable BlockPos tintPos) {
		Minecraft mc = Minecraft.getInstance();
		BlockStateModel model = mc.getBlockRenderer().getBlockModel(state);
		BlockMesh mesh = ItemBlockRenderTypes.getChunkRenderType(state) == ChunkSectionLayer.TRANSLUCENT ? out.translucent : out.cutout;
		RandomSource random = RandomSource.create(seed);
		List<BlockModelPart> parts = model.collectParts(random);

		if (state.getRenderShape() == RenderShape.MODEL) {
			for (BlockModelPart part : parts) {
				for (Direction dir : CULL_DIRS) {
					if (dir != null && culled.test(dir)) {
						continue;
					}
					for (BakedQuad quad : part.getQuads(dir)) {
						addQuad(mesh, quad, planes, ox, oy, oz, group, tint(state, quad.tintIndex(), tintView, tintPos));
					}
				}
			}
		} else if (!planes.isEmpty()) {
			// Block-entity rendered blocks (chests...) can't be clipped; show a textured solid instead.
			TextureAtlasSprite sprite = model.particleIcon();
			for (AABB box : BlockGeometry.outlineBoxes(state)) {
				ConvexPart cp = new ConvexPart(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, planes);
				for (ConvexPart.Face face : cp.faces) {
					if (!face.isCap()) {
						addPolygon(mesh, face.poly(), face.normal(), sprite, ox, oy, oz, group, -1, false);
					}
				}
			}
		}

		if (planes.isEmpty()) {
			return;
		}
		for (AABB box : BlockGeometry.outlineBoxes(state)) {
			ConvexPart cp = new ConvexPart(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, planes);
			for (ConvexPart.Face face : cp.faces) {
				if (!face.isCap()) {
					continue;
				}
				CapTexture cap = capTexture(state, model, parts, face.normal());
				int color = cap.tintIndex >= 0 ? tint(state, cap.tintIndex, tintView, tintPos) : -1;
				addPolygon(mesh, face.poly(), face.normal(), cap.sprite, ox, oy, oz, group, color, true);
			}
		}
	}

	private static int tint(BlockState state, int tintIndex, @Nullable BlockAndTintGetter view, @Nullable BlockPos pos) {
		if (tintIndex < 0) {
			return -1;
		}
		int c = Minecraft.getInstance().getBlockColors().getColor(state, view, pos, tintIndex);
		return c == -1 ? -1 : ARGB.opaque(c);
	}

	private static void addQuad(BlockMesh mesh, BakedQuad quad, List<Plane> planes, float ox, float oy, float oz, int group, int color) {
		Poly poly = new Poly(5, 4);
		for (int i = 0; i < 4; i++) {
			Vector3fc p = quad.position(i);
			long uv = quad.packedUV(i);
			poly.add(p.x(), p.y(), p.z(), UVPair.unpackU(uv), UVPair.unpackV(uv));
		}
		Poly clipped = planes.isEmpty() ? poly : poly.clipAll(planes);
		if (clipped == null) {
			return;
		}
		Vector3d n = clipped.newell(new Vector3d());
		if (n.lengthSquared() < 1.0E-14) {
			return;
		}
		n.normalize();
		emitFan(mesh, clipped, (float) n.x, (float) n.y, (float) n.z, ox, oy, oz, group, color, quad.lightEmission(), false);
	}

	/** Polygon (stride 3) textured by projecting onto the cube face closest to its normal. */
	private static void addPolygon(BlockMesh mesh, Poly poly, Vector3d normal, TextureAtlasSprite sprite, float ox, float oy, float oz, int group, int color, boolean cap) {
		double ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
		Poly textured = new Poly(5, poly.count);
		for (int i = 0; i < poly.count; i++) {
			double x = poly.x(i), y = poly.y(i), z = poly.z(i);
			double u, v;
			if (ay >= ax && ay >= az) {
				u = x;
				v = normal.y > 0 ? z : 1 - z;
			} else if (ax >= az) {
				u = normal.x > 0 ? 1 - z : z;
				v = 1 - y;
			} else {
				u = normal.z > 0 ? x : 1 - x;
				v = 1 - y;
			}
			u = Math.max(0, Math.min(1, u));
			v = Math.max(0, Math.min(1, v));
			textured.add(x, y, z, sprite.getU((float) u), sprite.getV((float) v));
		}
		emitFan(mesh, textured, (float) normal.x, (float) normal.y, (float) normal.z, ox, oy, oz, group, color, 0, cap);
	}

	private static void emitFan(BlockMesh mesh, Poly p, float nx, float ny, float nz, float ox, float oy, float oz, int group, int color, int emission, boolean cap) {
		int c = color == -1 ? 0xFFFFFFFF : color;
		// Quads (0, i, i+1, i+2); a leftover triangle becomes a quad with a repeated vertex.
		for (int i = 1; i + 1 < p.count; i += 2) {
			int i2 = Math.min(i + 2, p.count - 1);
			int[] idx = {0, i, i + 1, i2};
			for (int k : idx) {
				mesh.vertex((float) p.x(k) + ox, (float) p.y(k) + oy, (float) p.z(k) + oz,
					(float) p.get(k, 3), (float) p.get(k, 4), nx, ny, nz, c, group, emission, cap);
			}
		}
	}

	private record CapTexture(TextureAtlasSprite sprite, int tintIndex) {
	}

	/** What the inside of a block looks like: end grain across logs, stripped wood along them, else the particle texture. */
	private static CapTexture capTexture(BlockState state, BlockStateModel model, List<BlockModelPart> parts, Vector3d normal) {
		if (state.hasProperty(BlockStateProperties.AXIS)) {
			Direction.Axis axis = state.getValue(BlockStateProperties.AXIS);
			double along = Math.abs(axis.choose(normal.x, normal.y, normal.z));
			if (along > 0.6) {
				BakedQuad end = firstQuad(parts, Direction.fromAxisAndDirection(axis, Direction.AxisDirection.POSITIVE));
				if (end != null) {
					return new CapTexture(end.sprite(), end.tintIndex());
				}
			} else {
				BlockState stripped = StrippableBlockRegistry.getStrippedBlockState(state);
				BlockState source = stripped != null ? stripped : state;
				List<BlockModelPart> sp = stripped != null
					? Minecraft.getInstance().getBlockRenderer().getBlockModel(stripped).collectParts(RandomSource.create(0))
					: parts;
				Direction side = axis == Direction.Axis.Y ? Direction.NORTH : Direction.UP;
				BakedQuad sideQuad = firstQuad(sp, side);
				if (sideQuad != null) {
					return new CapTexture(sideQuad.sprite(), source == state ? sideQuad.tintIndex() : -1);
				}
			}
		}
		TextureAtlasSprite particle = model.particleIcon();
		int tint = -1;
		outer:
		for (BlockModelPart part : parts) {
			for (Direction dir : CULL_DIRS) {
				for (BakedQuad q : part.getQuads(dir)) {
					if (q.sprite() == particle) {
						tint = q.tintIndex();
						break outer;
					}
				}
			}
		}
		return new CapTexture(particle, tint);
	}

	private static @Nullable BakedQuad firstQuad(List<BlockModelPart> parts, Direction dir) {
		for (BlockModelPart part : parts) {
			List<BakedQuad> quads = part.getQuads(dir);
			if (!quads.isEmpty()) {
				return quads.getFirst();
			}
		}
		for (BlockModelPart part : parts) {
			for (BakedQuad q : part.getQuads(null)) {
				if (q.direction() == dir) {
					return q;
				}
			}
		}
		return null;
	}
}
