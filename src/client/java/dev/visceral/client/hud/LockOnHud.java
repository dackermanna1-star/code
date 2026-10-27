package dev.visceral.client.hud;

import dev.visceral.Visceral;
import dev.visceral.client.input.LockOn;
import dev.visceral.entity.VisceralEntity;
import dev.visceral.state.PhysState;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** Reticle drawn on the locked-on target; turns red when the target is open to a finisher. */
public final class LockOnHud {
	private static final Identifier TEXTURE = Visceral.id("textures/gui/lock_on.png");

	private LockOnHud() {
	}

	public static void render(GuiGraphics graphics, DeltaTracker delta) {
		LivingEntity target = LockOn.target();
		Minecraft mc = Minecraft.getInstance();
		if (target == null || mc.player == null || mc.options.hideGui) return;
		float pt = delta.getGameTimeDeltaPartialTick(true);
		Vec3 pos = target.getPosition(pt).add(0, target.getBbHeight() * 0.6, 0);
		Vec3 cam = mc.gameRenderer.getMainCamera().position();
		Vec3 look = Vec3.directionFromRotation(mc.gameRenderer.getMainCamera().xRot(), mc.gameRenderer.getMainCamera().yRot());
		if (pos.subtract(cam).dot(look) <= 0) return;
		Vec3 ndc = mc.gameRenderer.projectPointToScreen(pos);
		int w = graphics.guiWidth(), h = graphics.guiHeight();
		int x = (int) ((ndc.x + 1) * 0.5 * w), y = (int) ((1 - ndc.y) * 0.5 * h);
		PhysState s = VisceralEntity.state(target);
		boolean open = s.grounded() || s == PhysState.STAGGERED;
		float pulse = 0.75f + 0.25f * Mth.sin((mc.player.tickCount + pt) * 0.4f);
		int color = open ? ARGB.colorFromFloat(0.95f * pulse, 1f, 0.25f, 0.2f) : ARGB.colorFromFloat(0.85f, 1f, 1f, 1f);
		int size = 20;
		graphics.blit(RenderPipelines.GUI_TEXTURED, TEXTURE, x - size / 2, y - size / 2, 0, 0, size, size, size, size, color);
	}
}
