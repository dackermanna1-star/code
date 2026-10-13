package dev.calibercraft.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.calibercraft.CaliberCraft;
import dev.calibercraft.client.GunController;
import dev.calibercraft.client.animation.GunAnimator;
import dev.calibercraft.client.config.ClientConfig;
import dev.calibercraft.core.Stat;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.item.AttachmentLoadout;
import dev.calibercraft.item.WeaponStacks;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.component.DataComponents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerModelPart;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.joml.Matrix4f;
import org.joml.Quaternionf;
import org.joml.Vector3f;

/**
 * Renders the held firearm in first person: the static body plus every moving part as separate item models
 * (they share the weapon's custom model data, so skins and attachments apply to every piece), the player's
 * arms placed on the grip/support points, and the muzzle flash. Called from {@code ItemInHandRendererMixin}.
 */
public final class FirstPersonRenderer {
	private static final Identifier[] FLASH_FRONT = {CaliberCraft.id("textures/effect/muzzle_front_0.png"),
		CaliberCraft.id("textures/effect/muzzle_front_1.png"), CaliberCraft.id("textures/effect/muzzle_front_2.png")};
	private static final Identifier[] FLASH_SIDE = {CaliberCraft.id("textures/effect/muzzle_side_0.png"),
		CaliberCraft.id("textures/effect/muzzle_side_1.png"), CaliberCraft.id("textures/effect/muzzle_side_2.png")};

	private static final Map<String, ItemStack> PART_STACKS = new HashMap<>();
	private static final Map<String, ItemStackRenderState> PART_STATES = new HashMap<>();

	/** View-space positions recorded on the last rendered frame (used to place casings, smoke and tracers). */
	public static final Vector3f LAST_MUZZLE_VIEW = new Vector3f(0.2f, -0.1f, -1.0f);
	public static final Vector3f LAST_EJECT_VIEW = new Vector3f(0.25f, -0.12f, -0.4f);
	public static boolean hasRecentView;

	private FirstPersonRenderer() {
	}

	/** Returns true if the weapon was rendered (vanilla rendering is then skipped). */
	public static boolean render(AbstractClientPlayer player, float partial, PoseStack pose, SubmitNodeCollector collector, int light, ItemStack stack) {
		GunController c = GunController.INSTANCE;
		if (!(player instanceof LocalPlayer local) || !c.active() || c.stack() != stack && !ItemStack.isSameItem(c.stack(), stack)) {
			return false;
		}
		WeaponRenderData data = WeaponRenderData.get(c.weaponId());
		GunAnimator.Frame frame = GunAnimator.INSTANCE.compute(c, data, local, partial);
		if (frame.hideForScope) {
			hasRecentView = false;
			return true;
		}
		ClientConfig cfg = ClientConfig.get();
		int gunLight = light;
		if (frame.flash > 0.4f && cfg.muzzleLight && c.stats().get(Stat.FLASH) > 0.3) {
			gunLight = 0xF000F0;
		}
		String id = c.weaponId().getPath();

		pose.pushPose();
		pose.mulPose(frame.gun);
		renderPart(local, stack, CaliberCraft.id("fp/" + id + "/static"), "static", pose, collector, gunLight);
		for (String part : data.animatedParts()) {
			if (Boolean.TRUE.equals(frame.hidden.get(part))) {
				continue;
			}
			pose.pushPose();
			Matrix4f m = frame.parts.get(part);
			if (m != null) {
				pose.mulPose(m);
			}
			renderPart(local, stack, CaliberCraft.id("fp/" + id + "/" + part), part, pose, collector, gunLight);
			pose.popPose();
		}
		recordPoints(frame, data, stack);
		if (cfg.muzzleFlash && frame.flash > 0 && c.stats().get(Stat.FLASH) > 0.05) {
			renderFlash(frame, data, stack, pose, collector, (float) c.stats().get(Stat.FLASH));
		}
		pose.popPose();
		if (!local.isInvisible()) {
			renderArms(local, frame, pose, collector, light, data);
		}
		return true;
	}

	private static void renderPart(LocalPlayer player, ItemStack source, Identifier model, String key, PoseStack pose,
			SubmitNodeCollector collector, int light) {
		ItemStack s = PART_STACKS.computeIfAbsent(key + "@" + model, k -> new ItemStack(Items.STICK));
		if (s.get(DataComponents.ITEM_MODEL) == null || !model.equals(s.get(DataComponents.ITEM_MODEL))) {
			s.set(DataComponents.ITEM_MODEL, model);
		}
		var cmd = source.get(DataComponents.CUSTOM_MODEL_DATA);
		if (cmd != s.get(DataComponents.CUSTOM_MODEL_DATA)) {
			s.set(DataComponents.CUSTOM_MODEL_DATA, cmd);
		}
		ItemStackRenderState state = PART_STATES.computeIfAbsent(key, k -> new ItemStackRenderState());
		Minecraft.getInstance().getItemModelResolver().updateForTopItem(state, s, ItemDisplayContext.FIRST_PERSON_RIGHT_HAND,
			player.level(), player, player.getId());
		state.submit(pose, collector, light, OverlayTexture.NO_OVERLAY, 0);
	}

	private static void recordPoints(GunAnimator.Frame frame, WeaponRenderData data, ItemStack stack) {
		AttachmentLoadout loadout = WeaponStacks.loadout(stack);
		Vector3f muzzle = data.muzzlePoint(loadout.get(AttachmentSlot.BARREL).orElse(null), loadout.get(AttachmentSlot.MUZZLE).orElse(null));
		LAST_MUZZLE_VIEW.set(toBlocks(muzzle));
		frame.gun.transformPosition(LAST_MUZZLE_VIEW);
		LAST_EJECT_VIEW.set(toBlocks(data.point("ejection")));
		frame.gun.transformPosition(LAST_EJECT_VIEW);
		hasRecentView = true;
	}

	private static Vector3f toBlocks(Vector3f px) {
		return new Vector3f(px.x / 16f - 0.5f, px.y / 16f - 0.5f, px.z / 16f - 0.5f);
	}

	/** Star-shaped flash facing the camera plus two crossed side planes along the bore. */
	private static void renderFlash(GunAnimator.Frame frame, WeaponRenderData data, ItemStack stack, PoseStack pose,
			SubmitNodeCollector collector, float strength) {
		AttachmentLoadout loadout = WeaponStacks.loadout(stack);
		Vector3f m = toBlocks(data.muzzlePoint(loadout.get(AttachmentSlot.BARREL).orElse(null), loadout.get(AttachmentSlot.MUZZLE).orElse(null)));
		int variant = Math.floorMod((int) frame.flashRoll, 3);
		float s = (0.25f + 0.15f * strength) / frame.scale * frame.flash; // world size independent of model scale
		int alpha = (int) (255 * Math.min(1, frame.flash * 1.4f));
		pose.pushPose();
		pose.translate(m.x, m.y, m.z);
		pose.mulPose(new Quaternionf().rotateZ((float) Math.toRadians(frame.flashRoll)));
		collector.submitCustomGeometry(pose, RenderTypes.eyes(FLASH_FRONT[variant]), (p, vc) -> {
			quad(vc, p, -s * 0.5f, -s * 0.5f, 0, s * 0.5f, s * 0.5f, 0, alpha, true);
		});
		float len = s * 1.6f;
		for (int i = 0; i < 2; i++) {
			pose.pushPose();
			pose.mulPose(new Quaternionf().rotateZ((float) Math.toRadians(90 * i)));
			collector.submitCustomGeometry(pose, RenderTypes.eyes(FLASH_SIDE[variant]), (p, vc) -> {
				sideQuad(vc, p, len, s * 0.35f, alpha);
			});
			pose.popPose();
		}
		pose.popPose();
	}

	private static void quad(VertexConsumer vc, PoseStack.Pose p, float x0, float y0, float z, float x1, float y1, float z1, int a, boolean front) {
		v(vc, p, x0, y0, z, 0, 1, a);
		v(vc, p, x1, y0, z, 1, 1, a);
		v(vc, p, x1, y1, z1, 1, 0, a);
		v(vc, p, x0, y1, z1, 0, 0, a);
	}

	/** Plane containing the bore (YZ plane), extending toward -Z from the muzzle. */
	private static void sideQuad(VertexConsumer vc, PoseStack.Pose p, float len, float half, int a) {
		v(vc, p, 0, -half, 0, 0, 1, a);
		v(vc, p, 0, -half, -len, 1, 1, a);
		v(vc, p, 0, half, -len, 1, 0, a);
		v(vc, p, 0, half, 0, 0, 0, a);
	}

	private static void v(VertexConsumer vc, PoseStack.Pose p, float x, float y, float z, float u, float vv, int a) {
		vc.addVertex(p, x, y, z).setColor(255, 255, 255, a).setUv(u, vv).setOverlay(OverlayTexture.NO_OVERLAY).setLight(0xF000F0)
			.setNormal(p, 0, 0, 1);
	}

	// ------------------------------------------------------------------------------------------------ arms

	/** Right/left shoulder anchors in view space (off-screen, below and behind the camera). */
	private static final Vector3f RIGHT_SHOULDER = new Vector3f(0.42f, -0.62f, 0.05f);
	private static final Vector3f LEFT_SHOULDER = new Vector3f(-0.34f, -0.66f, 0.02f);

	private static void renderArms(LocalPlayer player, GunAnimator.Frame frame, PoseStack pose, SubmitNodeCollector collector, int light,
			WeaponRenderData data) {
		Minecraft mc = Minecraft.getInstance();
		AvatarRenderer<net.minecraft.client.player.AbstractClientPlayer> renderer = mc.getEntityRenderDispatcher().getPlayerRenderer(player);
		Identifier skin = player.getSkin().body().texturePath();
		boolean slim = player.getSkin().model() == net.minecraft.world.entity.player.PlayerModelType.SLIM;
		Vector3f right = new Vector3f(toBlocks(frame.rightHand));
		frame.gun.transformPosition(right);
		placeArm(pose, right, RIGHT_SHOULDER, true, slim, frame.scale);
		renderer.renderRightHand(pose, collector, light, skin, player.isModelPartShown(PlayerModelPart.RIGHT_SLEEVE));
		pose.popPose();

		Vector3f left = new Vector3f(toBlocks(frame.leftHand));
		frame.gun.transformPosition(left);
		placeArm(pose, left, LEFT_SHOULDER, false, slim, frame.scale);
		renderer.renderLeftHand(pose, collector, light, skin, player.isModelPartShown(PlayerModelPart.LEFT_SLEEVE));
		pose.popPose();
	}

	/**
	 * Pushes a pose that maps the vanilla arm model so its hand sits at {@code hand} and the arm runs toward
	 * {@code shoulder}, scaled thin to match the weapon. Caller must pop.
	 */
	private static void placeArm(PoseStack pose, Vector3f hand, Vector3f shoulder, boolean rightArm, boolean slim, float gunScale) {
		// Arm geometry in part space (model px, Y down): pivot (∓5, 2, 0); vanilla renderHand sets zRot = ±0.1.
		float zRot = rightArm ? 0.1f : -0.1f;
		float px = rightArm ? -5 : 5;
		float handLocalX = rightArm ? (slim ? -0.5f : -1f) : (slim ? 0.5f : 1f);
		Vector3f handArm = rotZ(new Vector3f(handLocalX, 10, 0), zRot).add(px, 2, 0).div(16f);
		Vector3f shoulderArm = rotZ(new Vector3f(handLocalX, -2, 0), zRot).add(px, 2, 0).div(16f);

		Vector3f axisLocal = new Vector3f(shoulderArm).sub(handArm);
		float armLen = axisLocal.length();
		axisLocal.normalize();
		Vector3f frontLocal = new Vector3f(0, 0, -1);
		Vector3f sideLocal = new Vector3f(axisLocal).cross(frontLocal).normalize();
		frontLocal.set(sideLocal).cross(axisLocal).normalize();

		Vector3f axisT = new Vector3f(shoulder).sub(hand);
		float targetLen = axisT.length();
		axisT.normalize();
		// The palm faces the weapon: roughly toward the view centre line.
		Vector3f frontT = new Vector3f(rightArm ? -1 : 1, 0.15f, -0.2f);
		Vector3f sideT = new Vector3f(axisT).cross(frontT).normalize();
		frontT.set(sideT).cross(axisT).normalize();

		Matrix4f local = new Matrix4f().set(new float[] {
			sideLocal.x, sideLocal.y, sideLocal.z, 0,
			axisLocal.x, axisLocal.y, axisLocal.z, 0,
			frontLocal.x, frontLocal.y, frontLocal.z, 0,
			0, 0, 0, 1});
		Matrix4f target = new Matrix4f().set(new float[] {
			sideT.x, sideT.y, sideT.z, 0,
			axisT.x, axisT.y, axisT.z, 0,
			frontT.x, frontT.y, frontT.z, 0,
			0, 0, 0, 1});
		float thick = Math.max(0.35f, Math.min(0.6f, gunScale * 1.4f));
		Matrix4f m = new Matrix4f().translate(hand).mul(target).scale(thick, targetLen / armLen, thick).mul(local.transpose(new Matrix4f()))
			.translate(-handArm.x, -handArm.y, -handArm.z);
		pose.pushPose();
		pose.mulPose(m);
	}

	private static Vector3f rotZ(Vector3f v, float a) {
		float c = (float) Math.cos(a);
		float s = (float) Math.sin(a);
		return new Vector3f(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
	}
}
