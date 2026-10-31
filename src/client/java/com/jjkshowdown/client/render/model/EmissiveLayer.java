package com.jjkshowdown.client.render.model;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.client.render.JjkRenderKeys;
import com.jjkshowdown.sorcerer.CharacterType;
import com.mojang.blaze3d.vertex.PoseStack;
import net.fabricmc.fabric.api.client.rendering.v1.FabricRenderState;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;

/** Glowing Six Eyes / Sukuna's red eyes and markings, rendered full-bright. */
public class EmissiveLayer<S extends LivingEntityRenderState, M extends EntityModel<S>> extends RenderLayer<S, M> {
	public static final Identifier GOJO_EYES = JjkShowdown.id("textures/entity/gojo_eyes.png");
	public static final Identifier SUKUNA_EYES = JjkShowdown.id("textures/entity/sukuna_markings.png");
	public static final Identifier HEIAN_EYES = JjkShowdown.id("textures/entity/sukuna_heian_markings.png");
	private final boolean playerLayer;

	public EmissiveLayer(RenderLayerParent<S, M> parent, boolean playerLayer) {
		super(parent);
		this.playerLayer = playerLayer;
	}

	@Override
	public void submit(PoseStack ps, SubmitNodeCollector out, int light, S state, float yRot, float xRot) {
		if (state.isInvisible) return;
		Identifier tex;
		if (state instanceof SorcererRenderState s) {
			tex = s.character == CharacterType.GOJO ? GOJO_EYES : s.heian ? HEIAN_EYES : SUKUNA_EYES;
		} else {
			if (!playerLayer || !ClientConfig.get().characterSkins) return;
			JjkRenderKeys.VisualData d = ((FabricRenderState) state).getData(JjkRenderKeys.VISUAL);
			if (d == null) return;
			ClientState.Visual v = d.visual();
			if (v.character == CharacterType.GOJO) tex = GOJO_EYES;
			else if (v.character == CharacterType.SUKUNA) tex = SUKUNA_EYES;
			else return;
		}
		out.order(1).submitModel(getParentModel(), state, ps, RenderTypes.eyes(tex), light, OverlayTexture.NO_OVERLAY, -1, null, state.outlineColor, null);
	}
}
