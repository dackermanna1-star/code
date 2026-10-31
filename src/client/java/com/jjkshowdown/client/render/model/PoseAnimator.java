package com.jjkshowdown.client.render.model;

import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.render.JjkRenderKeys;
import com.jjkshowdown.sorcerer.CastPose;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.util.Mth;

/** Casting animations applied on top of vanilla humanoid animation (players and rival bosses). */
public final class PoseAnimator {
	private static final float PI = (float) Math.PI;

	private PoseAnimator() {
	}

	public static void apply(HumanoidModel<?> m, JjkRenderKeys.VisualData data) {
		CastPose pose = data.visual().pose;
		if (pose == CastPose.NONE) return;
		float ticks = data.poseTicks();
		int duration = Math.max(1, data.visual().poseDuration);
		// blend in over 3 ticks and out over the last 3
		float w = Mth.clamp(ticks / 3f, 0f, 1f) * Mth.clamp((duration - ticks) / 3f, 0f, 1f);
		if (pose == CastPose.BLOCK) w = Mth.clamp(ticks / 2f, 0f, 1f);
		if (w <= 0.001f) return;
		float head = m.head.xRot;
		float age = data.age();
		ModelPart r = m.rightArm, l = m.leftArm;
		switch (pose) {
			case PALM_OUT -> {
				set(r, w, -PI / 2 + head - 0.05f, -0.15f, 0.05f);
				set(l, w, -0.25f, 0.1f, -0.15f);
			}
			case POINT -> {
				set(r, w, -PI / 2 + head, -0.25f + m.head.yRot, 0f);
				set(l, w, 0.15f, 0f, -0.1f);
			}
			case PURPLE_CHARGE -> {
				float c = Mth.clamp(ticks / 40f, 0f, 1f);
				float e = c * c * (3 - 2 * c);
				set(r, w, Mth.lerp(e, -0.3f, -PI / 2 + head), Mth.lerp(e, 0f, -0.45f), Mth.lerp(e, 1.45f, 0.05f));
				set(l, w, Mth.lerp(e, -0.3f, -PI / 2 + head), Mth.lerp(e, 0f, 0.45f), Mth.lerp(e, -1.45f, -0.05f));
				m.body.yRot = Mth.lerp(w, m.body.yRot, Mth.sin(age * 0.2f) * 0.03f);
			}
			case PURPLE_FIRE -> {
				set(r, w, -PI / 2 + head, -0.3f, 0f);
				set(l, w, -PI / 2 + head, 0.3f, 0f);
			}
			case HAND_SIGN_VOID -> {
				set(r, w, -2.05f, -0.55f, 0.1f);
				set(l, w, -0.35f, 0.25f, -0.1f);
				m.head.xRot = Mth.lerp(w, m.head.xRot, 0.05f);
			}
			case HAND_SIGN_SHRINE -> {
				set(r, w, -1.25f, -0.62f, 0f);
				set(l, w, -1.25f, 0.62f, 0f);
				m.head.xRot = Mth.lerp(w, m.head.xRot, 0.12f);
			}
			case SLASH -> {
				float p = Mth.clamp(ticks / Math.max(1f, Math.min(duration, 8)), 0f, 1f);
				set(r, w, -1.45f + head * 0.5f, Mth.lerp(p, 0.9f, -1.0f), 0.1f);
				set(l, w, -0.2f, 0.1f, -0.2f);
				m.body.yRot = Mth.lerp(w, m.body.yRot, Mth.lerp(p, 0.25f, -0.3f));
			}
			case CLEAVE -> {
				float p = Mth.clamp(ticks / 6f, 0f, 1f);
				set(r, w, Mth.lerp(p, -2.7f, -0.7f), -0.45f, 0f);
				set(l, w, Mth.lerp(p, -2.7f, -0.7f), 0.45f, 0f);
			}
			case BOW_DRAW -> {
				set(r, w, -PI / 2 + head, -0.1f + m.head.yRot - 0.5f, 0f);
				set(l, w, -PI / 2 + head, 0.1f + m.head.yRot + 0.4f, 0f);
			}
			case WORLD_SLASH -> {
				set(r, w, -2.95f, -0.15f, 0.25f);
				set(l, w, -0.4f, 0.2f, -0.25f);
				m.head.xRot = Mth.lerp(w, m.head.xRot, -0.15f);
			}
			case BLOCK -> {
				set(r, w, -1.35f, -0.75f, 0f);
				set(l, w, -1.35f, 0.75f, 0f);
			}
			case RCT -> {
				set(r, w, -0.95f, -0.65f, 0f);
				set(l, w, -0.95f, 0.65f, 0f);
			}
			case AMPLIFY -> {
				set(r, w, 0.15f, 0f, 0.45f);
				set(l, w, 0.15f, 0f, -0.45f);
			}
			case STAGGER -> {
				set(r, w, 0.6f, 0f, 0.3f);
				set(l, w, 0.6f, 0f, -0.3f);
				m.head.xRot = Mth.lerp(w, m.head.xRot, -0.45f);
				m.body.xRot = Mth.lerp(w, m.body.xRot, -0.15f);
			}
			default -> {
			}
		}
		// charging techniques without a dedicated pose still raise the casting hand
		if (data.visual().chargeSlot == AbilitySlot.PRIMARY.ordinal() && pose == CastPose.NONE) {
			set(r, 1f, -PI / 2 + head, -0.1f, 0f);
		}
	}

	private static void set(ModelPart p, float w, float x, float y, float z) {
		p.xRot = Mth.lerp(w, p.xRot, x);
		p.yRot = Mth.lerp(w, p.yRot, y);
		p.zRot = Mth.lerp(w, p.zRot, z);
	}
}
