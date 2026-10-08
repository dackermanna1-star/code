package dev.portalgun.client.hud;

import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.entity.PortalEntity;
import dev.portalgun.item.PortalGunItem;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Small readout like the gun's screen: dialed dimension + fluid level, plus a label when looking at a portal. */
public final class PortalGunHud {
	private PortalGunHud() {
	}

	public static void render(GuiGraphics g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		Player player = mc.player;
		if (player == null || mc.options.hideGui) {
			return;
		}
		Font font = mc.font;
		ItemStack gun = player.getMainHandItem().getItem() instanceof PortalGunItem ? player.getMainHandItem()
			: player.getOffhandItem().getItem() instanceof PortalGunItem ? player.getOffhandItem() : ItemStack.EMPTY;
		int sw = g.guiWidth();
		int sh = g.guiHeight();
		if (!gun.isEmpty()) {
			Destination d = Destinations.getOrHome(PortalGunItem.getDestination(gun));
			int charges = PortalGunItem.getCharges(gun);
			String code = d.code();
			String name = d.name();
			int w = Math.max(font.width(code) + font.width(name) + 14, 92);
			int x = sw / 2 + 96;
			int y = sh - 40;
			if (x + w > sw - 4) {
				x = sw - w - 4;
			}
			g.fill(x, y, x + w, y + 30, 0xB0101810);
			g.renderOutline(x, y, w, 30, 0xFF3C8A2A);
			g.drawString(font, code, x + 4, y + 4, 0xFFFF7A3A, false);
			g.drawString(font, name, x + 10 + font.width(code), y + 4, 0xFF000000 | d.color(), false);
			int barW = w - 8;
			g.fill(x + 4, y + 18, x + 4 + barW, y + 24, 0xFF0A1A0A);
			int filled = player.isCreative() ? barW : Math.round(barW * (charges / (float) PortalGunItem.MAX_CHARGES));
			g.fill(x + 4, y + 18, x + 4 + filled, y + 24, 0xFF7CE84A);
		}
		PortalEntity portal = lookedAtPortal(player, delta.getGameTimeDeltaPartialTick(true));
		if (portal != null) {
			Destination d = Destinations.getOrHome(portal.getDestination());
			String text = "→ " + d.name() + " (" + d.code() + ")";
			int tw = font.width(text);
			g.drawString(font, text, sw / 2 - tw / 2, sh / 2 + 12, 0xFF000000 | d.color(), true);
		}
	}

	private static PortalEntity lookedAtPortal(Player player, float pt) {
		Vec3 eye = player.getEyePosition(pt);
		Vec3 look = player.getViewVector(pt);
		Vec3 end = eye.add(look.scale(24));
		PortalEntity best = null;
		double bestDist = Double.MAX_VALUE;
		for (PortalEntity p : player.level().getEntitiesOfClass(PortalEntity.class, new AABB(eye, end).inflate(2))) {
			var hit = p.getBoundingBox().clip(eye, end);
			if (hit.isPresent()) {
				double dist = hit.get().distanceToSqr(eye);
				if (dist < bestDist) {
					bestDist = dist;
					best = p;
				}
			}
		}
		return best;
	}
}
