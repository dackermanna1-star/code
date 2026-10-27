package com.realweather.client.render;

import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.buffers.Std140Builder;
import com.mojang.blaze3d.buffers.Std140SizeCalculator;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.shaders.UniformType;
import com.mojang.blaze3d.systems.RenderPass;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.MeshData;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.realweather.RealWeather;
import com.realweather.client.config.ClientConfig;
import com.realweather.client.weather.ClientWeather;
import com.realweather.client.weather.CloudLayer;
import java.util.OptionalDouble;
import java.util.OptionalInt;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.MappableRingBuffer;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.attribute.EnvironmentAttributes;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;
import org.jspecify.annotations.Nullable;

/**
 * Ray-marched volumetric clouds.
 *
 * <p>A camera-centred proxy box spanning the cloud layer is rasterized (outward faces when the camera is below or
 * above the layer, inward faces when inside it), and the fragment shader marches through the layer evaluating the
 * same noise field as {@link com.realweather.weather.CloudNoise}. This gives soft, lit, layered clouds with
 * correct occlusion by terrain (early depth test on the proxy) at a cost that scales with the quality preset.
 */
public final class VolumetricClouds implements AutoCloseable {
	public static final RenderPipeline PIPELINE = RenderPipeline.builder()
		.withLocation(RealWeather.id("pipeline/volumetric_clouds"))
		.withVertexShader(RealWeather.id("core/volumetric_clouds"))
		.withFragmentShader(RealWeather.id("core/volumetric_clouds"))
		.withUniform("DynamicTransforms", UniformType.UNIFORM_BUFFER)
		.withUniform("Projection", UniformType.UNIFORM_BUFFER)
		.withUniform("Fog", UniformType.UNIFORM_BUFFER)
		.withUniform("Globals", UniformType.UNIFORM_BUFFER)
		.withUniform("RealWeatherClouds", UniformType.UNIFORM_BUFFER)
		.withBlend(BlendFunction.TRANSLUCENT_PREMULTIPLIED_ALPHA)
		.withDepthWrite(false)
		.withVertexFormat(DefaultVertexFormat.POSITION, VertexFormat.Mode.QUADS)
		.build();

	private static final int UBO_SIZE = new Std140SizeCalculator()
		.putVec4().putVec4().putVec4().putVec4().putVec4().putVec4()
		.putVec4().putVec4().putVec4().putVec4().putVec4().putVec4()
		.get();

	private static @Nullable VolumetricClouds instance;

	private final GpuBuffer outsideBox;
	private final GpuBuffer insideBox;
	private final MappableRingBuffer ubo;
	private boolean failed;
	private int frame;

	private VolumetricClouds() {
		this.outsideBox = buildBox(false);
		this.insideBox = buildBox(true);
		this.ubo = new MappableRingBuffer(() -> "RealWeather clouds UBO", GpuBuffer.USAGE_UNIFORM | GpuBuffer.USAGE_MAP_WRITE, UBO_SIZE);
	}

	public static VolumetricClouds get() {
		if (instance == null) {
			instance = new VolumetricClouds();
		}
		return instance;
	}

	public static void shutdown() {
		if (instance != null) {
			instance.close();
			instance = null;
		}
	}

	/** Re-checks the shader after a resource reload (e.g. a broken resource pack override). */
	public static void onResourcesReloaded() {
		if (instance != null) {
			instance.failed = false;
		}
	}

	private static final float[][] FACES = {
		{-1, -1, 1, -1, -1, -1, 1, -1, -1, 1, -1, 1},
		{-1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1},
		{1, 1, -1, 1, -1, -1, -1, -1, -1, -1, 1, -1},
		{-1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1},
		{-1, 1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1},
		{1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1}
	};

	private static GpuBuffer buildBox(boolean inward) {
		VertexFormat format = DefaultVertexFormat.POSITION;
		try (ByteBufferBuilder bytes = ByteBufferBuilder.exactlySized(24 * format.getVertexSize())) {
			BufferBuilder builder = new BufferBuilder(bytes, VertexFormat.Mode.QUADS, format);
			for (float[] face : FACES) {
				for (int v = 0; v < 4; v++) {
					int i = inward ? 3 - v : v;
					builder.addVertex(face[i * 3], face[i * 3 + 1], face[i * 3 + 2]);
				}
			}
			try (MeshData mesh = builder.buildOrThrow()) {
				return RenderSystem.getDevice().createBuffer(() -> inward ? "RealWeather cloud box (inside)" : "RealWeather cloud box",
					GpuBuffer.USAGE_VERTEX, mesh.vertexBuffer());
			}
		}
	}

	/**
	 * Renders the clouds in place of vanilla's.
	 *
	 * @return false if the volumetric renderer is unavailable and vanilla clouds should be drawn instead
	 */
	public boolean render(int cloudColor, CloudStatus status, Vec3 camera, float partialTick) {
		ClientConfig config = ClientConfig.get();
		Minecraft minecraft = Minecraft.getInstance();
		ClientLevel level = minecraft.level;
		if (!config.volumetricClouds || this.failed || level == null) {
			return false;
		}
		if (!RenderSystem.getDevice().precompilePipeline(PIPELINE).isValid()) {
			RealWeather.LOGGER.error("Volumetric cloud shader failed to compile, falling back to vanilla clouds");
			this.failed = true;
			return false;
		}

		ClientWeather weather = ClientWeather.get();
		float cover = weather.cloudCover(partialTick);
		float storm = weather.storm(partialTick);
		float precipitation = weather.precipitation(partialTick);
		if (cover <= 0.005F) {
			return true;
		}

		float vanillaHeight = CloudLayer.vanillaHeight(level, camera);
		float base = CloudLayer.baseHeight(vanillaHeight, cover, storm, precipitation) - (float) camera.y;
		float top = base + CloudLayer.thickness(cover, storm, precipitation);
		float fadeDistance = Math.max(256.0F, Math.min(minecraft.options.cloudRange().get() * 16.0F,
			minecraft.gameRenderer.getMainCamera().attributeProbe().getValue(EnvironmentAttributes.CLOUD_FOG_END_DISTANCE, partialTick)));
		float extent = fadeDistance * 1.05F;
		boolean inside = base < 1.5F && top > -1.5F;

		int steps = config.effectiveCloudSteps();
		int lightSteps = config.qualityPreset().cloudLightSteps;
		if (status == CloudStatus.FAST) {
			steps = Math.max(10, steps / 2);
			lightSteps = 1;
		}

		var probe = minecraft.gameRenderer.getMainCamera().attributeProbe();
		float sunAngle = probe.getValue(EnvironmentAttributes.SUN_ANGLE, partialTick) * Mth.DEG_TO_RAD;
		float sunX = -Mth.sin(sunAngle);
		float sunY = Mth.cos(sunAngle);
		float day = Mth.clamp((sunY + 0.12F) / 0.32F, 0.0F, 1.0F);
		float lightX = day > 0.0F ? sunX : -sunX;
		float lightY = day > 0.0F ? sunY : -sunY;
		if (lightY < 0.05F) {
			lightY = 0.05F;
		}
		float lightLen = Mth.sqrt(lightX * lightX + lightY * lightY);
		lightX /= lightLen;
		lightY /= lightLen;
		float sunElevation = Mth.clamp(sunY / 0.35F, 0.0F, 1.0F);
		float lightR = Mth.lerp(day, 0.30F, 1.0F);
		float lightG = Mth.lerp(day, 0.34F, Mth.lerp(sunElevation, 0.62F, 0.97F));
		float lightB = Mth.lerp(day, 0.45F, Mth.lerp(sunElevation, 0.38F, 0.90F));
		// Self-shadowing in the shader darkens thick clouds; only towering storm clouds (anvils above) dim it further.
		float lightIntensity = Mth.lerp(day, 0.2F, 1.0F) * (1.0F - 0.35F * storm);

		int sky = probe.getValue(EnvironmentAttributes.SKY_COLOR, partialTick);
		int fog = probe.getValue(EnvironmentAttributes.FOG_COLOR, partialTick);
		float flashBoost = weather.flashBrightness(camera, partialTick) * config.flashBrightness;
		float skyR = ARGB.redFloat(sky) + flashBoost * 0.3F;
		float skyG = ARGB.greenFloat(sky) + flashBoost * 0.32F;
		float skyB = ARGB.blueFloat(sky) + flashBoost * 0.38F;
		float bottomDark = (1.0F - 0.55F * storm) * (1.0F - 0.2F * precipitation);
		float groundR = ARGB.redFloat(fog) * 0.62F * bottomDark;
		float groundG = ARGB.greenFloat(fog) * 0.62F * bottomDark;
		float groundB = ARGB.blueFloat(fog) * 0.66F * bottomDark;

		// Keep a little of the dimension's cloud tint (datapacks can recolour clouds) on top of physically based lighting.
		float albedo = 0.97F - 0.3F * storm - 0.08F * precipitation;
		float tintMax = Math.max(0.05F, Math.max(ARGB.redFloat(cloudColor), Math.max(ARGB.greenFloat(cloudColor), ARGB.blueFloat(cloudColor))));
		float albedoR = albedo * Mth.lerp(0.3F, 1.0F, ARGB.redFloat(cloudColor) / tintMax);
		float albedoG = albedo * Mth.lerp(0.3F, 1.0F, ARGB.greenFloat(cloudColor) / tintMax);
		float albedoB = albedo * Mth.lerp(0.3F, 1.0F, ARGB.blueFloat(cloudColor) / tintMax);
		float alpha = ARGB.alphaFloat(cloudColor);

		float flashX = 0.0F;
		float flashY = 0.0F;
		float flashZ = 0.0F;
		float flashIntensity = 0.0F;
		ClientWeather.Flash flash = weather.brightestFlash(partialTick);
		if (flash != null && config.flashBrightness > 0.0F) {
			flashX = (float) (flash.x() - camera.x);
			flashZ = (float) (flash.z() - camera.z);
			flashY = flash.bolt() ? base + 25.0F : base + (top - base) * 0.35F;
			flashIntensity = weather.flashEnvelope(flash, partialTick) * config.flashBrightness;
		}

		float time = (float) ((weather.clientTicks() + partialTick) / 20.0 % 4096.0);
		float density = 1.0F + 0.35F * storm + 0.2F * precipitation;

		try (GpuBuffer.MappedView view = RenderSystem.getDevice().createCommandEncoder().mapBuffer(this.ubo.currentBuffer(), false, true)) {
			Std140Builder.intoBuffer(view.data())
				.putVec4(-extent, base, -extent, 0.0F)
				.putVec4(extent, top, extent, 0.0F)
				.putVec4(base, top, fadeDistance, steps)
				.putVec4(cover, density, storm, lightSteps)
				.putVec4(lightX, lightY, 0.0F, lightIntensity)
				.putVec4(lightR, lightG, lightB, 0.85F + 0.25F * day)
				.putVec4(skyR, skyG, skyB, time)
				.putVec4(groundR, groundG, groundB, (float) (this.frame++ & 1023))
				.putVec4(albedoR, albedoG, albedoB, alpha)
				.putVec4(flashX, flashY, flashZ, flashIntensity)
				.putVec4(ARGB.redFloat(fog), ARGB.greenFloat(fog), ARGB.blueFloat(fog), fadeDistance)
				.putVec4(time * 0.55F, time * 0.31F, precipitation, inside ? 1.0F : 0.0F);
		}

		GpuBufferSlice transforms = RenderSystem.getDynamicUniforms()
			.writeTransform(RenderSystem.getModelViewMatrix(), new Vector4f(1.0F, 1.0F, 1.0F, 1.0F), new Vector3f(), new Matrix4f());
		RenderTarget mainTarget = minecraft.getMainRenderTarget();
		RenderTarget cloudsTarget = minecraft.levelRenderer.getCloudsTarget();
		GpuTextureView color = cloudsTarget != null ? cloudsTarget.getColorTextureView() : mainTarget.getColorTextureView();
		GpuTextureView depth = cloudsTarget != null ? cloudsTarget.getDepthTextureView() : mainTarget.getDepthTextureView();
		RenderSystem.AutoStorageIndexBuffer indices = RenderSystem.getSequentialBuffer(VertexFormat.Mode.QUADS);
		GpuBuffer indexBuffer = indices.getBuffer(36);

		try (RenderPass pass = RenderSystem.getDevice().createCommandEncoder()
			.createRenderPass(() -> "RealWeather volumetric clouds", color, OptionalInt.empty(), depth, OptionalDouble.empty())) {
			pass.setPipeline(PIPELINE);
			RenderSystem.bindDefaultUniforms(pass);
			pass.setUniform("DynamicTransforms", transforms);
			pass.setUniform("RealWeatherClouds", this.ubo.currentBuffer());
			pass.setVertexBuffer(0, inside ? this.insideBox : this.outsideBox);
			pass.setIndexBuffer(indexBuffer, indices.type());
			pass.drawIndexed(0, 0, 36, 1);
		}
		this.ubo.rotate();
		return true;
	}

	@Override
	public void close() {
		this.outsideBox.close();
		this.insideBox.close();
		this.ubo.close();
	}
}
