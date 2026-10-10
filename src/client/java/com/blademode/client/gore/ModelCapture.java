package com.blademode.client.gore;

import com.blademode.BladeMode;
import com.blademode.gore.Piece;
import com.mojang.blaze3d.vertex.PoseStack;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import org.joml.Vector3d;
import org.jspecify.annotations.Nullable;

/** Freezes how a creature looks right now: every model part its renderer draws, posed. */
final class ModelCapture {
	private static boolean warned;

	/**
	 * @param anchor absolute world position the pieces' transforms are relative to
	 */
	record Snapshot(Vector3d anchor, List<CaptureCollector.Layer> layers, List<Piece> pieces) {
	}

	private ModelCapture() {
	}

	@SuppressWarnings("unchecked")
	static @Nullable Snapshot capture(Entity entity, float partialTick) {
		try {
			EntityRenderDispatcher dispatcher = Minecraft.getInstance().getEntityRenderDispatcher();
			EntityRenderer<Entity, EntityRenderState> renderer = (EntityRenderer<Entity, EntityRenderState>) (EntityRenderer<?, ?>) dispatcher.getRenderer(entity);
			EntityRenderState state = dispatcher.extractEntity(entity, partialTick);
			if (state instanceof LivingEntityRenderState living) {
				// The pose the blade found it in: not tipping over, not flashing red.
				living.deathTime = 0.0F;
				living.hasRedOverlay = false;
			}
			state.nameTag = null;
			PoseStack poseStack = new PoseStack();
			Vec3 offset = renderer.getRenderOffset(state);
			poseStack.translate(offset.x, offset.y, offset.z);
			CaptureCollector collector = new CaptureCollector();
			renderer.submit(state, poseStack, collector, new CameraRenderState());
			if (collector.pieces.isEmpty()) {
				return null;
			}
			return new Snapshot(new Vector3d(state.x, state.y, state.z), List.copyOf(collector.layers), List.copyOf(collector.pieces));
		} catch (RuntimeException e) {
			if (!warned) {
				warned = true;
				BladeMode.LOGGER.error("Could not capture the model of {}; it dies the ordinary way", entity, e);
			}
			return null;
		}
	}
}
