package com.gojosatoru.client.render;

import com.gojosatoru.entity.BlueOrbEntity;
import com.gojosatoru.entity.CursedOrbEntity;
import com.gojosatoru.entity.HollowPurpleEntity;
import com.gojosatoru.entity.RedOrbEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Draws Blue, Red and Hollow Purple as stacked, camera-facing additive glows. */
public class OrbRenderer<T extends CursedOrbEntity> extends EntityRenderer<T, OrbRenderer.State> {
    public enum Style {
        BLUE, RED, PURPLE
    }

    public static class State extends EntityRenderState {
        float scale;
        float time;
        int phase;
        float charge;
        float radius;
        float yRot;
        float xRot;
    }

    private final Style style;

    public OrbRenderer(EntityRendererProvider.Context context, Style style) {
        super(context);
        this.style = style;
        this.shadowRadius = 0.0F;
    }

    @Override
    public State createRenderState() {
        return new State();
    }

    @Override
    public void extractRenderState(T entity, State state, float partialTick) {
        super.extractRenderState(entity, state, partialTick);
        state.time = entity.tickCount + partialTick;
        if (entity instanceof BlueOrbEntity blue) {
            state.scale = blue.getScale();
        } else if (entity instanceof RedOrbEntity red) {
            state.scale = red.getScale();
        } else if (entity instanceof HollowPurpleEntity purple) {
            state.phase = purple.getPhase();
            state.charge = purple.getCharge() + (purple.getPhase() == HollowPurpleEntity.PHASE_CHARGING ? partialTick : 0.0F);
            state.radius = purple.getRadius();
            state.yRot = purple.getYRot(partialTick);
            state.xRot = purple.getXRot(partialTick);
        }
    }

    @Override
    protected AABB getBoundingBoxForCulling(T entity) {
        return entity.getBoundingBox().inflate(this.style == Style.PURPLE ? 14.0 : 4.0);
    }

    @Override
    public void submit(State state, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera) {
        switch (this.style) {
            case BLUE -> drawBlue(pose, collector, camera, Vec3.ZERO, state.scale, state.time);
            case RED -> drawRed(pose, collector, camera, Vec3.ZERO, state.scale, state.time);
            case PURPLE -> this.drawPurpleEntity(state, pose, collector, camera);
        }
        super.submit(state, pose, collector, camera);
    }

    private void drawPurpleEntity(State state, PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera) {
        if (state.phase == HollowPurpleEntity.PHASE_CHARGING && state.charge < HollowPurpleEntity.MERGE_AT) {
            float t = state.charge / HollowPurpleEntity.MERGE_AT;
            float grow = Math.min(1.0F, state.charge / 6.0F) * 0.8F;
            Vec3 blue = HollowPurpleEntity.chargeOffset(state.charge, state.yRot, state.xRot, -1);
            Vec3 red = HollowPurpleEntity.chargeOffset(state.charge, state.yRot, state.xRot, 1);
            drawBlue(pose, collector, camera, blue, grow, state.time);
            drawRed(pose, collector, camera, red, grow, state.time);
            // the space between them starts to warp violet as they close in
            quad(pose, collector, camera, GojoRenderTypes.GLOW_TYPE, Vec3.ZERO, 1.0F + 3.0F * t, 0.0F, ARGB.color(0.6F * t * t, 0x8A3CFF));
            return;
        }
        float radius = Math.max(0.0F, state.radius);
        // Fade the outer glow when the camera is close, so the caster isn't blinded by their own technique.
        float distance = (float) Math.sqrt(state.distanceToCameraSq);
        float glare = Mth.clamp((distance - radius) / (radius * 3.0F + 0.01F), 0.2F, 1.0F);
        if (state.phase == HollowPurpleEntity.PHASE_CHARGING) {
            glare = Math.min(glare, 0.45F);
        }
        drawPurple(pose, collector, camera, radius, state.time, glare);
    }

    // -------------------------------------------------------------------------------- styles ---

    private static void drawBlue(PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera, Vec3 at, float s, float t) {
        if (s <= 0.01F) {
            return;
        }
        float pulse = 1.0F + 0.07F * Mth.sin(t * 0.8F);
        quad(pose, collector, camera, GojoRenderTypes.GLOW_TYPE, at, 6.2F * s, 0.0F, ARGB.color(0.95F, 0x1E4CFF));
        quad(pose, collector, camera, GojoRenderTypes.RING_TYPE, at, 3.6F * s * pulse, 0.0F, ARGB.color(0.55F, 0x5AA0FF));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, at, 4.8F * s, -t * 0.22F, ARGB.color(0.95F, 0x3C82FF));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, at, 3.3F * s, t * 0.37F, ARGB.color(0.95F, 0x7CC0FF));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, at, 1.6F * s * pulse, 0.0F, ARGB.color(0.95F, 0x8CCBFF));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, at, 0.75F * s * pulse, 0.0F, ARGB.color(1.0F, 0xFFFFFF));
    }

    private static void drawRed(PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera, Vec3 at, float s, float t) {
        if (s <= 0.01F) {
            return;
        }
        float flicker = 1.0F + 0.1F * Mth.sin(t * 2.3F) * Mth.sin(t * 1.1F);
        quad(pose, collector, camera, GojoRenderTypes.GLOW_TYPE, at, 3.8F * s * flicker, 0.0F, ARGB.color(0.95F, 0xFF1A0E));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, at, 2.8F * s, t * 0.6F, ARGB.color(0.9F, 0xFF3A22));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, at, 2.0F * s, -t * 0.9F, ARGB.color(0.8F, 0xFF7A50));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, at, 1.1F * s * flicker, 0.0F, ARGB.color(0.95F, 0xFF6A50));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, at, 0.5F * s, 0.0F, ARGB.color(1.0F, 0xFFF0E8));
    }

    private static void drawPurple(PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera, float r, float t, float glare) {
        if (r <= 0.02F) {
            return;
        }
        float pulse = 1.0F + 0.05F * Mth.sin(t * 0.9F);
        quad(pose, collector, camera, GojoRenderTypes.GLOW_TYPE, Vec3.ZERO, r * 4.4F, 0.0F, ARGB.color(0.85F * glare, 0x4A12FF));
        quad(pose, collector, camera, GojoRenderTypes.RING_TYPE, Vec3.ZERO, r * 2.75F * pulse, 0.0F, ARGB.color(0.75F, 0xB070FF));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, Vec3.ZERO, r * 2.9F, t * 0.3F, ARGB.color(0.9F * (0.5F + 0.5F * glare), 0x8A3CFF));
        quad(pose, collector, camera, GojoRenderTypes.SWIRL_TYPE, Vec3.ZERO, r * 2.3F, -t * 0.47F, ARGB.color(0.85F, 0xD090FF));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, Vec3.ZERO, r * 2.1F, 0.0F, ARGB.color(0.8F, 0x9450FF));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, Vec3.ZERO, r * 1.55F * pulse, 0.0F, ARGB.color(0.75F, 0xE6C4FF));
        quad(pose, collector, camera, GojoRenderTypes.CORE_TYPE, Vec3.ZERO, r * 0.95F, 0.0F, ARGB.color(1.0F, 0xFFFFFF));
    }

    // ------------------------------------------------------------------------------- geometry ---

    private static void quad(PoseStack pose, SubmitNodeCollector collector, CameraRenderState camera, RenderType type,
                             Vec3 at, float size, float roll, int argb) {
        if (size <= 0.001F || ARGB.alpha(argb) == 0) {
            return;
        }
        pose.pushPose();
        pose.translate(at.x, at.y, at.z);
        pose.mulPose(camera.orientation);
        if (roll != 0.0F) {
            pose.mulPose(Axis.ZP.rotation(roll));
        }
        pose.scale(size, size, size);
        collector.submitCustomGeometry(pose, type, (p, consumer) -> {
            vertex(consumer, p, -0.5F, -0.5F, 0.0F, 1.0F, argb);
            vertex(consumer, p, 0.5F, -0.5F, 1.0F, 1.0F, argb);
            vertex(consumer, p, 0.5F, 0.5F, 1.0F, 0.0F, argb);
            vertex(consumer, p, -0.5F, 0.5F, 0.0F, 0.0F, argb);
        });
        pose.popPose();
    }

    private static void vertex(VertexConsumer consumer, PoseStack.Pose pose, float x, float y, float u, float v, int argb) {
        consumer.addVertex(pose, x, y, 0.0F)
                .setColor(argb)
                .setUv(u, v)
                .setOverlay(OverlayTexture.NO_OVERLAY)
                .setLight(LightTexture.FULL_BRIGHT)
                .setNormal(pose, 0.0F, 1.0F, 0.0F);
    }
}
