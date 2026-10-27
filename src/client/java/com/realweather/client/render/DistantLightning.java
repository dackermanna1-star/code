package com.realweather.client.render;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.renderer.MultiBufferSource;
import org.joml.Matrix4f;

/** Far-away, purely visual cloud-to-ground bolts announced by the server. */
public final class DistantLightning {
	private static final List<Bolt> BOLTS = new ArrayList<>();
	private static final Matrix4f IDENTITY = new Matrix4f();

	private record Bolt(ClientWeather.Flash flash, double x, double y, double z, float height) {
	}

	private DistantLightning() {
	}

	public static void add(ClientWeather.Flash flash, double x, double y, double z, float height) {
		if (BOLTS.size() > 12) {
			BOLTS.removeFirst();
		}
		BOLTS.add(new Bolt(flash, x, y, z, height));
	}

	public static void clear() {
		BOLTS.clear();
	}

	public static void render(MultiBufferSource buffers, double cameraX, double cameraY, double cameraZ, float partialTick) {
		if (BOLTS.isEmpty()) {
			return;
		}
		ClientWeather weather = ClientWeather.get();
		BOLTS.removeIf(bolt -> weather.clientTicks() - bolt.flash.startTick() > 40);
		if (!ClientConfig.get().customLightning) {
			return;
		}
		VertexConsumer consumer = null;
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
