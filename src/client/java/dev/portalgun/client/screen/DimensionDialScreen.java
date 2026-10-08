package dev.portalgun.client.screen;

import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.item.PortalGunItem;
import dev.portalgun.net.SetDestinationPayload;
import dev.portalgun.registry.ModSounds;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.resources.Identifier;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.util.Mth;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

/** The portal gun's dimension dial: a searchable grid of every reachable dimension. */
public class DimensionDialScreen extends Screen {
	private static final int CARD_H = 34;
	private static final int GAP = 4;
	private static final int GREEN = 0xFF7CE84A;
	private static final int DIM_GREEN = 0xFF3C8A2A;

	private final InteractionHand hand;
	private final java.util.Set<Identifier> visited;
	private final Identifier current;
	private EditBox search;
	private List<Destination> filtered = new ArrayList<>();
	private double scroll;
	private int left;
	private int top;
	private int gridW;
	private int gridH;
	private int cols;
	private Destination hovered;
	private float openAnim;

	public DimensionDialScreen(InteractionHand hand, ItemStack gun) {
		super(Component.translatable("screen.portalgun.dial"));
		this.hand = hand;
		this.current = PortalGunItem.getDestination(gun);
		java.util.Set<Identifier> v = net.minecraft.client.Minecraft.getInstance().player == null ? null
			: net.minecraft.client.Minecraft.getInstance().player.getAttached(dev.portalgun.registry.ModAttachments.VISITED);
		this.visited = v == null ? java.util.Set.of() : v;
	}

	@Override
	protected void init() {
		int panelW = Math.min(this.width - 20, 520);
		this.left = (this.width - panelW) / 2;
		this.top = 44;
		this.gridW = panelW;
		this.gridH = this.height - this.top - 92;
		this.cols = panelW >= 400 ? 2 : 1;
		this.search = new EditBox(this.font, this.left, 22, panelW - 140, 16, Component.translatable("screen.portalgun.search"));
		this.search.setHint(Component.translatable("screen.portalgun.search").withStyle(ChatFormatting.DARK_GRAY));
		this.search.setResponder(s -> this.refilter());
		this.addRenderableWidget(this.search);
		this.addRenderableWidget(Button.builder(Component.translatable("screen.portalgun.random"), b -> this.pickRandom())
			.bounds(this.left + panelW - 134, 20, 64, 20).build());
		this.addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> this.onClose())
			.bounds(this.left + panelW - 66, 20, 66, 20).build());
		this.setInitialFocus(this.search);
		this.refilter();
		// scroll so the currently dialed dimension is visible
		int idx = 0;
		for (int i = 0; i < this.filtered.size(); i++) {
			if (this.filtered.get(i).id().equals(this.current)) {
				idx = i;
			}
		}
		int row = idx / this.cols;
		this.scroll = Mth.clamp(row * (CARD_H + GAP) - this.gridH / 2.0 + CARD_H, 0, this.maxScroll());
	}

	private void refilter() {
		String q = this.search == null ? "" : this.search.getValue().trim().toLowerCase(Locale.ROOT);
		this.filtered = new ArrayList<>();
		for (Destination d : Destinations.all()) {
			if (q.isEmpty() || d.name().toLowerCase(Locale.ROOT).contains(q) || d.code().toLowerCase(Locale.ROOT).contains(q)
				|| d.tagline().toLowerCase(Locale.ROOT).contains(q)) {
				this.filtered.add(d);
			}
		}
		this.scroll = Mth.clamp(this.scroll, 0, this.maxScroll());
	}

	private int rows() {
		return (this.filtered.size() + this.cols - 1) / this.cols;
	}

	private double maxScroll() {
		return Math.max(0, this.rows() * (CARD_H + GAP) - GAP - this.gridH);
	}

	private int cardW() {
		return (this.gridW - (this.cols - 1) * GAP) / this.cols;
	}

	private void pickRandom() {
		List<Destination> pool = new ArrayList<>();
		for (Destination d : Destinations.all()) {
			if (!d.vanilla() && !d.id().equals(this.current)) {
				pool.add(d);
			}
		}
		if (!pool.isEmpty() && this.minecraft != null) {
			this.choose(pool.get(this.minecraft.level.random.nextInt(pool.size())));
		}
	}

	private void choose(Destination d) {
		ClientPlayNetworking.send(new SetDestinationPayload(d.id(), this.hand == InteractionHand.OFF_HAND));
		if (this.minecraft != null) {
			this.minecraft.getSoundManager().play(SimpleSoundInstance.forUI(ModSounds.GUN_DIAL, 1.2F));
		}
		this.onClose();
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		if (event.button() == 0) {
			Destination d = this.cardAt(event.x(), event.y());
			if (d != null) {
				this.choose(d);
				return true;
			}
		}
		return super.mouseClicked(event, doubleClick);
	}

	@Override
	public boolean mouseScrolled(double mx, double my, double dx, double dy) {
		this.scroll = Mth.clamp(this.scroll - dy * 24, 0, this.maxScroll());
		return true;
	}

	private Destination cardAt(double mx, double my) {
		if (mx < this.left || mx >= this.left + this.gridW || my < this.top || my >= this.top + this.gridH) {
			return null;
		}
		int cw = this.cardW();
		int col = (int) ((mx - this.left) / (cw + GAP));
		double yy = my - this.top + this.scroll;
		int row = (int) (yy / (CARD_H + GAP));
		if (col >= this.cols || (mx - this.left) - col * (cw + GAP) > cw || yy - row * (CARD_H + GAP) > CARD_H) {
			return null;
		}
		int idx = row * this.cols + col;
		return idx >= 0 && idx < this.filtered.size() ? this.filtered.get(idx) : null;
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		this.openAnim = Math.min(1.0F, this.openAnim + partialTick * 0.15F);
		super.render(g, mouseX, mouseY, partialTick);
		g.drawString(this.font, Component.translatable("screen.portalgun.dial").withStyle(ChatFormatting.BOLD), this.left, 8, GREEN);
		long total = Destinations.all().stream().filter(d -> !d.vanilla()).count();
		String count = "Visited " + this.visited.size() + " / " + total + "    Showing " + this.filtered.size();
		g.drawString(this.font, count, this.left + this.gridW - this.font.width(count), 8, 0xFF5E9E4A);

		// frame
		g.fill(this.left - 4, this.top - 4, this.left + this.gridW + 4, this.top + this.gridH + 4, 0xC0081208);
		g.renderOutline(this.left - 4, this.top - 4, this.gridW + 8, this.gridH + 8, DIM_GREEN);

		this.hovered = this.cardAt(mouseX, mouseY);
		g.enableScissor(this.left, this.top, this.left + this.gridW, this.top + this.gridH);
		int cw = this.cardW();
		for (int i = 0; i < this.filtered.size(); i++) {
			int row = i / this.cols;
			int col = i % this.cols;
			int x = this.left + col * (cw + GAP);
			int y = this.top + row * (CARD_H + GAP) - (int) this.scroll;
			if (y + CARD_H < this.top || y > this.top + this.gridH) {
				continue;
			}
			this.renderCard(g, this.filtered.get(i), x, y, cw);
		}
		g.disableScissor();

		// scrollbar
		double max = this.maxScroll();
		if (max > 0) {
			int barH = Math.max(16, (int) (this.gridH * (this.gridH / (this.gridH + max))));
			int barY = this.top + (int) ((this.gridH - barH) * (this.scroll / max));
			g.fill(this.left + this.gridW + 1, barY, this.left + this.gridW + 3, barY + barH, GREEN);
		}

		// info panel
		Destination info = this.hovered != null ? this.hovered : Destinations.getOrHome(this.current);
		int iy = this.top + this.gridH + 10;
		g.fill(this.left - 4, iy - 4, this.left + this.gridW + 4, this.height - 6, 0xC0081208);
		g.renderOutline(this.left - 4, iy - 4, this.gridW + 8, this.height - iy - 2, DIM_GREEN);
		g.drawString(this.font, Component.literal(info.code() + "  ").withStyle(ChatFormatting.GREEN)
			.append(Component.literal(info.name()).withStyle(s -> s.withColor(info.color()).withBold(true))), this.left + 2, iy, 0xFFFFFFFF);
		List<FormattedCharSequence> lines = this.font.split(FormattedText.of(info.description()), this.gridW - 6);
		for (int l = 0; l < Math.min(lines.size(), 5); l++) {
			g.drawString(this.font, lines.get(l), this.left + 2, iy + 12 + l * 10, 0xFFB8C8B0);
		}
	}

	private void renderCard(GuiGraphics g, Destination d, int x, int y, int w) {
		boolean selected = d.id().equals(this.current);
		boolean hover = d == this.hovered;
		int bg = hover ? 0xE0233A1E : 0xD0121C10;
		g.fill(x, y, x + w, y + CARD_H, bg);
		int border = selected ? GREEN : hover ? 0xFF6FB85A : 0xFF2A4424;
		g.renderOutline(x, y, w, CARD_H, border);
		// swatch with a little swirl-ish ring
		int sw = 0xFF000000 | d.color();
		g.fill(x + 4, y + 4, x + 30, y + CARD_H - 4, 0xFF0A0F0A);
		g.fill(x + 6, y + 6, x + 28, y + CARD_H - 6, sw);
		g.fill(x + 11, y + 11, x + 23, y + CARD_H - 11, darken(sw, 0.55F));
		g.fill(x + 15, y + 15, x + 19, y + CARD_H - 15, brighten(sw));
		g.drawString(this.font, d.code(), x + 35, y + 4, selected ? GREEN : 0xFF8FD47A);
		int codeW = this.font.width(d.code());
		g.drawString(this.font, Component.literal(d.name()).withStyle(ChatFormatting.BOLD), x + 39 + codeW, y + 4, 0xFFFFFFFF);
		String tag = this.font.plainSubstrByWidth(d.tagline(), w - 40 - 34);
		g.drawString(this.font, tag, x + 35, y + 18, 0xFF98A890);
		// danger pips
		for (int p = 0; p < 5; p++) {
			int px = x + w - 34 + p * 6;
			int col = p < d.danger() ? dangerColor(d.danger()) : 0xFF2A3328;
			g.fill(px, y + CARD_H - 9, px + 4, y + CARD_H - 5, col);
		}
		if (selected) {
			g.drawString(this.font, "◆", x + w - 10, y + 4, GREEN);
		} else if (this.visited.contains(d.id())) {
			g.drawString(this.font, "✔", x + w - 11, y + 4, 0xFF6FB85A);
		}
	}

	private static int dangerColor(int danger) {
		return switch (danger) {
			case 1 -> 0xFF5BD45B;
			case 2 -> 0xFFB5D44B;
			case 3 -> 0xFFE8C23A;
			case 4 -> 0xFFE8803A;
			default -> 0xFFE84A3A;
		};
	}

	private static int darken(int argb, float f) {
		int r = (int) (((argb >> 16) & 0xFF) * f);
		int gg = (int) (((argb >> 8) & 0xFF) * f);
		int b = (int) ((argb & 0xFF) * f);
		return 0xFF000000 | r << 16 | gg << 8 | b;
	}

	private static int brighten(int argb) {
		int r = Math.min(255, ((argb >> 16) & 0xFF) + 90);
		int gg = Math.min(255, ((argb >> 8) & 0xFF) + 90);
		int b = Math.min(255, (argb & 0xFF) + 90);
		return 0xFF000000 | r << 16 | gg << 8 | b;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
