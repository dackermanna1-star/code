package com.extremesports.client;

import com.extremesports.network.Payloads;
import com.extremesports.trick.BailReason;
import com.extremesports.trick.ComboEntry;
import com.extremesports.trick.ComboScorer;
import com.extremesports.trick.LandingQuality;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/**
 * Client-side view of the sports session: the live combo (predicted locally), server-confirmed results,
 * landing feedback, challenge status and notifications. Read by the HUD and menus.
 */
public final class ClientSportsState {
	public static List<ComboEntry> combo = List.of();
	public static ComboScorer.Result comboPrediction = new ComboScorer.Result(0, 1, 0, 0);
	public static final ComboScorer.History predictionHistory = new ComboScorer.History();

	/** Most recently finished combo, shown for a few seconds. */
	public static List<ComboEntry> finishedCombo = List.of();
	public static boolean finishedLanded;
	public static int finishedScore = -1;
	public static int finishedMultiplier = 1;
	public static long finishedTime = -1000;

	public static LandingQuality landing = LandingQuality.CLEAN;
	public static long landingTime = -1000;
	public static @Nullable BailReason bail;
	public static long bailTime = -1000;
	public static @Nullable Component tip;
	public static long tipTime = -1000;
	public static @Nullable Component trickLabel;
	public static long trickTime = -1000;

	public static long sessionScore;
	public static int sessionBest;

	public static Payloads.ChallengeState challenge = new Payloads.ChallengeState("", 0, 0, 0, 0, 0, "");
	public static long challengeTime;

	public static final Deque<Component> toasts = new ArrayDeque<>();
	public static long toastTime = -1000;

	private ClientSportsState() {
	}

	public static void reset() {
		combo = List.of();
		comboPrediction = new ComboScorer.Result(0, 1, 0, 0);
		finishedCombo = List.of();
		finishedScore = -1;
		sessionScore = 0;
		sessionBest = 0;
		challenge = new Payloads.ChallengeState("", 0, 0, 0, 0, 0, "");
		toasts.clear();
		predictionHistory.clear();
	}
}
