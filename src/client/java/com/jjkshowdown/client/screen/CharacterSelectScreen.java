package com.jjkshowdown.client.screen;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.ability.Abilities;
import com.jjkshowdown.ability.Ability;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.entity.boss.GojoBoss;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.entity.boss.SukunaBoss;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModEntities;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

import java.util.ArrayList;
import java.util.List;

/** Choose Satoru Gojo or Ryomen Sukuna: live 3D previews, technique lists with unlock levels. */
public class CharacterSelectScreen extends Screen {
	private static final AbilitySlot[] ORDER = {AbilitySlot.PRIMARY, AbilitySlot.SECONDARY, AbilitySlot.TERTIARY, AbilitySlot.ULTIMATE,
			AbilitySlot.TOGGLE, AbilitySlot.DOMAIN, AbilitySlot.HEAL};
	private final boolean firstTime;
	private SorcererBoss gojoPreview;
	private SorcererBoss sukunaPreview;
	private int cardW, cardH, gojoX, sukunaX, cardY;
	private float openAnim;

	public CharacterSelectScreen(boolean firstTime) {
		super(Component.translatable("screen.jjkshowdown.select"));
		this.firstTime = firstTime;
	}

	@Override
	protected void init() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level != null) {
			if (gojoPreview == null) gojoPreview = new GojoBoss(ModEntities.GOJO, mc.level);
			if (sukunaPreview == null) sukunaPreview = new SukunaBoss(ModEntities.SUKUNA, mc.level);
		}
		cardW = Math.min(180, (width - 40) / 2);
		cardY = 20;
		cardH = Math.min(260, height - cardY - 30);
		gojoX = width / 2 - cardW - 6;
		sukunaX = width / 2 + 6;
		CharacterType current = ClientState.character();
		addRenderableWidget(Button.builder(Component.translatable(current == CharacterType.GOJO ? "screen.jjkshowdown.chosen" : "screen.jjkshowdown.choose_gojo"),
				b -> choose(CharacterType.GOJO)).bounds(gojoX + 10, cardY + cardH - 24, cardW - 20, 20).build()).active = current != CharacterType.GOJO;
		addRenderableWidget(Button.builder(Component.translatable(current == CharacterType.SUKUNA ? "screen.jjkshowdown.chosen" : "screen.jjkshowdown.choose_sukuna"),
				b -> choose(CharacterType.SUKUNA)).bounds(sukunaX + 10, cardY + cardH - 24, cardW - 20, 20).build()).active = current != CharacterType.SUKUNA;
		addRenderableWidget(Button.builder(Component.translatable(firstTime ? "screen.jjkshowdown.later" : "gui.done"), b -> onClose())
				.bounds(width / 2 - 50, height - 24, 100, 20).build());
		if (current.isSorcerer()) {
			addRenderableWidget(Button.builder(Component.translatable("screen.jjkshowdown.settings"), b -> minecraft.setScreen(new JjkConfigScreen(this)))
					.bounds(width - 86, height - 24, 80, 20).build());
		}
	}

	private void choose(CharacterType type) {
		ClientPlayNetworking.send(new Payloads.SelectCharacter(type.ordinal()));
		Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(ModSounds.UI_SELECT, 1.0f));
		onClose();
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
		openAnim = Math.min(1f, openAnim + partial * 0.08f);
		g.drawCenteredString(font, title, width / 2, 6, 0xFFFFFFFF);
		renderCard(g, CharacterType.GOJO, gojoX, gojoPreview, mouseX, mouseY);
		renderCard(g, CharacterType.SUKUNA, sukunaX, sukunaPreview, mouseX, mouseY);
		super.render(g, mouseX, mouseY, partial);
	}

	private void renderCard(GuiGraphics g, CharacterType type, int x, SorcererBoss preview, int mouseX, int mouseY) {
		boolean hover = mouseX >= x && mouseX < x + cardW && mouseY >= cardY && mouseY < cardY + cardH;
		int y = cardY + (int) ((1 - openAnim) * 20);
		Identifier bg = JjkShowdown.id("textures/gui/select_" + type.id() + ".png");
		g.fill(x - 2, y - 2, x + cardW + 2, y + cardH + 2, hover ? (0xFF000000 | type.accentColor) : 0xFF202028);
		g.blit(RenderPipelines.GUI_TEXTURED, bg, x, y, 0, 0, cardW, cardH, 160, 240, 160, 240);
		g.fillGradient(x, y + cardH - 64, x + cardW, y + cardH, 0x00000000, 0xD0000000);
		g.drawCenteredString(font, type.displayName(), x + cardW / 2, y + 5, 0xFFFFFFFF);
		g.pose().pushMatrix();
		g.pose().translate(x + cardW / 2f, y + 16);
		g.pose().scale(0.75f, 0.75f);
		g.drawCenteredString(font, type.title(), 0, 0, 0xFF000000 | type.accentColor);
		g.pose().popMatrix();
		int iconsY = y + cardH - 50;
		if (preview != null) {
			int top = y + 26, bottom = iconsY - 4;
			int modelH = Math.max(30, bottom - top);
			InventoryScreen.renderEntityInInventoryFollowsMouse(g, x + cardW / 2 - 40, top, x + cardW / 2 + 40, bottom,
					Math.max(16, (int) (modelH * 0.42f)), 0.0625f, mouseX, mouseY, preview);
		}
		// technique icons with unlock levels; hover for details
		int mastery = ClientState.self != null && ClientState.character() == type ? ClientState.self.mastery() : 1;
		boolean creative = ClientState.has(Payloads.SorcererSync.F_CREATIVE_UNLOCK) && ClientState.character() == type;
		int size = 16, gap = 3;
		int rowW = ORDER.length * size + (ORDER.length - 1) * gap;
		int ix = x + (cardW - rowW) / 2;
		List<Component> tooltip = new ArrayList<>();
		for (AbilitySlot slot : ORDER) {
			Ability a = Abilities.get(type, slot);
			if (a == null) continue;
			boolean unlocked = creative || mastery >= a.unlockLevel;
			g.fill(ix - 1, iconsY - 1, ix + size + 1, iconsY + size + 1, unlocked ? (0xFF000000 | type.accentColor) : 0xFF404048);
			g.pose().pushMatrix();
			g.pose().translate(ix, iconsY);
			g.pose().scale(size / 32f, size / 32f);
			g.blit(RenderPipelines.GUI_TEXTURED, a.icon(), 0, 0, 0, 0, 32, 32, 32, 32, 32, 32, unlocked ? 0xFFFFFFFF : 0xFF707070);
			g.pose().popMatrix();
			String lv = String.valueOf(a.unlockLevel);
			g.pose().pushMatrix();
			g.pose().translate(ix + size / 2f, iconsY + size + 2);
			g.pose().scale(0.6f, 0.6f);
			g.drawCenteredString(font, "Lv" + lv, 0, 0, unlocked ? 0xFF90FF90 : 0xFFFFC040);
			g.pose().popMatrix();
			if (mouseX >= ix && mouseX < ix + size && mouseY >= iconsY && mouseY < iconsY + size) {
				tooltip.add(a.displayName().copy().withColor(type.accentColor));
				tooltip.add(Component.translatable("screen.jjkshowdown.unlock_at", a.unlockLevel).withColor(unlocked ? 0x90FF90 : 0xFFC040));
				tooltip.addAll(font.split(a.description(), 200).stream().map(f -> (Component) Component.literal(toPlain(f))).toList());
			}
			ix += size + gap;
		}
		if (!tooltip.isEmpty()) g.setComponentTooltipForNextFrame(font, tooltip, mouseX, mouseY);
	}

	private static String toPlain(net.minecraft.util.FormattedCharSequence seq) {
		StringBuilder sb = new StringBuilder();
		seq.accept((idx, style, cp) -> {
			sb.appendCodePoint(cp);
			return true;
		});
		return sb.toString();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	public static float clamp(float v) {
		return Mth.clamp(v, 0, 1);
	}
}
