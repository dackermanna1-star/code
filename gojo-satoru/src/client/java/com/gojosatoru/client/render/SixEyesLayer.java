package com.gojosatoru.client.render;

import com.gojosatoru.GojoMod;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

/** When Gojo takes the blindfold off, the Six Eyes glow even in total darkness. */
public class SixEyesLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
    private static final Identifier SIX_EYES_SKIN = GojoMod.id("textures/entity/gojo_six_eyes.png");
    private static final RenderType GLOW = RenderTypes.eyes(GojoMod.id("textures/entity/gojo_six_eyes_glow.png"));

    public SixEyesLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
        super(parent);
    }

    @Override
    public void submit(PoseStack pose, SubmitNodeCollector collector, int light, AvatarRenderState state, float yRot, float xRot) {
        if (state.isInvisible || state.skin == null || !SIX_EYES_SKIN.equals(state.skin.body().texturePath())) {
            return;
        }
        collector.order(1).submitModel(this.getParentModel(), state, pose, GLOW, light, OverlayTexture.NO_OVERLAY, -1, null,
                state.outlineColor, null);
    }
}
