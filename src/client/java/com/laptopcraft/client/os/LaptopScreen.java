package com.laptopcraft.client.os;

import com.laptopcraft.client.os.ui.Gfx;
import com.laptopcraft.client.os.ui.Tooltips;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.CharacterEvent;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/**
 * The laptop screen: draws the CubeBook bezel around the display and hosts the session's
 * {@link CubeOS}. Not a pause screen — the world keeps running (deliveries arrive while you browse).
 * Closing it (Esc, walking away) puts the laptop to sleep; the session keeps its windows.
 */
public class LaptopScreen extends Screen {
	private static final double MAX_DISTANCE_SQ = 8.0 * 8.0;

	private final ClientLaptopSession session;
	private final CubeOS os;
	private final @Nullable Screen parent;
	private boolean closing;
	// layout
	private int bodyX;
	private int bodyY;
	private int bodyW;
	private int bodyH;
	private int dispX;
	private int dispY;
	private int dispW;
	private int dispH;
	private int deck;

	/**
	 * @param parent screen to return to when closed (offline dev laptop on the title screen), or null
	 */
	public LaptopScreen(ClientLaptopSession session, @Nullable Screen parent) {
		super(Component.translatable("laptopcraft.os.title"));
		this.session = session;
		this.parent = parent;
		boolean existing = session.hasOs();
		this.os = session.os();
		if (!existing) {
			os.boot();
		}
	}

	public CubeOS os() {
		return os;
	}

	public ClientLaptopSession session() {
		return session;
	}

	@Override
	protected void init() {
		Gfx.clearTextureCache();
		computeLayout();
		os.attach(this);
	}

	private void computeLayout() {
		int margin = Math.max(5, Math.min(18, Math.round(Math.min(width, height) * 0.025f)));
		int side = width >= 700 ? 8 : 6;
		int top = side + 2;
		int bottom = width >= 700 ? side + 8 : side + 6;
		deck = margin >= 8 ? 5 : 0;
		int maxW = 1100 + side * 2;
		int maxH = 640 + top + bottom;
		bodyW = Math.min(width - margin * 2, maxW);
		bodyH = Math.min(height - margin * 2 - deck, maxH);
		bodyX = (width - bodyW) / 2;
		bodyY = (height - deck - bodyH) / 2;
		dispX = bodyX + side;
		dispY = bodyY + top;
		dispW = bodyW - side * 2;
		dispH = bodyH - top - bottom;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}

	// ------------------------------------------------------------------ rendering

	@Override
	public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		if (minecraft.level == null) {
			renderPanorama(g, partialTick);
			g.fillGradient(0, 0, width, height, 0x70000000, 0xA0000000);
		} else {
			// keep the world visible but dim it, with a soft vignette towards the edges
			g.fillGradient(0, 0, width, height, 0x88080A10, 0xB0080A10);
		}
	}

	@Override
	public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
		renderBezel(g);
		g.nextStratum();
		g.pose().pushMatrix();
		g.pose().translate(dispX, dispY);
		g.enableScissor(0, 0, dispW, dispH);
		os.render(g, dispW, dispH, mouseX - dispX, mouseY - dispY, partialTick);
		g.disableScissor();
		g.pose().popMatrix();
		g.nextStratum();
		Tooltips.render(g, dispX, dispY, dispX + dispW, dispY + dispH);
	}

	private void renderBezel(GuiGraphics g) {
		// shadow under the laptop
		Gfx.shadow(g, bodyX, bodyY, bodyW, bodyH + deck, 10, 0x70);
		// keyboard deck edge (gives the laptop silhouette)
		if (deck > 0) {
			int dx = bodyX - 10;
			int dw = bodyW + 20;
			int dy = bodyY + bodyH - 1;
			Gfx.roundRect(g, dx, dy, dw, deck + 1, 2, 0xFF2B2E35, Gfx.BOTTOM);
			Gfx.rect(g, dx + 2, dy, dw - 4, 1, 0xFF4A4F59);
			Gfx.roundRect(g, bodyX + bodyW / 2 - 22, dy + 1, 44, 2, 1, 0xFF1D1F24, Gfx.BOTTOM);
		}
		// body
		Gfx.roundRect(g, bodyX, bodyY, bodyW, bodyH, 6, 0xFF17181C);
		Gfx.gradientV(g, bodyX + 3, bodyY + 1, bodyW - 6, Math.min(14, bodyH / 3), 0x14FFFFFF, 0x00FFFFFF);
		Gfx.roundBorder(g, bodyX, bodyY, bodyW, bodyH, 6, 0xFF34373F);
		// display frame
		Gfx.border(g, dispX - 1, dispY - 1, dispW + 2, dispH + 2, 0xFF050506);
		// webcam
		int camX = bodyX + bodyW / 2;
		int camY = bodyY + (dispY - bodyY) / 2 - 1;
		Gfx.rect(g, camX - 1, camY - 1, 3, 3, 0xFF26292F);
		Gfx.rect(g, camX, camY, 1, 1, 0xFF4E6A8A);
		boolean on = os.phase() != CubeOS.Phase.SHUTDOWN;
		if (on) {
			Gfx.rect(g, camX + 4, camY, 1, 1, 0xFF3BE07A);
		}
		// brand label on the bottom bezel
		int labelY = dispY + dispH + (bodyY + bodyH - dispY - dispH - 8) / 2;
		Gfx.textCentered(g, "CubeBook", bodyX + bodyW / 2, labelY, 0xFF6E737D);
	}

	// ------------------------------------------------------------------ input

	@Override
	public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
		os.mouseClicked(event.x() - dispX, event.y() - dispY, event.button(), doubleClick);
		return true;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent event) {
		os.mouseReleased(event.x() - dispX, event.y() - dispY, event.button());
		return true;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent event, double dragX, double dragY) {
		os.mouseDragged(event.x() - dispX, event.y() - dispY, event.button(), dragX, dragY);
		return true;
	}

	@Override
	public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
		double amount = scrollY != 0 ? scrollY : -scrollX;
		if (amount != 0) {
			os.mouseScrolled(mouseX - dispX, mouseY - dispY, amount);
		}
		return true;
	}

	@Override
	public boolean keyPressed(KeyEvent event) {
		if (os.keyPressed(event.key(), event.scancode(), event.modifiers())) {
			return true;
		}
		if (event.isEscape()) {
			closeLaptop();
		}
		return true;
	}

	@Override
	public boolean charTyped(CharacterEvent event) {
		os.charTyped(event.codepoint(), event.modifiers());
		return true;
	}

	// ------------------------------------------------------------------ lifecycle

	@Override
	public void tick() {
		os.tick();
		if (!session.offline() && minecraft.player != null && minecraft.level != null) {
			Vec3 center = session.pos().getCenter();
			boolean gone = minecraft.level.getBlockState(session.pos()).isAir();
			if (gone || minecraft.player.distanceToSqr(center) > MAX_DISTANCE_SQ || !minecraft.player.isAlive()) {
				closeLaptop();
			}
		}
	}

	/** Closes the screen (sleep); the session stays cached. */
	public void closeLaptop() {
		if (closing) {
			return;
		}
		closing = true;
		minecraft.setScreen(parent);
	}

	@Override
	public void onClose() {
		closeLaptop();
	}

	@Override
	public void removed() {
		os.detach(this);
	}
}
