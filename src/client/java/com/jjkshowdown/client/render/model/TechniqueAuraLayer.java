package com.jjkshowdown.client.render.model;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.render.JjkRenderKeys;
import com.jjkshowdown.client.render.JjkRenderTypes;
import com.jjkshowdown.client.render.RenderUtil;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import com.mojang.blaze3d.vertex.PoseStack;
import net.fabricmc.fabric.api.client.rendering.v1.FabricRenderState;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

/**
 * Cursed energy made visible on sorcerers: charging orbs in the hands (Blue, Red, the converging Hollow Purple,
 * Fuga's flame, the World Slash's glint) and body auras for Infinity, Domain Amplification, RCT and the Zone.
 */
public class TechniqueAuraLayer<S extends LivingEntityRenderState, M extends EntityModel<S>> extends RenderLayer<S, M> {
	private static final Identifier GLOW = JjkShowdown.id("textures/entity/technique/glow.png");
	private static final Identifier BLUE = JjkShowdown.id("textures/entity/technique/blue_orb.png");
	private static final Identifier RED = JjkShowdown.id("textures/entity/technique/red_orb.png");
	private static final Identifier PURPLE = JjkShowdown.id("textures/entity/technique/purple_orb.png");
	private static final Identifier RIPPLE = JjkShowdown.id("textures/entity/technique/infinity_ripple.png");

	public TechniqueAuraLayer(RenderLayerParent<S, M> parent) {
		super(parent);
	}

	@Override
	public void submit(PoseStack ps, SubmitNodeCollector out, int light, S state, float yRot, float xRot) {
		JjkRenderKeys.VisualData data = ((FabricRenderState) state).getData(JjkRenderKeys.VISUAL);
		if (data == null || !(getParentModel() instanceof HumanoidModel<?> hm)) return;
		ClientState.Visual v = data.visual();
		float age = state.ageInTicks;
		CharacterType c = v.character;
		int cs = v.chargeSlot;
		float pt = data.poseTicks();
		if (c == CharacterType.GOJO) {
			if (cs == AbilitySlot.PRIMARY.ordinal()) orb(ps, out, hm.rightArm, true, BLUE, 0.12f + Math.min(1f, pt / 30f) * 0.14f, 0x6FC8FF, age);
			if (cs == AbilitySlot.SECONDARY.ordinal()) orb(ps, out, hm.rightArm, true, RED, 0.08f + Math.min(1f, pt / 30f) * 0.1f, 0xFF3020, age);
			if (v.pose == CastPose.PURPLE_CHARGE) {
				float conv = Mth.clamp(pt / 40f, 0f, 1f);
				orb(ps, out, hm.rightArm, true, RED, 0.18f, 0xFF3020, age);
				orb(ps, out, hm.leftArm, false, BLUE, 0.18f, 0x6FC8FF, age);
				if (conv >= 1f) {
					ps.pushPose();
					ps.translate(0, 0.45, -0.75);
					float r = 0.3f + 0.05f * Mth.sin(age * 0.8f);
					RenderUtil.sphere(ps, out, JjkRenderTypes.additive(PURPLE), r, 8, 12, RenderUtil.argb(1f, 0xFFFFFF), age * 0.02f, false);
					RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), r * 2.2f, 8, 12, RenderUtil.argb(0.35f, 0xB050FF), 0, false);
					ps.popPose();
				}
			}
		} else if (c == CharacterType.SUKUNA) {
			if (cs == AbilitySlot.TERTIARY.ordinal()) orb(ps, out, hm.leftArm, false, GLOW, 0.16f + Math.min(1f, pt / 30f) * 0.12f, 0xFF8020, age);
			if (cs == AbilitySlot.ULTIMATE.ordinal()) orb(ps, out, hm.rightArm, true, GLOW, 0.12f + 0.04f * Mth.sin(age * 1.5f), 0xFFFFFF, age);
			if (cs == AbilitySlot.SECONDARY.ordinal()) {
				orb(ps, out, hm.rightArm, true, GLOW, 0.14f, 0xFF1020, age);
				orb(ps, out, hm.leftArm, false, GLOW, 0.14f, 0xFF1020, age);
			}
		}
		// auras
		ps.pushPose();
		ps.translate(0, 0.75, 0);
		if (v.has(Payloads.SorcererSync.F_INFINITY)) {
			float shimmer = 0.05f + 0.03f * Mth.sin(age * 0.35f);
			RenderUtil.sphere(ps, out, JjkRenderTypes.additive(RIPPLE), 1.25f, 10, 16, RenderUtil.argb(shimmer, 0x9FE8FF), age * 0.004f, false);
		}
		if (v.has(Payloads.SorcererSync.F_AMPLIFICATION)) {
			RenderUtil.sphere(ps, out, JjkRenderTypes.translucentGlow(GLOW), 1.05f, 10, 16, RenderUtil.argb(0.22f + 0.06f * Mth.sin(age * 0.5f), 0x30000A), 0, false);
		}
		if (v.has(Payloads.SorcererSync.F_RCT)) {
			RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), 1.1f, 10, 16, RenderUtil.argb(0.18f + 0.08f * Mth.sin(age * 0.6f), 0xA0FFC0), 0, false);
		}
		if (v.has(Payloads.SorcererSync.F_ZONE) && ((int) age % 6) < 2) {
			RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), 1.15f, 8, 12, RenderUtil.argb(0.25f, 0xFF0018), 0, false);
		}
		ps.popPose();
	}

	private static void orb(PoseStack ps, SubmitNodeCollector out, ModelPart arm, boolean right, Identifier tex, float radius, int glow, float age) {
		ps.pushPose();
		arm.translateAndRotate(ps);
		ps.translate(right ? -0.06 : 0.06, 0.72, 0);
		RenderUtil.sphere(ps, out, JjkRenderTypes.additive(tex), radius, 8, 12, RenderUtil.argb(1f, 0xFFFFFF), age * 0.03f, false);
		RenderUtil.sphere(ps, out, JjkRenderTypes.additive(GLOW), radius * 2.4f, 8, 12, RenderUtil.argb(0.45f, glow), 0, false);
		ps.popPose();
	}
}
