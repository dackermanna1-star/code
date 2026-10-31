package com.jjkshowdown.client;

import com.google.gson.Gson;
import com.jjkshowdown.ability.AbilitySlot;
import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.CastPose;
import com.jjkshowdown.sorcerer.CharacterType;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayDeque;
import java.util.Deque;

/** Everything the client knows about sorcerers, synced from the server. Client thread only. */
public final class ClientState {
	private ClientState() {
	}

	// ---------------------------------------------------------------- own player
	@Nullable
	public static Payloads.SorcererSync self;
	public static long selfSyncTick;

	public static CharacterType character() {
		return self == null ? CharacterType.NONE : CharacterType.byOrdinal(self.character());
	}

	public static boolean has(int flag) {
		return self != null && (self.flags() & flag) != 0;
	}

	public static boolean isLocked() {
		return has(Payloads.SorcererSync.F_LOCKED);
	}

	public static boolean isOverloaded() {
		return has(Payloads.SorcererSync.F_OVERLOADED);
	}

	public static boolean unlocked(AbilitySlot slot) {
		return self != null && (self.unlockedMask() & (1 << slot.ordinal())) != 0;
	}

	// ---------------------------------------------------------------- server config copy
	private static final Gson GSON = new Gson();
	public static JjkConfig serverConfig = new JjkConfig();
	public static boolean canEditServerConfig;

	public static void acceptConfig(Payloads.ConfigSync p) {
		try {
			JjkConfig c = GSON.fromJson(p.commonJson(), JjkConfig.class);
			if (c != null) {
				c.validate();
				serverConfig = c;
			}
		} catch (Exception ignored) {
		}
		canEditServerConfig = p.canEdit();
	}

	// ---------------------------------------------------------------- visuals of all sorcerers
	public static final class Visual {
		public CharacterType character = CharacterType.NONE;
		public int flags;
		public CastPose pose = CastPose.NONE;
		public int poseTicksAtSync;
		public int poseDuration = 1;
		public long syncTick;
		public int chargeSlot = -1;

		public boolean has(int flag) {
			return (flags & flag) != 0;
		}

		/** Pose progress 0..1 including client-side interpolation since the last sync. */
		public float poseProgress(float partial) {
			long now = Minecraft.getInstance().level == null ? syncTick : Minecraft.getInstance().level.getGameTime();
			float t = poseTicksAtSync + (now - syncTick) + partial;
			return Math.min(1f, t / Math.max(1, poseDuration));
		}

		public float poseTicks(float partial) {
			long now = Minecraft.getInstance().level == null ? syncTick : Minecraft.getInstance().level.getGameTime();
			return poseTicksAtSync + (now - syncTick) + partial;
		}
	}

	private static final Int2ObjectOpenHashMap<Visual> VISUALS = new Int2ObjectOpenHashMap<>();

	public static void acceptVisual(Payloads.EntityVisual p) {
		Visual v = VISUALS.computeIfAbsent(p.entityId(), k -> new Visual());
		v.character = CharacterType.byOrdinal(p.character());
		v.flags = p.flags();
		v.pose = CastPose.byOrdinal(p.pose());
		v.poseTicksAtSync = p.poseTicks();
		v.poseDuration = p.poseDuration();
		v.chargeSlot = p.chargeSlot();
		v.syncTick = Minecraft.getInstance().level == null ? 0 : Minecraft.getInstance().level.getGameTime();
	}

	@Nullable
	public static Visual visual(int entityId) {
		return VISUALS.get(entityId);
	}

	@Nullable
	public static Visual visual(Entity e) {
		return VISUALS.get(e.getId());
	}

	public static CharacterType characterOf(Entity e) {
		Visual v = VISUALS.get(e.getId());
		return v == null ? CharacterType.NONE : v.character;
	}

	public static void forget(int entityId) {
		VISUALS.remove(entityId);
	}

	// ---------------------------------------------------------------- clash
	@Nullable
	public static Payloads.Clash clash;
	public static long clashTick;

	// ---------------------------------------------------------------- combo / black flash timing
	public static int combo;
	public static long comboTick;
	public static long bfOpenTick = -1_000_000L;
	public static long bfCloseTick = -1_000_000L;
	public static long lastBlackFlashTick = -1_000_000L;

	public static void acceptCombo(Payloads.ComboEvent e) {
		long now = Minecraft.getInstance().level == null ? 0 : Minecraft.getInstance().level.getGameTime();
		combo = e.combo();
		comboTick = now;
		bfOpenTick = now + e.bfOpenIn();
		bfCloseTick = bfOpenTick + e.bfLength() - 1;
		if (e.blackFlash()) lastBlackFlashTick = now;
	}

	// ---------------------------------------------------------------- notifications & subtitles
	public record Note(int kind, Component text, int color, long tick) {
	}

	public static final Deque<Note> NOTES = new ArrayDeque<>();
	@Nullable
	public static Note callout;

	public static void notify(Payloads.Notify n) {
		long now = Minecraft.getInstance().level == null ? 0 : Minecraft.getInstance().level.getGameTime();
		Note note = new Note(n.kind(), n.message(), n.color(), now);
		if (n.kind() == Payloads.Notify.CALLOUT) {
			callout = note;
		} else {
			NOTES.addLast(note);
			while (NOTES.size() > 5) NOTES.removeFirst();
		}
	}

	public record Subtitle(Component speaker, Component line, int color, long tick, int duration) {
	}

	@Nullable
	public static Subtitle subtitle;

	/** First-join character prompt waiting for the loading screen to close. */
	public static boolean pendingFirstSelection;

	public static void reset() {
		self = null;
		VISUALS.clear();
		clash = null;
		NOTES.clear();
		callout = null;
		subtitle = null;
		pendingFirstSelection = false;
		combo = 0;
		serverConfig = new JjkConfig();
		canEditServerConfig = false;
	}
}
