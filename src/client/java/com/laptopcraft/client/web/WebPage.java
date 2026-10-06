package com.laptopcraft.client.web;

import net.minecraft.client.gui.GuiGraphics;

/**
 * One page shown in a browser tab. Created by {@link Site#createPage(WebUrl)} for every navigation
 * (back/forward re-create pages too, so keep persistent things in {@code page.siteState()}).
 *
 * <h2>Coordinates</h2>
 * Pages draw in DOCUMENT coordinates: the pose is translated by {@code -scrollY}, so y = 0 is the top of
 * the document. Mouse coordinates passed to the page are document coordinates as well
 * ({@code Integer.MIN_VALUE / 2} when the mouse is outside the viewport). To draw a sticky header, draw
 * it at {@code y = scrollY}. A scissor for the viewport is active. The browser fills the viewport with
 * {@link #background()} before calling {@link #render}.
 *
 * <p>Exceptions thrown by a page are caught by the browser, which shows an error page instead.
 */
public abstract class WebPage {
	/** Browser services for this tab. Injected before {@link #init()}. */
	protected PageContext page;

	public void init() {
	}

	/** Title shown in the tab and window title. */
	public abstract String title();

	/** Total document height for the browser's vertical scrolling (&lt;= viewport height = no scrolling). */
	public int contentHeight(int width, int viewportHeight) {
		return viewportHeight;
	}

	/**
	 * Pose is translated by -scrollY: draw in DOCUMENT coordinates. mouseX/mouseY are document coords
	 * (MIN_VALUE/2 when not hovered). To draw a sticky header, draw it at y = scrollY.
	 */
	public abstract void render(GuiGraphics g, int width, int viewportHeight, int scrollY, int mouseX, int mouseY, float partialTick);

	/** Document coords. */
	public boolean mouseClicked(double x, double y, int button) {
		return false;
	}

	public boolean mouseReleased(double x, double y, int button) {
		return false;
	}

	public boolean mouseDragged(double x, double y, int button, double dragX, double dragY) {
		return false;
	}

	/** Return true to consume (no page scroll). {@code amount} &gt; 0 = wheel up. */
	public boolean mouseScrolled(double x, double y, double amount) {
		return false;
	}

	public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
		return false;
	}

	public boolean charTyped(int codePoint, int modifiers) {
		return false;
	}

	/** 20 Hz while the page is the visible page of its tab. */
	public void tick() {
	}

	/** Became the visible page (navigate/back/forward). */
	public void onShow() {
	}

	public void onHide() {
	}

	// ---------------------------------------------------------------- additions

	/** Viewport background color drawn by the browser before {@link #render}. Default white. */
	public int background() {
		return 0xFFFFFFFF;
	}
}
