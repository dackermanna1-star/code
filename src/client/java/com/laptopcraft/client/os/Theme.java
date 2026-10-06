package com.laptopcraft.client.os;

/**
 * CubeOS color palette (all colors are ARGB with alpha). Obtain it via {@code ctx.theme()} in apps or
 * {@link com.laptopcraft.client.os.ui.UI#theme()} in widgets. It changes live when the user switches
 * dark/light mode or the accent color, so read it every frame instead of caching colors.
 *
 * <p>Typical use: window content background {@link #bg()}, cards/panels {@link #surface()},
 * sidebars/alternating rows {@link #surfaceAlt()}, 1px separators {@link #border()},
 * primary text {@link #text()}, secondary text {@link #textDim()}, hover overlay {@link #hover()}
 * (translucent — draw it on top of anything), selected rows {@link #selection()} (translucent accent).
 */
public interface Theme {
	/** True for the dark theme. */
	boolean dark();

	/** User accent color (buttons, links, selection, focus rings). */
	int accent();

	/** Readable text color on top of {@link #accent()} (black or white). */
	int accentText();

	/** Window content background. */
	int bg();

	/** Cards, panels, dialogs, menus. */
	int surface();

	/** Secondary surface: sidebars, toolbars, alternating rows. */
	int surfaceAlt();

	/** 1px borders and separators. */
	int border();

	/** Primary text. */
	int text();

	/** Secondary / hint text. */
	int textDim();

	/** Text drawn on dark imagery regardless of theme (e.g. desktop icon labels): white. */
	int textOnDark();

	/** Title bar of the focused window. */
	int titleBar();

	/** Title bar of unfocused windows. */
	int titleBarInactive();

	/** Translucent hover overlay (draw on top of a surface). */
	int hover();

	/** Translucent selection highlight (accent based). */
	int selection();

	int danger();

	int success();

	int warning();

	/** Hyperlink color. */
	int link();

	// ---------------------------------------------------------------- additions (beyond the original contract)

	/** Background of text inputs. */
	int inputBg();

	/** Scrollbar thumb color (track is transparent). */
	int scrollbar();

	/** Translucent pressed overlay (stronger than {@link #hover()}). */
	int pressed();

	/** Background color for tooltips. */
	int tooltipBg();
}
