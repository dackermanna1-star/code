package com.laptopcraft.client.os;

import com.laptopcraft.client.os.apps.CalculatorApp;
import com.laptopcraft.client.os.apps.ClockApp;
import com.laptopcraft.client.os.apps.CreeperSweeperApp;
import com.laptopcraft.client.os.apps.FilesApp;
import com.laptopcraft.client.os.apps.Game2048App;
import com.laptopcraft.client.os.apps.MailApp;
import com.laptopcraft.client.os.apps.MusicApp;
import com.laptopcraft.client.os.apps.NotepadApp;
import com.laptopcraft.client.os.apps.PaintApp;
import com.laptopcraft.client.os.apps.SettingsApp;
import com.laptopcraft.client.os.apps.SnakeApp;
import com.laptopcraft.client.os.apps.TerminalApp;
import com.laptopcraft.client.web.BrowserApp;
import java.util.function.Supplier;

/**
 * Registers every built-in CubeOS app. Sizes are whole-window sizes (title bar included) and are
 * clamped to the desktop on small screens.
 */
public final class BuiltinApps {
	private BuiltinApps() {
	}

	private static void reg(String id, String name, Supplier<App> factory, int w, int h, int minW, int minH, boolean single, AppCategory cat) {
		AppRegistry.register(new AppInfo(id, name, Icons.app(id), factory, w, h, minW, minH, single, cat));
	}

	public static void register() {
		reg("settings", "Settings", SettingsApp::new, 380, 270, 260, 180, true, AppCategory.SYSTEM);
		reg("files", "Files", FilesApp::new, 360, 250, 220, 150, false, AppCategory.SYSTEM);
		reg("terminal", "Terminal", TerminalApp::new, 320, 210, 180, 110, false, AppCategory.SYSTEM);
		reg("clock", "Clock", ClockApp::new, 240, 220, 180, 160, true, AppCategory.SYSTEM);
		reg("notepad", "Notepad", NotepadApp::new, 320, 240, 160, 110, false, AppCategory.PRODUCTIVITY);
		reg("calculator", "Calculator", CalculatorApp::new, 168, 230, 140, 190, false, AppCategory.PRODUCTIVITY);
		reg("browser", "Browser", BrowserApp::new, 520, 340, 280, 190, true, AppCategory.INTERNET);
		reg("mail", "Mail", MailApp::new, 400, 270, 260, 170, true, AppCategory.INTERNET);
		reg("minesweeper", "Creeper Sweeper", CreeperSweeperApp::new, 220, 270, 180, 210, true, AppCategory.GAMES);
		reg("snake", "Snake", SnakeApp::new, 250, 270, 180, 200, true, AppCategory.GAMES);
		reg("game2048", "2048", Game2048App::new, 230, 280, 180, 230, true, AppCategory.GAMES);
		reg("paint", "Paint", PaintApp::new, 380, 290, 240, 190, false, AppCategory.MEDIA);
		reg("music", "Music", MusicApp::new, 320, 230, 220, 160, true, AppCategory.MEDIA);
	}
}
