package com.blademode.client.render;

import com.blademode.block.CutBlockEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.Sheets;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.BlockEntityRendererProvider;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.feature.ModelFeatureRenderer;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Draws what is left of a cut block: its original model clipped by the cut planes, plus cap faces. */
public class CutBlockRenderer implements BlockEntityRenderer<CutBlockEntity, CutBlockRenderer.State> {
	public static final class State extends BlockEntityRenderState {
		ClippedMesher.@Nullable Target mesh;
		float glow;
	}

	public CutBlockRenderer(BlockEntityRendererProvider.Context context) {
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(CutBlockEntity be, State state, float partialTick, Vec3 cameraPos, ModelFeatureRenderer.@Nullable CrumblingOverlay crumbling) {
		BlockEntityRenderer.super.extractRenderState(be, state, partialTick, cameraPos, crumbling);
		ClippedMesher.Target mesh = be.renderCache instanceof ClippedMesher.Target t ? t : null;
		if (mesh == null) {
			mesh = new ClippedMesher.Target();
			ClippedMesher.addBlock(mesh, be.getOriginal(), be.getPlanes(), 0, 0, 0, 0, be.getBlockPos().asLong(),
				dir -> false, be.getLevel(), be.getBlockPos());
			be.renderCache = mesh;
		}
		state.mesh = mesh;
		long now = be.getLevel() != null ? be.getLevel().getGameTime() : 0;
		state.glow = GlowTimer.glow(be.getCutTime(), now, partialTick);
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		ClippedMesher.Target mesh = state.mesh;
		if (mesh == null) {
			return;
		}
		int[] lights = {state.lightCoords};
		float glow = state.glow;
		if (!mesh.cutout().isEmpty()) {
			collector.submitCustomGeometry(poseStack, Sheets.cutoutBlockSheet(), (pose, consumer) -> mesh.cutout().emit(pose, consumer, lights, glow));
		}
		if (!mesh.translucent().isEmpty()) {
			collector.submitCustomGeometry(poseStack, Sheets.translucentBlockItemSheet(), (pose, consumer) -> mesh.translucent().emit(pose, consumer, lights, glow));
		}
	}

	@Override
	public int getViewDistance() {
		return Minecraft.getInstance().options.getEffectiveRenderDistance() * 16;
	}
}
