package com.laptopcraft.client.os;

import com.laptopcraft.account.AccountSnapshot;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.util.Util;
import org.jspecify.annotations.Nullable;

/**
 * Client-side state of one laptop for the current game session: position, os data, owner name,
 * offline flag and the running {@link CubeOS} (open windows). Sessions are cached by position, so
 * closing and reopening the same laptop restores the desktop (sleep) until it is shut down or the
 * player disconnects.
 */
public final class ClientLaptopSession {
	/** Fake position of the offline dev laptop. */
	public static final BlockPos OFFLINE_POS = new BlockPos(0, -1000, 0);

	private static final Map<BlockPos, ClientLaptopSession> CACHE = new HashMap<>();
	private static @Nullable ClientLaptopSession offlineSession;

	private final BlockPos pos;
	private final boolean offline;
	private String ownerName;
	private final OSDataImpl data;
	private final AccountViewImpl account;
	private @Nullable CubeOS os;
	private boolean fresh = true;
	private long offlineStart = Util.getMillis();

	/** Offline dev laptop clock: game time starts here... */
	static final long OFFLINE_GAME_TIME = 60000L;
	/** ...and day time at day 3, 10:30. */
	static final long OFFLINE_DAY_TIME = 2 * 24000L + 4500L;

	private ClientLaptopSession(BlockPos pos, boolean offline, CompoundTag osData, String ownerName, AccountViewImpl account) {
		this.pos = pos.immutable();
		this.offline = offline;
		this.ownerName = ownerName;
		this.data = new OSDataImpl(osData, this.pos, offline);
		this.account = account;
	}

	/** Session for a real laptop (OpenLaptop packet). Reuses the cached session for that position. */
	public static ClientLaptopSession openOnline(BlockPos pos, CompoundTag osData, AccountSnapshot snapshot, String ownerName) {
		AccountViewImpl acc = AccountViewImpl.online();
		acc.update(snapshot);
		acc.setLaptopPos(pos);
		ClientLaptopSession s = CACHE.get(pos);
		if (s != null) {
			s.ownerName = ownerName;
			s.data.replaceRoot(osData);
			s.fresh = false;
			return s;
		}
		s = new ClientLaptopSession(pos, false, osData, ownerName, acc);
		CACHE.put(s.pos, s);
		return s;
	}

	/** The offline dev laptop (in-memory data, fake account). */
	public static ClientLaptopSession openOffline() {
		if (offlineSession != null) {
			offlineSession.fresh = false;
			return offlineSession;
		}
		String name = Minecraft.getInstance().getUser().getName();
		long start = Util.getMillis();
		AccountViewImpl acc = AccountViewImpl.createOffline(() -> OFFLINE_GAME_TIME + (Util.getMillis() - start) / 50L);
		ClientLaptopSession s = new ClientLaptopSession(OFFLINE_POS, true, new CompoundTag(),
				name == null || name.isBlank() ? "Steve" : name, acc);
		s.offlineStart = start;
		OfflineFiles.seed(s.data);
		offlineSession = s;
		return s;
	}

	/** Removes a session (after shutdown) so the next open boots fresh. */
	public static void forget(ClientLaptopSession s) {
		CACHE.remove(s.pos);
		if (s == offlineSession) {
			offlineSession = null;
		}
	}

	/** Disconnect: drop everything. */
	public static void clearAll() {
		for (ClientLaptopSession s : CACHE.values()) {
			s.data.flush();
		}
		CACHE.clear();
		AccountViewImpl.online().reset();
	}

	public static @Nullable ClientLaptopSession cached(BlockPos pos) {
		return CACHE.get(pos);
	}

	public BlockPos pos() {
		return pos;
	}

	public boolean offline() {
		return offline;
	}

	public String ownerName() {
		return ownerName;
	}

	public OSDataImpl data() {
		return data;
	}

	public AccountViewImpl account() {
		return account;
	}

	/** True until the session has been shown once (first open → boot sequence). */
	public boolean isFresh() {
		return fresh;
	}

	/** The running OS (created on first use). */
	public CubeOS os() {
		if (os == null) {
			os = new CubeOS(this);
		}
		return os;
	}

	/** Ticks elapsed since the offline session was created (simulated clock). */
	long offlineTicks() {
		return (Util.getMillis() - offlineStart) / 50L;
	}

	public boolean hasOs() {
		return os != null;
	}
}
