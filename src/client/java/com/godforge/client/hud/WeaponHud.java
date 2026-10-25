package com.godforge.client.hud;

import com.godforge.client.ClientConfig;
import com.godforge.client.ClientState;
import com.godforge.client.input.Keybinds;
import com.godforge.weapon.BeamColors;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import net.minecraft.ChatFormatting;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

/** Compact weapon status above the hotbar plus a charge meter under the crosshair. */
public final class WeaponHud {
	private WeaponHud() {
	}

	public static void render(GuiGraphics graphics, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		LocalPlayer player = mc.player;
		if (player == null || !ClientConfig.get().hud || mc.options.hideGui) {
			return;
		}
		ItemStack stack = player.getMainHandItem();
		if (!(stack.getItem() instanceof GodWeaponItem)) {
			stack = player.getOffhandItem();
		}
		if (!(stack.getItem() instanceof GodWeaponItem weapon)) {
			return;
		}
		WeaponType type = weapon.type();
		WeaponSettings settings = GodWeaponItem.settings(stack);
		WeaponMode mode = type.mode(settings.mode());
		Font font = mc.font;
		int w = graphics.guiWidth();
		int h = graphics.guiHeight();
		int accent = type == WeaponType.LASER_BEAM ? BeamColors.rgb(settings.color(), player.tickCount) : type.color();

		// status panel above the hotbar (left of centre so it never covers the vanilla item name)
		int panelW = 150;
		int x = w / 2 - 91 - panelW - 6;
		int y = h - 40;
		if (x < 4) {
			x = 4;
			y = h - 92;
		}
		graphics.fill(x, y, x + panelW, y + 36, 0xA0101018);
		graphics.fill(x, y, x + 2, y + 36, ARGB.opaque(accent));
		graphics.drawString(font, Component.translatable(type.translationKey()).withStyle(ChatFormatting.BOLD), x + 6, y + 3, ARGB.opaque(accent), true);
		Component modeText = Component.translatable(mode.translationKey());
		graphics.drawString(font, Component.literal(mode.ultimate() ? "★ " : "▸ ").append(modeText), x + 6, y + 14, mode.ultimate() ? 0xFFFFC94A : 0xFFB8E8FF, true);

		int ult = ClientState.remaining(type);
		String ultText = ult > 0 ? Component.translatable("hud.godforge.ultimate_cd", (ult + 19) / 20).getString() : Component.translatable("hud.godforge.ultimate_ready").getString();
		graphics.drawString(font, ultText, x + 6, y + 25, ult > 0 ? 0xFF9A9AAA : 0xFFFFD25A, true);
		if (ult > 0) {
			int bw = panelW - 12;
			float f = ClientState.fraction(type);
			graphics.fill(x + 6, y + 34, x + 6 + bw, y + 35, 0xFF303040);
			graphics.fill(x + 6, y + 34, x + 6 + (int) (bw * (1.0F - f)), y + 35, 0xFFFFC94A);
		}
		String hint = Keybinds.hint();
		if (!hint.isEmpty()) {
			graphics.drawString(font, hint, x + panelW - font.width(hint) - 4, y + 3, 0xFF707080, false);
		}

		// charge meter under the crosshair
		if (player.isUsingItem() && player.getUseItem() == stack) {
			int used = GodWeaponItem.usedTicks(stack, player, player.getUseItemRemainingTicks());
			float charge = weapon.chargeFraction(stack, used);
			boolean channel = mode.chargeTicks() == 0;
			int cx = w / 2;
			int cy = h / 2 + 12;
			int bw = 64;
			graphics.fill(cx - bw / 2 - 1, cy - 1, cx + bw / 2 + 1, cy + 4, 0xA0000000);
			int fillColor = charge >= 1.0F && !channel ? (player.tickCount / 3 % 2 == 0 ? 0xFFFFFFFF : ARGB.opaque(type.accent())) : ARGB.opaque(accent);
			int filled = channel ? bw : (int) (bw * charge);
			graphics.fill(cx - bw / 2, cy, cx - bw / 2 + filled, cy + 3, fillColor);
			if (!channel) {
				String pct = charge >= 1.0F ? Component.translatable("hud.godforge.charged").getString() : Mth.floor(charge * 100) + "%";
				graphics.drawCenteredString(font, pct, cx, cy + 6, charge >= 1.0F ? 0xFFFFFFFF : 0xFFB0B0C0);
			} else {
				graphics.drawCenteredString(font, Component.translatable("hud.godforge.power", settings.power()).getString(), cx, cy + 6, ARGB.opaque(accent));
			}
		}
	}

	public static InteractionHand heldHand(LocalPlayer player) {
		return player.getMainHandItem().getItem() instanceof GodWeaponItem ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
	}
}
