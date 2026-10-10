package com.blademode.client.render;

import com.blademode.geom.BlockGeometry;
import com.blademode.piece.PieceBlock;
import com.blademode.piece.PieceBody;
import com.blademode.piece.PieceData;
import com.blademode.piece.PieceEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import it.unimi.dsi.fastutil.longs.Long2IntOpenHashMap;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.Sheets;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;
import org.joml.Vector3f;
import org.jspecify.annotations.Nullable;

/** Renders a falling piece: every block's (clipped) model, rotated with the rigid body and lit per block. */
public class PieceRenderer extends EntityRenderer<PieceEntity, PieceRenderer.State> {
	public static final class State extends EntityRenderState {
		@Nullable MeshCache mesh;
		final Quaternionf rotation = new Quaternionf();
		int[] lights = new int[0];
		float glow;
	}

	/** Geometry built once per piece shape, kept on the entity. */
	static final class MeshCache {
		final PieceData data;
		final ClippedMesher.Target target = new ClippedMesher.Target();
		final List<Special> specials = new ArrayList<>();
		/** Body-frame centre of each block (light probes). */
		final float[] centers;
		int[] lights = new int[0];
		int lightTick = Integer.MIN_VALUE;

		MeshCache(PieceData data, PieceBody body, Level level, BlockPos tintPos) {
			this.data = data;
			Vec3 off = data.gridOffset();
			List<PieceBlock> blocks = data.blocks();
			Long2IntOpenHashMap index = new Long2IntOpenHashMap();
			index.defaultReturnValue(-1);
			for (int i = 0; i < blocks.size(); i++) {
				index.put(blocks.get(i).pos().asLong(), i);
			}
			this.centers = new float[blocks.size() * 3];
			for (int i = 0; i < blocks.size(); i++) {
				PieceBlock b = blocks.get(i);
				BlockPos cell = b.pos();
				float ox = (float) (cell.getX() + off.x);
				float oy = (float) (cell.getY() + off.y);
				float oz = (float) (cell.getZ() + off.z);
				this.centers[i * 3] = ox + 0.5F;
				this.centers[i * 3 + 1] = oy + 0.5F;
				this.centers[i * 3 + 2] = oz + 0.5F;
				BlockState state = b.state();
				if (state.getRenderShape() != RenderShape.MODEL && !b.isCut()) {
					this.specials.add(new Special(state, ox, oy, oz, i));
					continue;
				}
				ClippedMesher.addBlock(this.target, state, b.planes(), ox, oy, oz, i, cell.asLong(),
					dir -> hiddenBy(blocks, index, cell, dir), level, tintPos);
			}
		}

		private static boolean hiddenBy(List<PieceBlock> blocks, Long2IntOpenHashMap index, BlockPos cell, Direction dir) {
			int j = index.get(cell.relative(dir).asLong());
			if (j < 0) {
				return false;
			}
			PieceBlock n = blocks.get(j);
			return !n.isCut() && n.state().isSolidRender() && BlockGeometry.isFullCube(n.state());
		}
	}

	record Special(BlockState state, float x, float y, float z, int group) {
	}

	public PieceRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.shadowRadius = 0.0F;
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	protected AABB getBoundingBoxForCulling(PieceEntity entity) {
		return entity.getBoundingBox();
	}

	@Override
	public void extractRenderState(PieceEntity entity, State state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		PieceData data = entity.getPieceData();
		if (data.isEmpty()) {
			state.mesh = null;
			return;
		}
		MeshCache cache = entity.renderCache instanceof MeshCache m && m.data == data ? m : null;
		if (cache == null) {
			cache = new MeshCache(data, entity.body(), entity.level(), entity.blockPosition());
			entity.renderCache = cache;
		}
		state.mesh = cache;
		entity.getRenderRotation(partialTick, state.rotation);

		// Light each block from where it currently is (refreshed once per tick).
		if (cache.lightTick != entity.tickCount || cache.lights.length != data.blocks().size()) {
			cache.lightTick = entity.tickCount;
			int n = data.blocks().size();
			if (cache.lights.length != n) {
				cache.lights = new int[n];
			}
			Level level = entity.level();
			Vector3f v = new Vector3f();
			BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
			for (int i = 0; i < n; i++) {
				v.set(cache.centers[i * 3], cache.centers[i * 3 + 1], cache.centers[i * 3 + 2]);
				state.rotation.transform(v);
				pos.set(Math.floor(state.x + v.x), Math.floor(state.y + v.y), Math.floor(state.z + v.z));
				int light = LevelRenderer.getLightColor(level, pos);
				if (light == 0 || level.getBlockState(pos).isSolidRender()) {
					light = Math.max(light, LevelRenderer.getLightColor(level, pos.move(Direction.UP)));
				}
				cache.lights[i] = light;
			}
		}
		state.lights = cache.lights.clone();
		state.glow = GlowTimer.glow(entity.getCutTime(), entity.level().getGameTime(), partialTick);
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		MeshCache mesh = state.mesh;
		if (mesh == null) {
			return;
		}
		poseStack.pushPose();
		poseStack.mulPose(state.rotation);
		int[] lights = state.lights;
		float glow = state.glow;
		BlockMesh cutout = mesh.target.cutout();
		BlockMesh translucent = mesh.target.translucent();
		if (!cutout.isEmpty()) {
			collector.submitCustomGeometry(poseStack, Sheets.cutoutBlockSheet(), (pose, consumer) -> cutout.emit(pose, consumer, lights, glow));
		}
		if (!translucent.isEmpty()) {
			collector.submitCustomGeometry(poseStack, Sheets.translucentBlockItemSheet(), (pose, consumer) -> translucent.emit(pose, consumer, lights, glow));
		}
		for (Special s : mesh.specials) {
			poseStack.pushPose();
			poseStack.translate(s.x, s.y, s.z);
			int light = s.group < lights.length ? lights[s.group] : LightTexture.FULL_BRIGHT;
			collector.submitBlock(poseStack, s.state, light, OverlayTexture.NO_OVERLAY, 0);
			poseStack.popPose();
		}
		poseStack.popPose();
		super.submit(state, poseStack, collector, camera);
	}
}
