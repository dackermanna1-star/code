package com.laptopcraft.client.web;

import com.laptopcraft.client.os.AppContext;
import net.minecraft.nbt.CompoundTag;
import org.jspecify.annotations.Nullable;

/** Browser services for a {@link WebPage} (one per tab). */
public interface PageContext {
	/** OS services (account, data, notify, dialogs, sounds). */
	AppContext app();

	/** URL of this page. */
	WebUrl url();

	/** Navigates this tab (pushes history). Accepts anything {@link WebUrl#parse} accepts. */
	void navigate(String url);

	/** Replaces the current history entry (e.g. after a redirect or a filter change). */
	void replace(String url);

	void back();

	void forward();

	void reload();

	int scrollY();

	/** Scrolls the viewport (document y at the top). */
	void scrollTo(int y);

	int viewportWidth();

	int viewportHeight();

	/** Persistent per-site state, stored in the browser's app state under "sites/&lt;host&gt;". Call {@link #saveSiteState()} after mutating. */
	CompoundTag siteState();

	void saveSiteState();

	// ---------------------------------------------------------------- additions

	/** Opens a URL in a new tab (or the current one if the tab limit is reached). */
	void openInNewTab(String url);

	/** The site of this page (null for the 404 page). */
	@Nullable Site site();

	/** True during the fake loading animation right after navigation. */
	boolean isLoading();

	/** UI-clock millis when this page was shown (for entrance animations). */
	long shownAt();

	/**
	 * Call while rendering when the mouse is over a link: the browser shows the target URL in a status
	 * bubble (bottom-left) and uses the pointing-hand cursor. Cleared every frame.
	 */
	void hoverLink(String url);
}
