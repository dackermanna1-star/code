package dev.visceral.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.visceral.VisceralConfig;
import dev.visceral.blood.BloodTypes;
import dev.visceral.client.ragdoll.Ragdoll;
import dev.visceral.client.ragdoll.RagdollFrame;
import dev.visceral.client.ragdoll.RagdollManager;
import dev.visceral.client.ragdoll.RagdollPoser;
import dev.visceral.registry.VisceralAttachments;
import dev.visceral.wound.WoundData;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.Model;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

/** Glue between the vanilla render pipeline (via mixins) and the wound/ragdoll systems. */
public final class VisceralRenderHooks {
	private static boolean failed;

	private VisceralRenderHooks() {
	}

	/** Right after an entity's render state was extracted. */
	public static void afterExtract(Entity entity, EntityRenderState state, float partialTick) {
		if (!(entity instanceof LivingEntity living) || !(state instanceof LivingEntityRenderState livingState)) {
			return;
		}
		WoundData wounds = living.getAttached(VisceralAttachments.WOUNDS);
		boolean dead = living.isDeadOrDying() || living.isRemoved();
		if (wounds != null && !wounds.isEmpty() && VisceralConfig.get().woundDecals) {
			float gameTime = living.level().getGameTime() + partialTick;
			state.setData(VisceralClientKeys.WOUNDS, new VisceralClientKeys.WoundRenderInfo(
				living.getId(), wounds.wounds(), BloodTypes.of(living.getType()), gameTime, dead
			));
		}
		Ragdoll ragdoll = RagdollManager.get().get(living);
		if (ragdoll != null) {
			Vec3 camera = Minecraft.getInstance().gameRenderer.getMainCamera().position();
			ragdoll.applyRenderState(livingState, partialTick, camera);
		}
	}

	/** In {@code LivingEntityRenderer.submit}, after the model was posed and before the layers run. */
	public static void afterSubmitPose(Model<?> model, LivingEntityRenderState state, PoseStack poseStack) {
		if (failed) {
			return;
		}
		try {
			Ragdoll pending = state.getData(VisceralClientKeys.RAGDOLL_PENDING);
			if (pending != null) {
				RagdollManager.get().build(pending, model, new Matrix4f(poseStack.last().pose()));
				return;
			}
			RagdollFrame frame = state.getData(VisceralClientKeys.RAGDOLL_FRAME);
			if (frame != null) {
				RagdollPoser.apply(model, poseStack.last().pose(), frame);
			}
		} catch (RuntimeException e) {
			failed = true;
			dev.visceral.Visceral.LOGGER.error("Visceral ragdoll posing failed, disabling it for this session", e);
		}
	}

	/** In the deferred model renderer, after {@code setupAnim}: poses the main model and every layer model. */
	public static void afterFlushPose(Model<?> model, Object state, PoseStack.Pose pose) {
		if (failed || !(state instanceof EntityRenderState renderState)) {
			return;
		}
		try {
			RagdollFrame frame = renderState.getData(VisceralClientKeys.RAGDOLL_FRAME);
			if (frame != null) {
				RagdollPoser.apply(model, pose.pose(), frame);
			}
		} catch (RuntimeException e) {
			failed = true;
			dev.visceral.Visceral.LOGGER.error("Visceral ragdoll posing failed, disabling it for this session", e);
		}
	}
}
