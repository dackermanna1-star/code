package dev.portalgun.client.sky;

import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.systems.RenderPass;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.ByteBufferBuilder;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.MeshData;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.math.Axis;
import dev.portalgun.PortalGunMod;
import dev.portalgun.content.ContentSpec;
import dev.portalgun.dimension.Destinations;
import java.util.HashSet;
import java.util.List;
import java.util.OptionalDouble;
import java.util.OptionalInt;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.resources.Identifier;
import org.joml.Matrix4f;
import org.joml.Matrix4fStack;
import org.joml.Vector3f;
import org.joml.Vector4f;

/**
 * Extra celestial bodies (planets, rings, extra suns, nebulae...) listed in {@link ContentSpec.DimensionInfo#sky}.
 * Drawn from the SkyRenderer mixin right after the vanilla sun/moon/stars, with the same quad conventions as the sun
 * (distance 100, size 30 = vanilla sun) and a translucent or additive celestial pipeline.
 */
public final class ClientSky {
	private static final RenderPipeline BODY_TRANSLUCENT = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_PROJECTION_SNIPPET)
		.withLocation(PortalGunMod.id("pipeline/sky_body"))
		.withVertexShader("core/position_tex")
		.withFragmentShader("core/position_tex")
		.withSampler("Sampler0")
		.withBlend(BlendFunction.TRANSLUCENT)
		.withDepthWrite(false)
		.withVertexFormat(DefaultVertexFormat.POSITION_TEX, VertexFormat.Mode.QUADS)
		.build());
	private static final RenderPipeline BODY_ADDITIVE = RenderPipelines.register(RenderPipeline.builder(RenderPipelines.MATRICES_PROJECTION_SNIPPET)
		.withLocation(PortalGunMod.id("pipeline/sky_body_additive"))
		.withVertexShader("core/position_tex")
		.withFragmentShader("core/position_tex")
		.withSampler("Sampler0")
		.withBlend(BlendFunction.LIGHTNING)
		.withDepthWrite(false)
		.withVertexFormat(DefaultVertexFormat.POSITION_TEX, VertexFormat.Mode.QUADS)
		.build());
	private static final float DISTANCE = 100.0F;
	private static final Set<String> WARNED = new HashSet<>();
	private static GpuBuffer quad;

	private ClientSky() {
	}

	public static void init() {
		// pipelines are registered by the static initialiser so they are precompiled with the vanilla ones
		PortalGunMod.LOGGER.debug("Sky body pipelines: {}, {}", BODY_TRANSLUCENT.getLocation(), BODY_ADDITIVE.getLocation());
	}

	private static GpuBuffer quad() {
		if (quad == null) {
			VertexFormat format = DefaultVertexFormat.POSITION_TEX;
			try (ByteBufferBuilder bytes = ByteBufferBuilder.exactlySized(4 * format.getVertexSize())) {
				BufferBuilder b = new BufferBuilder(bytes, VertexFormat.Mode.QUADS, format);
				b.addVertex(-1.0F, 0.0F, -1.0F).setUv(0.0F, 0.0F);
				b.addVertex(1.0F, 0.0F, -1.0F).setUv(1.0F, 0.0F);
				b.addVertex(1.0F, 0.0F, 1.0F).setUv(1.0F, 1.0F);
				b.addVertex(-1.0F, 0.0F, 1.0F).setUv(0.0F, 1.0F);
				try (MeshData mesh = b.buildOrThrow()) {
					quad = RenderSystem.getDevice().createBuffer(() -> "Portal Gun sky body quad", GpuBuffer.USAGE_VERTEX, mesh.vertexBuffer());
				}
			}
		}
		return quad;
	}

	/** Called from the sky pass (render thread) after the vanilla sun, moon and stars. */
	public static void render(float rainBrightness) {
		Minecraft mc = Minecraft.getInstance();
		ClientLevel level = mc.level;
		if (level == null) {
			return;
		}
		ContentSpec.DimensionInfo info = Destinations.info(level.dimension().identifier());
		if (info == null || info.sky == null || info.sky.isEmpty()) {
			return;
		}
		try {
			draw(mc, level, info.sky, rainBrightness);
		} catch (RuntimeException e) {
			if (WARNED.add("render:" + info.id)) {
				PortalGunMod.LOGGER.error("Failed to draw sky bodies of {}", info.id, e);
			}
		}
	}

	private static void draw(Minecraft mc, ClientLevel level, List<ContentSpec.Celestial> bodies, float rainBrightness) {
		float partial = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
		double days = (level.getGameTime() + (double) partial) / 24000.0;
		GpuTextureView color = mc.getMainRenderTarget().getColorTextureView();
		GpuTextureView depth = mc.getMainRenderTarget().getDepthTextureView();
		RenderSystem.AutoStorageIndexBuffer indices = RenderSystem.getSequentialBuffer(VertexFormat.Mode.QUADS);
		GpuBuffer indexBuffer = indices.getBuffer(6);
		GpuBuffer vertices = quad();
		for (ContentSpec.Celestial body : bodies) {
			if (body == null || body.texture == null) {
				continue;
			}
			Identifier tex = Identifier.tryParse(body.texture);
			if (tex == null) {
				if (WARNED.add(body.texture)) {
					PortalGunMod.LOGGER.warn("Bad sky body texture id {}", body.texture);
				}
				continue;
			}
			float alpha = Math.max(0.0F, Math.min(1.0F, body.alpha)) * rainBrightness;
			if (alpha <= 0.003F) {
				continue;
			}
			AbstractTexture texture = mc.getTextureManager().getTexture(tex);
			float drift = (float) ((body.speed * days) % 360.0);
			PoseStack pose = new PoseStack();
			pose.mulPose(Axis.YP.rotationDegrees(-90.0F));
			if (drift != 0.0F) {
				pose.mulPose(Axis.XP.rotationDegrees(drift));
			}
			// yaw follows the F3 compass: 0 = south, 90 = west, 180 = north, 270 = east
			pose.mulPose(Axis.YP.rotationDegrees(90.0F - body.yaw));
			pose.mulPose(Axis.XP.rotationDegrees(90.0F - body.pitch));
			Matrix4fStack mv = RenderSystem.getModelViewStack();
			mv.pushMatrix();
			mv.mul(pose.last().pose());
			mv.translate(0.0F, DISTANCE, 0.0F);
			if (body.roll != 0.0F) {
				mv.rotate(Axis.YP.rotationDegrees(body.roll));
			}
			float size = Math.max(0.5F, body.size);
			mv.scale(size, 1.0F, size);
			GpuBufferSlice transform = RenderSystem.getDynamicUniforms()
				.writeTransform(mv, new Vector4f(1.0F, 1.0F, 1.0F, alpha), new Vector3f(), new Matrix4f());
			try (RenderPass pass = RenderSystem.getDevice().createCommandEncoder()
				.createRenderPass(() -> "Portal Gun sky body", color, OptionalInt.empty(), depth, OptionalDouble.empty())) {
				pass.setPipeline(body.additive ? BODY_ADDITIVE : BODY_TRANSLUCENT);
				RenderSystem.bindDefaultUniforms(pass);
				pass.setUniform("DynamicTransforms", transform);
				pass.bindTexture("Sampler0", texture.getTextureView(), texture.getSampler());
				pass.setVertexBuffer(0, vertices);
				pass.setIndexBuffer(indexBuffer, indices.type());
				pass.drawIndexed(0, 0, 6, 1);
			}
			mv.popMatrix();
		}
	}
}
