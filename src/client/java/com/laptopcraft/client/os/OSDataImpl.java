package com.laptopcraft.client.os;

import com.laptopcraft.LaptopCraft;
import com.laptopcraft.network.ModPayloads;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.util.Util;
import org.jspecify.annotations.Nullable;

/**
 * {@link OSData} over the laptop's os-data compound (see {@code ModPayloads} for the layout). Changes
 * are collected as dirty paths ("settings", "files/&lt;name&gt;", "apps/&lt;id&gt;") and sent with
 * {@link ModPayloads.LaptopSave} at most every {@value #FLUSH_INTERVAL_MS} ms and on screen close.
 * The offline dev laptop never sends anything.
 */
public final class OSDataImpl implements OSData {
	static final long FLUSH_INTERVAL_MS = 500;
	/** Stay below the 32767 byte C2S payload limit. */
	private static final int MAX_SYNC_BYTES = 30000;

	private CompoundTag root;
	private final BlockPos pos;
	private final boolean offline;
	private final Set<String> dirty = new LinkedHashSet<>();
	private final Set<String> deleted = new LinkedHashSet<>();
	private long lastFlush;
	private int settingsVersion;
	private int filesVersion;
	private @Nullable Runnable onTooLarge;

	public OSDataImpl(CompoundTag root, BlockPos pos, boolean offline) {
		this.root = root;
		this.pos = pos;
		this.offline = offline;
	}

	/** Replaces the whole tree with fresh server data (laptop reopened). Unsent changes are flushed first. */
	public void replaceRoot(CompoundTag newRoot) {
		flush();
		this.root = newRoot;
		settingsVersion++;
		filesVersion++;
	}

	/** The raw tree (read-only use). */
	public CompoundTag root() {
		return root;
	}

	/** Increments on every settings write — the OS polls it to refresh theme/wallpaper. */
	public int settingsVersion() {
		return settingsVersion;
	}

	/** Increments on every file change — e.g. the desktop polls it. */
	public int filesVersion() {
		return filesVersion;
	}

	/** Called when an entry could not be synced because it is too large. */
	public void setOnTooLarge(@Nullable Runnable r) {
		this.onTooLarge = r;
	}

	private CompoundTag section(String key) {
		Tag t = root.get(key);
		if (t instanceof CompoundTag c) {
			return c;
		}
		CompoundTag c = new CompoundTag();
		root.put(key, c);
		return c;
	}

	private CompoundTag settings() {
		return section("settings");
	}

	private CompoundTag files() {
		return section("files");
	}

	private CompoundTag apps() {
		return section("apps");
	}

	private void markSettings() {
		settingsVersion++;
		mark("settings");
	}

	private void mark(String path) {
		deleted.remove(path);
		dirty.add(path);
	}

	private void markDeleted(String path) {
		dirty.remove(path);
		deleted.add(path);
	}

	// ------------------------------------------------------------------ settings

	@Override
	public String getString(String key, String def) {
		return settings().getStringOr(key, def);
	}

	@Override
	public void setString(String key, String value) {
		String v = value == null ? "" : value;
		if (v.length() > 1024) {
			v = v.substring(0, 1024);
		}
		if (v.equals(settings().getString(key).orElse(null))) {
			return;
		}
		settings().putString(key, v);
		markSettings();
	}

	@Override
	public int getInt(String key, int def) {
		return settings().getIntOr(key, def);
	}

	@Override
	public void setInt(String key, int value) {
		if (settings().getInt(key).map(v -> v == value).orElse(false)) {
			return;
		}
		settings().putInt(key, value);
		markSettings();
	}

	@Override
	public boolean getBool(String key, boolean def) {
		return settings().getBooleanOr(key, def);
	}

	@Override
	public void setBool(String key, boolean value) {
		if (settings().getBoolean(key).map(v -> v == value).orElse(false)) {
			return;
		}
		settings().putBoolean(key, value);
		markSettings();
	}

	@Override
	public long getLong(String key, long def) {
		return settings().getLongOr(key, def);
	}

	@Override
	public void setLong(String key, long value) {
		if (settings().getLong(key).map(v -> v == value).orElse(false)) {
			return;
		}
		settings().putLong(key, value);
		markSettings();
	}

	// ------------------------------------------------------------------ files

	private @Nullable CompoundTag fileTag(String name) {
		return files().get(name) instanceof CompoundTag c ? c : null;
	}

	@Override
	public List<FileEntry> listFiles() {
		List<FileEntry> out = new ArrayList<>();
		CompoundTag files = files();
		for (String name : files.keySet()) {
			if (!(files.get(name) instanceof CompoundTag f)) {
				continue;
			}
			String type = f.getStringOr("type", "text");
			int size;
			if ("text".equals(type)) {
				size = f.getStringOr("content", "").length();
			} else {
				size = f.getCompound("data").map(CompoundTag::sizeInBytes).orElse(0);
			}
			out.add(new FileEntry(name, type, f.getLongOr("modified", 0L), size));
		}
		out.sort(Comparator.comparing(e -> e.name().toLowerCase(Locale.ROOT)));
		return out;
	}

	@Override
	public boolean exists(String name) {
		return name != null && fileTag(name) != null;
	}

	@Override
	public Optional<String> fileType(String name) {
		CompoundTag f = fileTag(name);
		return f == null ? Optional.empty() : Optional.of(f.getStringOr("type", "text"));
	}

	@Override
	public Optional<String> readText(String name) {
		CompoundTag f = fileTag(name);
		if (f == null || !"text".equals(f.getStringOr("type", "text"))) {
			return Optional.empty();
		}
		return Optional.of(f.getStringOr("content", ""));
	}

	@Override
	public void writeText(String name, String content) {
		if (!OSData.isValidName(name)) {
			LaptopCraft.LOGGER.warn("CubeOS: refusing to write invalid file name '{}'", name);
			return;
		}
		String c = content == null ? "" : content;
		if (c.length() > MAX_TEXT_LENGTH) {
			c = c.substring(0, MAX_TEXT_LENGTH);
		}
		CompoundTag f = new CompoundTag();
		f.putString("type", "text");
		f.putString("content", c);
		f.putLong("modified", System.currentTimeMillis());
		files().put(name, f);
		filesVersion++;
		mark("files/" + name);
	}

	@Override
	public Optional<CompoundTag> readFile(String name) {
		CompoundTag f = fileTag(name);
		if (f == null) {
			return Optional.empty();
		}
		if ("text".equals(f.getStringOr("type", "text"))) {
			CompoundTag c = new CompoundTag();
			c.putString("content", f.getStringOr("content", ""));
			return Optional.of(c);
		}
		return Optional.of(f.getCompound("data").map(CompoundTag::copy).orElseGet(CompoundTag::new));
	}

	@Override
	public void writeFile(String name, String type, CompoundTag content) {
		if (!OSData.isValidName(name)) {
			LaptopCraft.LOGGER.warn("CubeOS: refusing to write invalid file name '{}'", name);
			return;
		}
		if ("text".equals(type)) {
			writeText(name, content.getStringOr("content", ""));
			return;
		}
		CompoundTag f = new CompoundTag();
		f.putString("type", type == null || type.isEmpty() ? "data" : type);
		f.put("data", content.copy());
		f.putLong("modified", System.currentTimeMillis());
		files().put(name, f);
		filesVersion++;
		mark("files/" + name);
	}

	@Override
	public void delete(String name) {
		if (files().remove(name) != null) {
			filesVersion++;
			markDeleted("files/" + name);
		}
	}

	@Override
	public void rename(String from, String to) {
		if (from == null || from.equals(to) || !OSData.isValidName(to) || exists(to)) {
			return;
		}
		CompoundTag f = fileTag(from);
		if (f == null) {
			return;
		}
		files().remove(from);
		CompoundTag moved = f.copy();
		moved.putLong("modified", System.currentTimeMillis());
		files().put(to, moved);
		filesVersion++;
		markDeleted("files/" + from);
		mark("files/" + to);
	}

	// ------------------------------------------------------------------ app state

	@Override
	public CompoundTag appState(String appId) {
		CompoundTag apps = apps();
		if (apps.get(appId) instanceof CompoundTag c) {
			return c;
		}
		CompoundTag c = new CompoundTag();
		apps.put(appId, c);
		return c;
	}

	@Override
	public void saveAppState(String appId) {
		mark("apps/" + appId);
	}

	// ------------------------------------------------------------------ sync

	public boolean hasPendingChanges() {
		return !dirty.isEmpty() || !deleted.isEmpty();
	}

	/** Called every client tick; flushes when changes are pending and the interval has passed. */
	public void tick() {
		if (hasPendingChanges() && Util.getMillis() - lastFlush >= FLUSH_INTERVAL_MS) {
			flush();
		}
	}

	/** Sends all pending changes now (no-op offline). */
	public void flush() {
		lastFlush = Util.getMillis();
		if (!hasPendingChanges()) {
			return;
		}
		if (offline || !canSend()) {
			dirty.clear();
			deleted.clear();
			return;
		}
		for (String path : deleted) {
			ClientPlayNetworking.send(new ModPayloads.LaptopSave(pos, path, new CompoundTag(), true));
		}
		deleted.clear();
		for (String path : dirty) {
			CompoundTag data = resolve(path);
			if (data == null) {
				ClientPlayNetworking.send(new ModPayloads.LaptopSave(pos, path, new CompoundTag(), true));
				continue;
			}
			if (data.sizeInBytes() > MAX_SYNC_BYTES) {
				LaptopCraft.LOGGER.warn("CubeOS: '{}' is too large to sync ({} bytes)", path, data.sizeInBytes());
				if (onTooLarge != null) {
					onTooLarge.run();
				}
				continue;
			}
			ClientPlayNetworking.send(new ModPayloads.LaptopSave(pos, path, data.copy(), false));
		}
		dirty.clear();
	}

	private static boolean canSend() {
		try {
			return ClientPlayNetworking.canSend(ModPayloads.LaptopSave.TYPE);
		} catch (IllegalStateException e) {
			return false;
		}
	}

	private @Nullable CompoundTag resolve(String path) {
		if (path.equals("settings")) {
			return settings();
		}
		if (path.startsWith("files/")) {
			return fileTag(path.substring(6));
		}
		if (path.startsWith("apps/")) {
			return apps().get(path.substring(5)) instanceof CompoundTag c ? c : null;
		}
		return null;
	}
}
