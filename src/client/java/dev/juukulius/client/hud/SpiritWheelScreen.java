package dev.juukulius.client.hud;

import dev.juukulius.client.ClientJulius;
import dev.juukulius.client.input.ClientCombat;
import dev.juukulius.client.input.JuliusKeys;
import dev.juukulius.client.render.JuliusTextures;
import dev.juukulius.combat.Ability;
import dev.juukulius.spirit.Spirit;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.util.Util;
import org.lwjgl.glfw.GLFW;

/**
 * Radial spirit selector: hold the spirit key, point the mouse at a spirit (or scroll, or press 1-6), release to choose.
 * Does not pause the game.
 */
public class SpiritWheelScreen extends Screen {
	private static final int RADIUS = 62;
	private int highlighted;
	private final long openedAt = Util.getMillis();

	public SpiritWheelScreen() {
		super(Component.translatable("gui.julius_juukulius.spirit_wheel"));
		this.highlighted = ClientJulius.selectedSpirit().ordinal();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		graphics.fill(0, 0, this.width, this.height, 0x55000000);
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		super.render(graphics, mouseX, mouseY, partialTick);
		float appear = Math.min(1.0F, (Util.getMillis() - this.openedAt) / 150.0F * 0.7F + 0.3F);
		int cx = this.width / 2;
		int cy = this.height / 2;
		double dx = mouseX - cx;
		double dy = mouseY - cy;
		if (dx * dx + dy * dy > 18 * 18) {
			double angle = Math.atan2(dy, dx) + Math.PI / 2.0 + Math.PI / Spirit.COUNT;
			this.highlighted = Mth.positiveModulo((int) Math.floor(angle / (Math.PI * 2.0 / Spirit.COUNT)), Spirit.COUNT);
		}

		graphics.blit(RenderPipelines.GUI_TEXTURED, JuliusTextures.WHEEL, cx - 80, cy - 80, 0.0F, 0.0F, 160, 160, 160, 160, 0xE6FFFFFF);
		for (Spirit spirit : Spirit.values()) {
			double angle = spirit.ordinal() * Math.PI * 2.0 / Spirit.COUNT - Math.PI / 2.0;
			int r = (int) (RADIUS * appear);
			int x = cx + (int) Math.round(Math.cos(angle) * r);
			int y = cy + (int) Math.round(Math.sin(angle) * r);
			boolean selected = spirit.ordinal() == this.highlighted;
			int size = selected ? 28 : 22;
			int glow = 0xFF000000 | spirit.color;
			if (selected) {
				graphics.fill(x - size / 2 - 2, y - size / 2 - 2, x + size / 2 + 2, y + size / 2 + 2, 0x66000000 | spirit.color);
			}

			graphics.fill(x - size / 2, y - size / 2, x + size / 2, y + size / 2, 0xCC10101A);
			graphics.blit(RenderPipelines.GUI_TEXTURED, JuliusTextures.HUD_ICONS, x - size / 2 + 2, y - size / 2 + 2, spirit.ordinal() * 16, 0.0F,
				size - 4, size - 4, 16, 16, 128, 64, glow);
			int cooldown = ClientJulius.cooldown(spirit.primaryArt);
			if (cooldown > 0) {
				graphics.drawCenteredString(this.font, String.valueOf((cooldown + 19) / 20), x, y - 4, 0xFFFFFFFF);
			}
		}

		Spirit spirit = Spirit.byIndex(this.highlighted);
		graphics.drawCenteredString(this.font, spirit.displayName(), cx, cy - 10, 0xFF000000 | spirit.color);
		graphics.drawCenteredString(this.font, Component.translatable("spirit.julius_juukulius." + spirit.id + ".element"), cx, cy + 2, 0xFFDDDDDD);
		// The arts are listed above the wheel, clear of the hotbar.
		Ability primary = spirit.primaryArt;
		Ability combination = spirit.combinationArt;
		int textY = Math.max(2, cy - 80 - 24);
		graphics.drawCenteredString(this.font, primary.displayName(), cx, textY, 0xFFFFFFFF);
		graphics.drawCenteredString(this.font, Component.translatable("gui.julius_juukulius.sneak_art", combination.displayName()), cx, textY + 11,
			0xFFB9A3E3);
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		this.highlighted = Mth.positiveModulo(this.highlighted - (int) Math.signum(scrollY), Spirit.COUNT);
		return true;
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		this.confirm();
		return true;
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		int key = event.key();
		if (key >= GLFW.GLFW_KEY_1 && key <= GLFW.GLFW_KEY_6) {
			this.highlighted = key - GLFW.GLFW_KEY_1;
			this.confirm();
			return true;
		}

		return super.keyPressed(event);
	}

	@Override
	public boolean keyReleased(KeyEvent event) {
		if (JuliusKeys.SPIRIT_SELECT.matches(event)) {
			this.confirm();
			return true;
		}

		return super.keyReleased(event);
	}

	private void confirm() {
		if (this.minecraft != null && this.minecraft.player != null) {
			ClientCombat.selectSpirit(this.minecraft, this.minecraft.player, Spirit.byIndex(this.highlighted));
		}

		ClientCombat.onWheelClosed();
		this.onClose();
	}
}
