package com.realweather.client.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.renderer.MultiBufferSource;
import org.joml.Matrix4f;

/**
 * Draws lightning channels in the weather pass, after the precipitation, so a bolt shines through the rain instead
 * of being dimmed by every rain sheet in front of it: far-away, purely visual bolts announced by the server, and the
 * bolts of nearby lightning entities queued by {@link RealisticLightningRenderer} for the current frame.
 */
public final class DistantLightning {
	private static final List<Bolt> BOLTS = new ArrayList<>();
	private static final List<EntityBolt> ENTITY_BOLTS = new ArrayList<>();
	private static final Matrix4f IDENTITY = new Matrix4f();

	private record Bolt(ClientWeather.Flash flash, double x, double y, double z, float height) {
	}

	private record EntityBolt(long seed, double x, double y, double z, float height, float brightness) {
	}

	private DistantLightning() {
	}

	public static void add(ClientWeather.Flash flash, double x, double y, double z, float height) {
		if (BOLTS.size() > 12) {
			BOLTS.removeFirst();
		}
		BOLTS.add(new Bolt(flash, x, y, z, height));
	}

	/** Queues a lightning entity's channel for this frame's weather pass. */
	public static void queueEntityBolt(long seed, double x, double y, double z, float height, float brightness) {
		if (ENTITY_BOLTS.size() < 16) {
			ENTITY_BOLTS.add(new EntityBolt(seed, x, y, z, height, brightness));
		}
	}

	public static void clear() {
		BOLTS.clear();
		ENTITY_BOLTS.clear();
	}

	public static void render(MultiBufferSource buffers, double cameraX, double cameraY, double cameraZ, float partialTick) {
		if (BOLTS.isEmpty() && ENTITY_BOLTS.isEmpty()) {
			return;
		}
		ClientWeather weather = ClientWeather.get();
		BOLTS.removeIf(bolt -> weather.clientTicks() - bolt.flash.startTick() > 40);
		if (!ClientConfig.get().customLightning) {
			ENTITY_BOLTS.clear();
			return;
		}
		VertexConsumer consumer = null;
		for (EntityBolt bolt : ENTITY_BOLTS) {
			if (consumer == null) {
				consumer = buffers.getBuffer(RealWeatherRenderTypes.lightning());
			}
			Matrix4f pose = new Matrix4f(IDENTITY).translate((float) (bolt.x - cameraX), (float) (bolt.y - cameraY), (float) (bolt.z - cameraZ));
			LightningGeometry.emit(consumer, pose, LightningGeometry.get(bolt.seed, bolt.height),
				(float) (cameraX - bolt.x), (float) (cameraY - bolt.y), (float) (cameraZ - bolt.z), bolt.brightness);
		}
		ENTITY_BOLTS.clear();
		for (Bolt bolt : BOLTS) {
			float brightness = weather.flashEnvelope(bolt.flash, partialTick);
			if (brightness <= 0.02F) {
				continue;
			}
			if (consumer == null) {
				consumer = buffers.getBuffer(RealWeatherRenderTypes.lightning());
			}
			Matrix4f pose = new Matrix4f(IDENTITY).translate((float) (bolt.x - cameraX), (float) (bolt.y - cameraY), (float) (bolt.z - cameraZ));
			LightningGeometry.emit(consumer, pose, LightningGeometry.get(bolt.flash.seed(), bolt.height),
				(float) (cameraX - bolt.x), (float) (cameraY - bolt.y), (float) (cameraZ - bolt.z), Math.min(1.0F, brightness));
		}
	}
}
