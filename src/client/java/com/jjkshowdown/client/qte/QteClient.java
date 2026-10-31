package com.jjkshowdown.client.qte;

import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.qte.QteManager;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import org.jetbrains.annotations.Nullable;

/** Client half of quick-time events: prompt state, input capture and result feedback. */
public final class QteClient {
	private QteClient() {
	}

	public static final class Active {
		public final int id;
		public final QteManager.Kind kind;
		public final QteManager.Key key;
		public final int duration;
		public final int presses;
		public final int sweetStart;
		public final int sweetEnd;
		public final String label;
		public final long start;
		public int count;
		public boolean sent;

		Active(Payloads.QteStart p, long start) {
			this.id = p.qteId();
			this.kind = QteManager.Kind.values()[Math.max(0, Math.min(2, p.kind()))];
			this.key = QteManager.Key.values()[Math.max(0, Math.min(QteManager.Key.values().length - 1, p.key()))];
			this.duration = p.duration();
			this.presses = p.presses();
			this.sweetStart = p.sweetStart();
			this.sweetEnd = p.sweetEnd();
			this.label = p.label();
			this.start = start;
		}

		public int elapsed() {
			return (int) (now() - start);
		}
	}

	public record Result(int outcome, long tick) {
	}

	@Nullable
	public static Active active;
	@Nullable
	public static Result lastResult;

	static long now() {
		Minecraft mc = Minecraft.getInstance();
		return mc.level == null ? 0 : mc.level.getGameTime();
	}

	public static void start(Payloads.QteStart p) {
		active = new Active(p, now());
		lastResult = null;
	}

	public static void end(Payloads.QteEnd p) {
		if (active != null && active.id == p.qteId()) active = null;
		if (p.outcome() != 3) lastResult = new Result(p.outcome(), now());
	}

	/** The QTE key was pressed. */
	public static void press(QteManager.Key key) {
		Active a = active;
		if (a == null || a.key != key || a.sent) return;
		a.count++;
		switch (a.kind) {
			case PRESS, TIMING -> send(a);
			case MASH -> {
				if (a.count >= a.presses) send(a);
			}
		}
	}

	public static void tick() {
		Active a = active;
		if (a == null) return;
		// mash: report the final tally right before the window closes so partial successes count
		if (a.kind == QteManager.Kind.MASH && !a.sent && a.elapsed() >= a.duration - 2) send(a);
		if (a.elapsed() > a.duration + 20) active = null;
	}

	private static void send(Active a) {
		a.sent = true;
		ClientPlayNetworking.send(new Payloads.QteResponse(a.id, a.count, a.elapsed()));
	}

	public static void reset() {
		active = null;
		lastResult = null;
	}
}
