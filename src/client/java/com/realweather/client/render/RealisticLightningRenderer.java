package com.realweather.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.weather.CloudLayer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.culling.Frustum;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.LightningBoltRenderer;
import net.minecraft.client.renderer.entity.state.LightningBoltRenderState;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LightningBolt;

/**
 * Renders vanilla lightning entities as tall, branching bolts reaching up to the actual cloud base, flickering
 * through several return strokes. Falls back to the vanilla renderer when disabled in the config.
 */
public final class RealisticLightningRenderer extends EntityRenderer<LightningBolt, RealisticLightningRenderer.State> {
	private static final double MAX_RENDER_DISTANCE = 512.0;
	private final LightningBoltRenderer vanilla;

	public static final class State extends LightningBoltRenderState {
		long channelSeed;
		float age;
		float height;
	}

	public RealisticLightningRenderer(EntityRendererProvider.Context context) {
		super(context);
		this.vanilla = new LightningBoltRenderer(context);
	}

	@Override
	public State createRenderState() {
		return new State();
	}

	@Override
	public void extractRenderState(LightningBolt bolt, State state, float partialTick) {
		super.extractRenderState(bolt, state, partialTick);
		state.seed = bolt.seed;
		// The channel stays the same through re-strikes (vanilla re-rolls its seed for every flash).
		state.channelSeed = bolt.getUUID().getLeastSignificantBits() ^ bolt.getUUID().getMostSignificantBits();
		state.age = bolt.tickCount + partialTick;
		ClientWeather weather = ClientWeather.get();
		float base = Minecraft.getInstance().level != null
			? CloudLayer.baseHeight(CloudLayer.vanillaHeight(Minecraft.getInstance().level), weather.cloudCover(partialTick), weather.storm(partialTick),
				weather.precipitation(partialTick))
			: 160.0F;
		state.height = Mth.clamp(base - (float) bolt.getY(), 60.0F, 320.0F);
	}

	@Override
	public boolean shouldRender(LightningBolt bolt, Frustum frustum, double x, double y, double z) {
		return bolt.distanceToSqr(x, y, z) < MAX_RENDER_DISTANCE * MAX_RENDER_DISTANCE;
	}

	@Override
	protected boolean affectedByCulling(LightningBolt bolt) {
		return false;
	}

	@Override
	public void submit(State state, PoseStack poseStack, SubmitNodeCollector collector, CameraRenderState camera) {
		if (!ClientConfig.get().customLightning) {
			this.vanilla.submit(state, poseStack, collector, camera);
			return;
		}
		float brightness = strokeBrightness(state.channelSeed, state.age);
		if (brightness <= 0.01F) {
			return;
		}
		// Drawn in the weather pass after the rain (see DistantLightning), not with the other entities.
		DistantLightning.queueEntityBolt(state.channelSeed, state.x, state.y, state.z, state.height, brightness);
	}

	/** Bright first stroke, then flickering re-strikes of varying strength. */
	static float strokeBrightness(long seed, float ageTicks) {
		float age = ageTicks / 20.0F;
		int phase = (int) (ageTicks / 1.5F);
		float flicker = 0.55F + 0.45F * (((seed >>> (phase % 48)) & 1L) == 0L ? 1.0F : 0.35F);
		float envelope = age < 0.08F ? 1.0F : (float) Math.exp(-(age - 0.08F) / 0.55F);
		return Math.max(0.0F, envelope * flicker);
	}
}
