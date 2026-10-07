package com.laptopcraft.client.os;

import java.util.List;
import java.util.Optional;
import net.minecraft.nbt.CompoundTag;

/**
 * Persistent laptop storage (lives in the laptop block entity on the server). Writes are applied
 * locally at once and synced to the server in the background (debounced), so it is fine to call
 * setters often. All methods must be called on the render thread.
 *
 * <ul>
 *   <li><b>Settings</b> — {@code get/setString/Int/Bool} with the keys in {@link OSSettings}
 *       (username, wallpaper, theme, accent, clock24h, sounds, password, homepage, showDesktopIcons).
 *       Apps may store their own small preferences here too, but prefer {@link #appState(String)}.</li>
 *   <li><b>Files</b> — a flat "drive" of named files. Names: 1–48 chars, no '/'. Text files hold up to
 *       20 000 chars. Other file types store a compound (e.g. images: 64×64 palette indices).</li>
 *   <li><b>App state</b> — one compound per app id; mutate it and call {@link #saveAppState(String)}.</li>
 * </ul>
 */
public interface OSData {
	/** Max length of a file name. */
	int MAX_NAME_LENGTH = 48;
	/** Max characters in a text file. */
	int MAX_TEXT_LENGTH = 20000;

	/** Directory entry. {@code size} = characters for text files, approximate bytes otherwise. */
	record FileEntry(String name, String type, long modified, int size) {
		/** File extension without the dot, lower case ("" if none). */
		public String extension() {
			int dot = name.lastIndexOf('.');
			return dot <= 0 ? "" : name.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
		}
	}

	String getString(String key, String def);

	void setString(String key, String value);

	int getInt(String key, int def);

	void setInt(String key, int value);

	boolean getBool(String key, boolean def);

	void setBool(String key, boolean value);

	/** All files sorted by name (case-insensitive). */
	List<FileEntry> listFiles();

	boolean exists(String name);

	/** Content of a text file (empty if missing or not text). */
	Optional<String> readText(String name);

	/** Creates/overwrites a text file (type "text"); content is truncated to {@link #MAX_TEXT_LENGTH}. Invalid names are ignored. */
	void writeText(String name, String content);

	/**
	 * Data compound of a non-text file (a copy — write it back with {@link #writeFile}). For text files
	 * the result is a compound with a single "content" string.
	 */
	Optional<CompoundTag> readFile(String name);

	/** Creates/overwrites a file of the given type (e.g. "image") with a copy of {@code content}. */
	void writeFile(String name, String type, CompoundTag content);

	void delete(String name);

	/** Renames a file. Does nothing if {@code from} is missing, {@code to} exists or is invalid. */
	void rename(String from, String to);

	/** Live persistent compound of an app (created on demand). Mutate it, then call {@link #saveAppState(String)}. */
	CompoundTag appState(String appId);

	void saveAppState(String appId);

	// ---------------------------------------------------------------- additions

	long getLong(String key, long def);

	void setLong(String key, long value);

	/** Type of a file ("text", "image", ...) or empty. */
	Optional<String> fileType(String name);

	/** True if {@code name} is a valid file name (1–48 chars, no '/', no control/formatting chars). */
	static boolean isValidName(String name) {
		if (name == null) {
			return false;
		}
		String n = name.trim();
		if (n.isEmpty() || n.length() > MAX_NAME_LENGTH || !n.equals(name)) {
			return false;
		}
		for (int i = 0; i < n.length(); i++) {
			char c = n.charAt(i);
			if (c == '/' || c == '\\' || c < 32 || c == 127 || c == '§') {
				return false;
			}
		}
		return true;
	}

	/** A free file name based on {@code base}: "notes.txt" → "notes (2).txt" if taken. */
	default String uniqueName(String base) {
		if (!exists(base)) {
			return base;
		}
		int dot = base.lastIndexOf('.');
		String stem = dot > 0 ? base.substring(0, dot) : base;
		String ext = dot > 0 ? base.substring(dot) : "";
		for (int i = 2; i < 1000; i++) {
			String candidate = stem + " (" + i + ")" + ext;
			if (candidate.length() <= MAX_NAME_LENGTH && !exists(candidate)) {
				return candidate;
			}
		}
		return base;
	}
}
