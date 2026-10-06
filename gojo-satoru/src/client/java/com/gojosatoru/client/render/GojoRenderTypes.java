package com.gojosatoru.client.render;

import com.gojosatoru.GojoMod;
import com.mojang.blaze3d.pipeline.BlendFunction;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.VertexFormat;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.rendertype.RenderSetup;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.resources.Identifier;

/** Additive, full-bright render types for the technique orbs. */
public final class GojoRenderTypes {
    private static final RenderPipeline GLOW_PIPELINE = RenderPipeline.builder(RenderPipelines.MATRICES_FOG_SNIPPET)
            .withLocation(GojoMod.id("pipeline/glow"))
            .withVertexShader("core/entity")
            .withFragmentShader("core/entity")
            .withShaderDefine("EMISSIVE")
            .withShaderDefine("NO_OVERLAY")
            .withShaderDefine("NO_CARDINAL_LIGHTING")
            .withSampler("Sampler0")
            .withBlend(BlendFunction.LIGHTNING)
            .withDepthWrite(false)
            .withCull(false)
            .withVertexFormat(DefaultVertexFormat.NEW_ENTITY, VertexFormat.Mode.QUADS)
            .build();

    public static final Identifier GLOW = GojoMod.id("textures/entity/glow.png");
    public static final Identifier CORE = GojoMod.id("textures/entity/core.png");
    public static final Identifier SWIRL = GojoMod.id("textures/entity/swirl.png");
    public static final Identifier RING = GojoMod.id("textures/entity/ring.png");

    public static final RenderType GLOW_TYPE = glow("glow", GLOW);
    public static final RenderType CORE_TYPE = glow("core", CORE);
    public static final RenderType SWIRL_TYPE = glow("swirl", SWIRL);
    public static final RenderType RING_TYPE = glow("ring", RING);

    private GojoRenderTypes() {
    }

    private static RenderType glow(String name, Identifier texture) {
        return RenderType.create("gojo_" + name,
                RenderSetup.builder(GLOW_PIPELINE).withTexture("Sampler0", texture).sortOnUpload().createRenderSetup());
    }
}
