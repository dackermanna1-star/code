package com.chaosunleashed.client.render;

import com.chaosunleashed.ChaosUnleashed;
import com.chaosunleashed.client.ClientChaosState;
import com.chaosunleashed.core.ChaosEventType;
import com.mojang.blaze3d.buffers.GpuBuffer;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.systems.RenderPass;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.textures.GpuTextureView;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BuiltBuffer;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.texture.AbstractTexture;
import net.minecraft.client.util.BufferAllocator;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import org.joml.Matrix4f;
import org.joml.Matrix4fStack;
import org.joml.Vector3f;
import org.joml.Vector4f;

import java.util.OptionalDouble;
import java.util.OptionalInt;

/**
 * Sky changes that the environment attributes can't express: a huge orange sun during a Solar Flare, a big red
 * moon during the Blood Moon, and the Eclipse's dark disk sliding over the sun with a glowing corona.
 * Hooked into vanilla sky rendering by {@code SkyRenderingMixin}.
 */
public final class ChaosSkyRenderer {
	private static final Identifier DISK_TEXTURE = ChaosUnleashed.id("textures/environment/eclipse_disk.png");
	private static final Identifier CORONA_TEXTURE = ChaosUnleashed.id("textures/environment/eclipse_corona.png");
	/** Like the vanilla celestial pipeline but with normal alpha blending, so it can darken the sun. */
	private static final RenderPipeline TRANSLUCENT_CELESTIAL = RenderPipeline.builder(RenderPipelines.TRANSFORMS_AND_PROJECTION_SNIPPET)
		.withLocation(ChaosUnleashed.id("pipeline/eclipse_disk"))
		.withVertexShader("core/position_tex")
		.withFragmentShader("core/position_tex")
		.withSampler("Sampler0")
		.withBlend(BlendFunction.TRANSLUCENT)
		.withDepthWrite(false)
		.withVertexFormat(VertexFormats.POSITION_TEXTURE, VertexFormat.DrawMode.QUADS)
		.build();
	private static GpuBuffer quad;

	private ChaosSkyRenderer() {
	}

	public static float sunScale() {
		return 1.0F + ClientChaosState.strength(ChaosEventType.SOLAR_FLARE) * 1.4F;
	}

	public static Vector4f sunColor(Vector4f color) {
		float flare = ClientChaosState.strength(ChaosEventType.SOLAR_FLARE);
		if (flare <= 0.0F) {
			return color;
		}
		return new Vector4f(color.x(), color.y() * (1.0F - 0.25F * flare), color.z() * (1.0F - 0.6F * flare), color.w());
	}

	public static float moonScale() {
		return 1.0F + ClientChaosState.strength(ChaosEventType.BLOOD_MOON) * 0.9F;
	}

	public static Vector4f moonColor(Vector4f color) {
		float blood = ClientChaosState.strength(ChaosEventType.BLOOD_MOON);
		if (blood <= 0.0F) {
			return color;
		}
		return new Vector4f(color.x(), color.y() * (1.0F - 0.85F * blood), color.z() * (1.0F - 0.88F * blood), color.w());
	}

	/** Draws the eclipse disk and corona over the sun. {@code matrices} is already rotated to the sun. */
	public static void renderEclipse(MatrixStack matrices, float alpha) {
		float strength = ClientChaosState.strength(ChaosEventType.ECLIPSE);
		float coverage = MathHelper.clamp(ClientChaosState.value(ChaosEventType.ECLIPSE), 0.0F, 1.0F);
		if (strength <= 0.001F || coverage <= 0.001F || alpha <= 0.0F) {
			return;
		}
		ensureQuad();
		MinecraftClient client = MinecraftClient.getInstance();
		AbstractTexture disk = client.getTextureManager().getTexture(DISK_TEXTURE);
		AbstractTexture corona = client.getTextureManager().getTexture(CORONA_TEXTURE);

		// The dark disk slides in from the side until it fully covers the sun.
		float offset = (1.0F - coverage) * 44.0F;
		draw("Chaos eclipse disk", TRANSLUCENT_CELESTIAL, disk, matrices, offset, offset * 0.35F, 23.0F, new Vector4f(1.0F, 1.0F, 1.0F, alpha));

		// The corona appears around totality.
		float corona01 = MathHelper.clamp((coverage - 0.8F) / 0.2F, 0.0F, 1.0F);
		if (corona01 > 0.0F) {
			float pulse = 0.85F + 0.15F * MathHelper.sin((client.world != null ? client.world.getTime() : 0) * 0.05F);
			draw("Chaos eclipse corona", RenderPipelines.POSITION_TEX_COLOR_CELESTIAL, corona, matrices, 0.0F, 0.0F, 52.0F,
				new Vector4f(1.0F, 0.95F, 0.85F, alpha * corona01 * pulse));
		}
	}

	private static void draw(String label, RenderPipeline pipeline, AbstractTexture texture, MatrixStack matrices,
							 float offsetX, float offsetZ, float scale, Vector4f color) {
		Matrix4fStack modelView = RenderSystem.getModelViewStack();
		modelView.pushMatrix();
		modelView.mul(matrices.peek().getPositionMatrix());
		modelView.translate(offsetX, 100.0F, offsetZ);
		modelView.scale(scale, 1.0F, scale);
		GpuBufferSlice uniforms = RenderSystem.getDynamicUniforms().write(modelView, color, new Vector3f(), new Matrix4f());
		GpuTextureView colorTarget = MinecraftClient.getInstance().getFramebuffer().getColorAttachmentView();
		GpuTextureView depthTarget = MinecraftClient.getInstance().getFramebuffer().getDepthAttachmentView();
		RenderSystem.ShapeIndexBuffer indices = RenderSystem.getSequentialBuffer(VertexFormat.DrawMode.QUADS);
		GpuBuffer indexBuffer = indices.getIndexBuffer(6);
		try (RenderPass pass = RenderSystem.getDevice().createCommandEncoder()
			.createRenderPass(() -> label, colorTarget, OptionalInt.empty(), depthTarget, OptionalDouble.empty())) {
			pass.setPipeline(pipeline);
			RenderSystem.bindDefaultUniforms(pass);
			pass.setUniform("DynamicTransforms", uniforms);
			pass.bindTexture("Sampler0", texture.getGlTextureView(), texture.getSampler());
			pass.setVertexBuffer(0, quad);
			pass.setIndexBuffer(indexBuffer, indices.getIndexType());
			pass.drawIndexed(0, 0, 6, 1);
		}
		modelView.popMatrix();
	}

	private static void ensureQuad() {
		if (quad != null) {
			return;
		}
		VertexFormat format = VertexFormats.POSITION_TEXTURE;
		try (BufferAllocator allocator = BufferAllocator.fixedSized(4 * format.getVertexSize())) {
			BufferBuilder builder = new BufferBuilder(allocator, VertexFormat.DrawMode.QUADS, format);
			builder.vertex(-1.0F, 0.0F, -1.0F).texture(0.0F, 0.0F);
			builder.vertex(1.0F, 0.0F, -1.0F).texture(1.0F, 0.0F);
			builder.vertex(1.0F, 0.0F, 1.0F).texture(1.0F, 1.0F);
			builder.vertex(-1.0F, 0.0F, 1.0F).texture(0.0F, 1.0F);
			try (BuiltBuffer built = builder.end()) {
				quad = RenderSystem.getDevice().createBuffer(() -> "Chaos sky quad", GpuBuffer.USAGE_VERTEX, built.getBuffer());
			}
		}
	}
}
