package dev.juukulius.client.hud;

import dev.juukulius.character.JuliusAppearance;
import dev.juukulius.client.ClientJulius;
import dev.juukulius.client.config.JuliusClientConfig;
import dev.juukulius.client.input.JuliusKeys;
import dev.juukulius.client.render.FxDraw;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.combat.Ability;
import dev.juukulius.combat.CombatRules;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/**
 * Compact combat HUD: the six spirits (selected one raised and glowing, cooldown sweeps), the selected spirit's two
 * arts, the mana bar with its regeneration state, sword-technique cooldowns and the Al Cranvel gauge.
 */
public final class JuliusHud {
	private static final int WIDTH = 150;
	private static final int HEIGHT = 58;
	/** Width of the right column (sword technique icons and Al Cranvel). */
	private static final int SIDE = 44;
	private static float displayedMana = -1.0F;

	private JuliusHud() {
	}

	public static void render(GuiGraphics graphics, DeltaTracker tracker) {
		Minecraft minecraft = Minecraft.getInstance();
		LocalPlayer player = minecraft.player;
		JuliusClientConfig config = JuliusClientConfig.get();
		if (player == null || minecraft.options.hideGui || !config.showHud || player.isSpectator()) {
			return;
		}

		float partialTick = tracker.getGameTimeDeltaPartialTick(false);
		renderMessage(graphics, minecraft.font, partialTick);
		JuliusAppearance appearance = ClientJulius.appearance();
		if (!appearance.transformed()) {
			return;
		}

		float scale = (float) config.hudScale;
		int screenWidth = graphics.guiWidth();
		int screenHeight = graphics.guiHeight();
		int x;
		int y;
		switch (config.hudAnchor) {
			case BOTTOM_LEFT -> {
				x = 6;
				y = (int) (screenHeight / scale) - HEIGHT - 56;
			}
			case TOP_LEFT -> {
				x = 6;
				y = 6;
			}
			case TOP_RIGHT -> {
				x = (int) (screenWidth / scale) - WIDTH - 6;
				y = 6;
			}
			default -> {
				x = (int) ((screenWidth / 2.0F + 98.0F) / scale);
				y = (int) (screenHeight / scale) - HEIGHT - 2;
				if ((x + WIDTH) * scale > screenWidth) {
					// No room beside the hotbar: sit at the right edge above the hunger and air bars instead.
					x = (int) (screenWidth / scale) - WIDTH - 2;
					y -= 52;
				}
			}
		}

		graphics.pose().pushMatrix();
		graphics.pose().scale(scale, scale);
		draw(graphics, minecraft.font, player, appearance, x, y, partialTick);
		graphics.pose().popMatrix();
	}

	private static void draw(GuiGraphics graphics, Font font, LocalPlayer player, JuliusAppearance appearance, int x, int y, float partialTick) {
		long gameTime = player.level().getGameTime();
		float time = (gameTime + partialTick) / 20.0F;
		boolean ultimate = appearance.ultimateActive(gameTime);
		Spirit selected = ClientJulius.selectedSpirit();
		float flash = ClientJulius.deniedFlash(partialTick);

		// Panel
		int border = ultimate ? 0xFF000000 | FxDraw.rainbow(time * 0.5F) : 0xAA5B4A86;
		graphics.fill(x - 1, y - 1, x + WIDTH + 1, y + HEIGHT + 1, border);
		graphics.fill(x, y, x + WIDTH, y + HEIGHT, 0xC00C0A14);
		if (flash > 0.0F) {
			graphics.fill(x, y, x + WIDTH, y + HEIGHT, FxDraw.argb(flash * 0.35F, 0xFF3040));
		}

		// Spirits
		for (Spirit spirit : Spirit.values()) {
			boolean isSelected = spirit == selected;
			int size = isSelected ? 18 : 16;
			int sx = x + 4 + spirit.ordinal() * 24 + (isSelected ? 0 : 1);
			int sy = y + 4 + (isSelected ? 0 : 1);
			int color = 0xFF000000 | spirit.color;
			if (isSelected) {
				float pulse = 0.55F + 0.45F * Mth.sin(time * 4.0F);
				graphics.fill(sx - 1, sy - 1, sx + size + 1, sy + size + 1, FxDraw.argb(0.5F + 0.4F * pulse, spirit.color));
			}

			graphics.fill(sx, sy, sx + size, sy + size, appearance.spiritsOut() ? 0xFF1A1726 : 0xFF0E0D12);
			int iconTint = appearance.spiritsOut() ? color : 0xFF555060;
			graphics.blit(RenderPipelines.GUI_TEXTURED, JuliusTextures.HUD_ICONS, sx + 1, sy + 1, spirit.ordinal() * 16, 0.0F, size - 2, size - 2, 16, 16,
				128, 64, iconTint);
			drawCooldown(graphics, font, spirit.primaryArt, sx, sy, size, false);
		}

		// Arts of the selected spirit (left column), sword techniques and Al Cranvel (right column)
		int textWidth = WIDTH - SIDE - 8;
		Component artKey = JuliusKeys.SPIRIT_ART.getTranslatedKeyMessage();
		Component primary = artLine(selected.primaryArt, Component.translatable("gui.julius_juukulius.key_art", artKey));
		Component combination = artLine(selected.combinationArt, Component.translatable("gui.julius_juukulius.key_sneak_art", artKey));
		graphics.drawString(font, fit(font, primary, textWidth), x + 4, y + 26, 0xFF000000 | selected.accent, true);
		graphics.drawString(font, fit(font, combination, textWidth), x + 4, y + 37, 0xFFB9A3E3, true);

		int iconX = x + WIDTH - SIDE + 3;
		int iconY = y + 25;
		drawAbilityIcon(graphics, font, Ability.HEAVY_STRIKE, iconX, iconY, 6, 0xFFE8E4FF);
		drawAbilityIcon(graphics, font, Ability.AL_CLAUZERIA, iconX + 13, iconY, 7, 0xFFFFFFFF);
		drawAbilityIcon(graphics, font, Ability.AL_CLARISTA, iconX + 26, iconY, 8, 0xFFFFFFFF);

		float mana = ClientJulius.mana();
		int ultX = iconX;
		int ultY = y + 40;
		if (ultimate) {
			float remaining = Math.max(0.0F, (appearance.ultimateEnd() - gameTime - partialTick) / CombatRules.ULTIMATE_DURATION);
			graphics.fill(ultX, ultY, ultX + 38, ultY + 5, 0xFF000000);
			int width = Math.round(36 * Mth.clamp(remaining, 0.0F, 1.0F));
			for (int i = 0; i < width; i++) {
				graphics.fill(ultX + 1 + i, ultY + 1, ultX + 2 + i, ultY + 4, 0xFF000000 | FxDraw.rainbow(i / 36.0F + time));
			}
		} else {
			int cooldown = ClientJulius.cooldown(Ability.AL_CRANVEL);
			if (cooldown > 0) {
				// Recharging: a filling bar with the seconds left.
				float fraction = Mth.clamp(cooldown / (float) Math.max(1, ClientJulius.cooldownLength(Ability.AL_CRANVEL)), 0.0F, 1.0F);
				String seconds = (cooldown + 19) / 20 + "s";
				int barWidth = 36 - font.width(seconds) - 3;
				graphics.fill(ultX, ultY + 1, ultX + barWidth + 2, ultY + 6, 0xFF000000);
				graphics.fill(ultX + 1, ultY + 2, ultX + 1 + Math.round(barWidth * (1.0F - fraction)), ultY + 5, 0xFF6B6578);
				graphics.drawString(font, seconds, ultX + barWidth + 4, ultY, 0xFFAAAAAA, true);
			} else {
				boolean ready = mana >= CombatRules.ULTIMATE_MIN_MANA;
				int color = ready ? 0xFF000000 | FxDraw.rainbow(time * 0.3F) : 0xFF6B6578;
				graphics.drawString(font, Component.translatable("gui.julius_juukulius.ultimate_short"), ultX, ultY, color, true);
			}
		}

		// Mana
		displayedMana = displayedMana < 0.0F ? mana : Mth.lerp(0.25F, displayedMana, mana);
		int barX = x + 4;
		int barY = y + HEIGHT - 7;
		int barWidth = WIDTH - 30;
		graphics.fill(barX - 1, barY - 1, barX + barWidth + 1, barY + 4, 0xFF000000);
		int filled = Math.round(barWidth * Mth.clamp(displayedMana / CombatRules.MAX_MANA, 0.0F, 1.0F));
		for (int i = 0; i < filled; i++) {
			int c = ultimate ? FxDraw.rainbow(i / (float) barWidth + time * 0.6F) : FxDraw.lerpRgb(i / (float) barWidth, 0x6E5BD8, 0xC7B6FF);
			graphics.fill(barX + i, barY, barX + i + 1, barY + 3, 0xFF000000 | c);
		}

		String manaText = String.valueOf(Math.round(mana));
		graphics.drawString(font, manaText, x + WIDTH - 4 - font.width(manaText), barY - 2, appearance.spiritsOut() ? 0xFFE6E0FF : 0xFF9ADFB8, true);
	}

	/** Trims a HUD line to {@code width} pixels, ending in an ellipsis when it does not fit. */
	private static String fit(Font font, Component text, int width) {
		String plain = text.getString();
		if (font.width(plain) <= width) {
			return plain;
		}

		return font.plainSubstrByWidth(plain, width - font.width("…")) + "…";
	}

	private static Component artLine(Ability ability, Component key) {
		int cooldown = ClientJulius.cooldown(ability);
		Component name = ability.displayName();
		if (cooldown > 0) {
			return Component.translatable("gui.julius_juukulius.art_cooldown", key, name, (cooldown + 19) / 20);
		}

		return Component.translatable("gui.julius_juukulius.art_ready", key, name);
	}

	private static void drawAbilityIcon(GuiGraphics graphics, Font font, Ability ability, int x, int y, int iconIndex, int tint) {
		graphics.fill(x, y, x + 12, y + 12, 0xFF1A1726);
		graphics.blit(RenderPipelines.GUI_TEXTURED, JuliusTextures.HUD_ICONS, x, y, iconIndex % 8 * 16, iconIndex / 8 * 16, 12, 12, 16, 16, 128, 64,
			tint);
		drawCooldown(graphics, font, ability, x, y, 12, true);
	}

	private static void drawCooldown(GuiGraphics graphics, Font font, Ability ability, int x, int y, int size, boolean small) {
		int cooldown = ClientJulius.cooldown(ability);
		if (cooldown <= 0) {
			return;
		}

		float fraction = Mth.clamp(cooldown / (float) Math.max(1, ClientJulius.cooldownLength(ability)), 0.0F, 1.0F);
		int covered = Math.round(size * fraction);
		graphics.fill(x, y + size - covered, x + size, y + size, 0xB0000000);
		if (!small && cooldown > 10) {
			String seconds = String.valueOf((cooldown + 19) / 20);
			graphics.drawString(font, seconds, x + size - font.width(seconds), y + size - 8, 0xFFFFFFFF, true);
		}
	}

	private static void renderMessage(GuiGraphics graphics, Font font, float partialTick) {
		Component message = ClientJulius.message();
		if (message == null) {
			return;
		}

		float alpha = Mth.clamp(ClientJulius.messageAlpha(partialTick), 0.0F, 1.0F);
		int x = graphics.guiWidth() / 2;
		int y = graphics.guiHeight() - 72;
		graphics.drawCenteredString(font, message, x, y, FxDraw.argb(alpha, 0xFFB7C4));
	}
}
