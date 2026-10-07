/**
 * <h1>CubeOS — developer guide</h1>
 *
 * CubeOS is the operating system of the LaptopCraft laptop. It runs entirely on the client inside a
 * {@link com.laptopcraft.client.os.LaptopScreen}. You build on it by writing {@link com.laptopcraft.client.os.App apps}
 * (windows on the desktop) and {@link com.laptopcraft.client.web.Site web sites} (pages in the browser).
 *
 * <h2>The essentials</h2>
 * <ul>
 *   <li><b>Coordinates</b>: apps and pages draw in local coordinates; the OS translates the pose and sets a
 *       scissor. Mouse coordinates are local too ({@code Integer.MIN_VALUE / 2} when not hovered).</li>
 *   <li><b>Theme</b>: never hard-code OS colors — use {@code ctx.theme()} (dark/light + user accent). Web pages may use
 *       their own brand colors (sites are usually light).</li>
 *   <li><b>Drawing</b>: {@link com.laptopcraft.client.os.ui.Gfx} (rects, rounded rects, shadows, text, icons, items,
 *       emerald prices, tooltips), {@link com.laptopcraft.client.os.ui.Glyphs} (crisp pixel glyphs).</li>
 *   <li><b>Widgets</b> ({@code com.laptopcraft.client.os.ui}): Button, IconButton, TextField, TextArea, Toggle, Slider,
 *       Dropdown, TabBar, ListView, ScrollState. Put them in a {@link com.laptopcraft.client.os.ui.WidgetGroup} and forward
 *       events — it handles focus, hover, tab-cycling and dropdown overlays.</li>
 *   <li><b>Storage</b>: {@code ctx.appState()} + {@code ctx.saveAppState()} for app data, {@code ctx.data()} for files and
 *       settings ({@link com.laptopcraft.client.os.OSSettings} has the keys). Everything syncs to the server automatically.</li>
 *   <li><b>Account</b>: {@code ctx.account()} — balance, orders, mail, purchases (see {@link com.laptopcraft.client.os.AccountView}).</li>
 *   <li><b>OS services</b>: {@code ctx.notify(icon, title, msg)}, {@code ctx.confirm/prompt/alert(...)} (modal dialogs),
 *       {@code ctx.showContextMenu(x, y, List<MenuItem>)}, {@code ctx.openApp(id, arg)}, {@code ctx.openUrl(url)},
 *       {@code ctx.openFile(name)}, {@code ctx.playClick()}, {@code ctx.dayTime()}, {@code ctx.clockText()}.</li>
 *   <li><b>Robustness</b>: exceptions in app/page code are caught (the window closes / the tab shows an error page), but
 *       please don't rely on it. Rendering runs every frame: avoid allocating big objects; {@code Gfx.wrap} is cached.</li>
 *   <li><b>Text</b>: the font is 9 px high. Use integer scales ({@code Gfx.textScaled(g, s, x, y, 2f, color)}) for headings.
 *       Glyphs available in the bitmap font: • … ◆ ▶ ★ ☆ ✔ × ← → ↑ ↓ ⌂ ♪ ♫ ☀ ☁ ☂ ☽ ✉ ⚡ ❄ ☰.</li>
 *   <li><b>Testing</b>: {@code scripts/screenshot.sh} with {@code dev:skipboot}, {@code dev:open <appId> [arg]},
 *       {@code dev:url <url>} (see {@link com.laptopcraft.client.os.DevHooks}) runs an offline dev laptop with a fake
 *       account (120 emeralds, sample orders and mail, simulated purchases/deliveries).</li>
 * </ul>
 *
 * <h2>Minimal app</h2>
 * <pre>{@code
 * public class HelloApp extends App {
 *     private final WidgetGroup ui = new WidgetGroup();
 *     private final TextField name = new TextField("Your name");
 *     private int clicks;
 *
 *     @Override
 *     public void init() {
 *         clicks = ctx.appState().getIntOr("clicks", 0);
 *         ui.add(name);
 *         ui.add(new Button("Say hi", () -> {
 *             clicks++;
 *             ctx.appState().putInt("clicks", clicks);
 *             ctx.saveAppState();
 *             ctx.notify("info", "Hello " + name.getText() + "!", "You clicked " + clicks + " times.");
 *         }).style(Button.Style.PRIMARY));
 *     }
 *
 *     @Override
 *     public void onResize(int w, int h) {
 *         name.setBounds(8, 8, w - 16, 16);
 *         ui.widgets().get(1).setBounds(8, 30, 70, 18);
 *     }
 *
 *     @Override
 *     public void render(GuiGraphics g, int w, int h, int mx, int my, float pt) {
 *         Theme t = ctx.theme();
 *         Gfx.rect(g, 0, 0, w, h, t.bg());
 *         ui.render(g, mx, my, pt);
 *         Gfx.text(g, "Clicks: " + clicks, 8, 56, t.textDim());
 *     }
 *
 *     @Override public boolean mouseClicked(double x, double y, int b) { return ui.mouseClicked(x, y, b); }
 *     @Override public boolean mouseReleased(double x, double y, int b) { return ui.mouseReleased(x, y, b); }
 *     @Override public boolean mouseDragged(double x, double y, int b, double dx, double dy) { return ui.mouseDragged(x, y, b, dx, dy); }
 *     @Override public boolean keyPressed(int k, int s, int m) { return ui.keyPressed(k, s, m); }
 *     @Override public boolean charTyped(int c, int m) { return ui.charTyped(c, m); }
 * }
 * // registration (BuiltinApps):
 * AppRegistry.register(new AppInfo("hello", "Hello", Icons.app("hello"), HelloApp::new, 220, 140, 160, 100, false, AppCategory.PRODUCTIVITY));
 * }</pre>
 *
 * <h2>Minimal web page</h2>
 * <pre>{@code
 * public class ShopSite implements Site {
 *     public String host() { return "shop.mc"; }
 *     public String name() { return "Shop"; }
 *     public String description() { return "Buy things."; }
 *     public Identifier favicon() { return Icons.icon("cart"); }
 *     public int themeColor() { return 0xFF2E7D32; }
 *     public WebPage createPage(WebUrl url) {
 *         return switch (url.path()) {
 *             case "" -> new HomePage();
 *             case "item" -> new ItemPage(url.param("id", ""));
 *             default -> new HomePage();          // or your own "not found" page
 *         };
 *     }
 * }
 *
 * class HomePage extends WebPage {
 *     public String title() { return "Shop — Home"; }
 *     public int contentHeight(int width, int viewportHeight) { return 400; }   // enables scrolling
 *     public void render(GuiGraphics g, int width, int vh, int scrollY, int mx, int my, float pt) {
 *         Gfx.textScaled(g, "Welcome!", 12, 12, 2f, 0xFF1D2127);
 *         boolean hov = Gfx.link(g, "See the top hat", 12, 40, 0xFF1A5FD6, mx, my);
 *         if (hov) page.hoverLink("shop.mc/item?id=top_hat");
 *         // sticky header: draw at y = scrollY
 *     }
 *     public boolean mouseClicked(double x, double y, int button) {
 *         if (Gfx.hovered(x, y, 12, 39, Gfx.width("See the top hat"), 11)) { page.navigate("shop.mc/item?id=top_hat"); return true; }
 *         return false;
 *     }
 * }
 * // per-site persistent state: page.siteState().putInt("visits", ...); page.saveSiteState();
 * }</pre>
 */
package com.laptopcraft.client.os;
