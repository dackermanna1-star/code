package com.laptopcraft.block;

import java.util.regex.Pattern;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import org.jspecify.annotations.Nullable;

/**
 * Validates and applies one {@code LaptopSave} edit to a laptop's OS data compound. The layout is
 * documented in {@link com.laptopcraft.network.ModPayloads}: top-level {@code settings}, {@code files}
 * and {@code apps} compounds. Edits address one part with a path:
 * <ul>
 *   <li>{@code "settings"} — replaces (or resets) the whole settings compound</li>
 *   <li>{@code "files/<name>"} — writes or deletes one file (name 1..48 chars, no '/', no control chars)</li>
 *   <li>{@code "apps/<appId>"} — writes or deletes one app's state (appId {@code [a-z0-9_]{1,32}})</li>
 * </ul>
 * All limits are estimated with {@link Tag#sizeInBytes()} (the same accounting NBT quotas use).
 */
public final class OsDataEdit {
	public static final String SETTINGS = "settings";
	public static final String FILES = "files";
	public static final String APPS = "apps";

	public static final int MAX_FILES = 200;
	public static final int MAX_FILE_NAME = 48;
	/** Max estimated size of a single saved part (one file, the settings, one app's state). */
	public static final int MAX_PART_BYTES = 48 * 1024;
	/** Max estimated size of the whole OS data compound. */
	public static final int MAX_TOTAL_BYTES = 1024 * 1024;

	private static final Pattern APP_ID = Pattern.compile("[a-z0-9_]{1,32}");

	private OsDataEdit() {
	}

	/** Result of an edit: {@code error == null} means it was applied; {@code newTotalSize} is the new size estimate. */
	public record Result(@Nullable String error, int newTotalSize) {
		static Result fail(String error) {
			return new Result(error, -1);
		}

		public boolean ok() {
			return error == null;
		}
	}

	/**
	 * Applies the edit to {@code osData} in place if it is valid.
	 *
	 * @param osData      the laptop's data (mutated on success only)
	 * @param currentSize the current {@code osData.sizeInBytes()} (passed in so callers can cache it)
	 * @param data        the new content (ignored when deleting)
	 */
	public static Result apply(CompoundTag osData, int currentSize, String path, CompoundTag data, boolean delete) {
		if (path.equals(SETTINGS)) {
			return replace(osData, currentSize, osData, SETTINGS, data, delete);
		}
		int slash = path.indexOf('/');
		if (slash <= 0) {
			return Result.fail("Invalid save path \"" + clip(path) + "\".");
		}
		String section = path.substring(0, slash);
		String key = path.substring(slash + 1);
		return switch (section) {
			case FILES -> {
				String nameError = validateFileName(key);
				if (nameError != null) {
					yield Result.fail(nameError);
				}
				CompoundTag files = osData.getCompoundOrEmpty(FILES);
				if (!delete && !files.contains(key) && files.size() >= MAX_FILES) {
					yield Result.fail("Disk full: a CubeBook can hold at most " + MAX_FILES + " files. Delete some files first.");
				}
				yield replaceChild(osData, currentSize, FILES, key, data, delete);
			}
			case APPS -> {
				if (!APP_ID.matcher(key).matches()) {
					yield Result.fail("Invalid app id \"" + clip(key) + "\".");
				}
				yield replaceChild(osData, currentSize, APPS, key, data, delete);
			}
			default -> Result.fail("Invalid save path \"" + clip(path) + "\".");
		};
	}

	/** Returns an error message for an invalid file name, or {@code null} if the name is fine. */
	public static @Nullable String validateFileName(String name) {
		if (name.isEmpty() || name.isBlank()) {
			return "File names can't be empty.";
		}
		if (name.length() > MAX_FILE_NAME) {
			return "File names can be at most " + MAX_FILE_NAME + " characters long.";
		}
		for (int i = 0; i < name.length(); i++) {
			char c = name.charAt(i);
			if (c == '/' || Character.isISOControl(c)) {
				return "File names can't contain '/' or control characters.";
			}
		}
		return null;
	}

	/** Writes/deletes {@code osData[section][key]}, creating the section compound when needed. */
	private static Result replaceChild(CompoundTag osData, int currentSize, String section, String key, CompoundTag data, boolean delete) {
		CompoundTag parent = osData.getCompound(section).orElse(null);
		if (parent == null) {
			if (delete) {
				return new Result(null, currentSize);
			}
			parent = new CompoundTag();
			osData.put(section, parent);
			// An empty compound costs a few bytes; recompute exactly instead of guessing.
			currentSize = osData.sizeInBytes();
		}
		Result result = replace(osData, currentSize, parent, key, data, delete);
		if (result.ok() && parent.isEmpty()) {
			osData.remove(section);
			return new Result(null, osData.sizeInBytes());
		}
		return result;
	}

	private static Result replace(CompoundTag root, int currentSize, CompoundTag parent, String key, CompoundTag data, boolean delete) {
		Tag old = parent.get(key);
		int oldSize = old == null ? 0 : old.sizeInBytes() + keyCost(key);
		if (delete) {
			if (old != null) {
				parent.remove(key);
			}
			return new Result(null, Math.max(0, currentSize - oldSize));
		}
		int newSize = data.sizeInBytes() + keyCost(key);
		if (newSize > MAX_PART_BYTES) {
			return Result.fail("That's too big to save (" + newSize / 1024 + " KB, max " + MAX_PART_BYTES / 1024 + " KB).");
		}
		int total = currentSize - oldSize + newSize;
		if (total > MAX_TOTAL_BYTES) {
			return Result.fail("Disk full: this CubeBook's storage (" + MAX_TOTAL_BYTES / 1024 + " KB) is used up. Delete some files first.");
		}
		parent.put(key, data.copy());
		return new Result(null, total);
	}

	/** Matches CompoundTag#sizeInBytes per-entry accounting (key string + map entry overhead). */
	private static int keyCost(String key) {
		return 28 + 2 * key.length() + 36;
	}

	private static String clip(String s) {
		return s.length() <= 40 ? s : s.substring(0, 40) + "...";
	}
}
