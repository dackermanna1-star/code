package dev.calibercraft.core;

import java.util.List;

/**
 * Phase-based reload/cycle state machine shared by server (authoritative ammunition changes) and client
 * (animation + sound cues). Time advances in ticks; the client feeds fractional ticks for smooth animation.
 *
 * <p>Ammunition only changes at explicit points ({@link Listener#commit}, {@link Listener#chamber},
 * {@link Listener#loadRound}); cancelling before those points leaves the weapon exactly as it was, which is
 * what makes interrupted reloads safe.
 */
public final class ReloadRunner {
	public enum Kind { TACTICAL, EMPTY, SINGLE, CYCLE }

	public enum Phase { MAIN, START, LOOP, END, DONE }

	public interface Listener {
		/** A named cue was reached (sound / animation key). */
		default void cue(String name) {
		}

		/** Magazine/cylinder rounds are transferred. */
		default void commit() {
		}

		/** A round is chambered. */
		default void chamber() {
		}

		/** Single loading: load one round. Returns false if nothing could be loaded. */
		default boolean loadRound() {
			return false;
		}

		/** Single loading: whether another round should be loaded. */
		default boolean wantsMoreRounds() {
			return false;
		}

		/** Single loading: whether the chamber is empty and the end stroke must chamber a round. */
		default boolean needsChamber() {
			return false;
		}
	}

	private final Kind kind;
	private final ReloadSpec.Single single;
	private final double speed;
	private Timeline timeline;
	private Phase phase;
	private float t;
	private float lastT;
	private float totalElapsed;
	private int roundsLoaded;
	private boolean committed;
	private boolean chambered;
	private boolean stopRequested;
	private boolean roundCommittedThisLoop;

	private ReloadRunner(Kind kind, Timeline timeline, ReloadSpec.Single single, double speed) {
		this.kind = kind;
		this.single = single;
		this.speed = speed <= 0 ? 1 : speed;
		if (single != null) {
			this.timeline = single.start().scaled(this.speed);
			this.phase = Phase.START;
		} else {
			this.timeline = timeline.scaled(this.speed);
			this.phase = Phase.MAIN;
		}
		this.lastT = -1e-4f;
	}

	public static ReloadRunner timeline(Kind kind, Timeline timeline, double speed) {
		return new ReloadRunner(kind, timeline, null, speed);
	}

	public static ReloadRunner single(ReloadSpec.Single spec, double speed) {
		return new ReloadRunner(Kind.SINGLE, null, spec, speed);
	}

	public Kind kind() {
		return kind;
	}

	public Phase phase() {
		return phase;
	}

	/** Elapsed ticks within the current phase. */
	public float phaseTime() {
		return t;
	}

	public float phaseLength() {
		return phase == Phase.LOOP ? (float) (single.perRound() / speed) : timeline.length();
	}

	/** Timeline of the current non-loop phase (scaled). */
	public Timeline currentTimeline() {
		return timeline;
	}

	public float totalElapsed() {
		return totalElapsed;
	}

	public int roundsLoaded() {
		return roundsLoaded;
	}

	public boolean committed() {
		return committed;
	}

	public boolean chambered() {
		return chambered;
	}

	public boolean done() {
		return phase == Phase.DONE;
	}

	public void cancel() {
		phase = Phase.DONE;
	}

	/** Single loading: finish after the current round (the end stroke still runs). */
	public void requestStop() {
		stopRequested = true;
	}

	public boolean stopRequested() {
		return stopRequested;
	}

	/**
	 * Whether pulling the trigger may abort the remainder of this action without breaking ammunition rules.
	 * The caller still checks that the weapon actually has a round ready.
	 */
	public boolean interruptibleByFire() {
		return switch (kind) {
			case TACTICAL -> committed || timeline.commit() < 0;
			case EMPTY -> chambered;
			case SINGLE -> phase == Phase.LOOP || phase == Phase.END || phase == Phase.START;
			case CYCLE -> false;
		};
	}

	/** Advances by {@code dt} ticks, firing events in order. Returns true when finished. */
	public boolean advance(float dt, Listener l) {
		int guard = 0;
		while (dt > 1e-6f && phase != Phase.DONE && guard++ < 64) {
			float len = phaseLength();
			float step = Math.min(dt, len - t);
			float t1 = t + step;
			fire(lastT, t1, l);
			lastT = t1;
			t = t1;
			totalElapsed += step;
			dt -= step;
			if (t >= len - 1e-4f) {
				nextPhase(l);
			}
		}
		return phase == Phase.DONE;
	}

	private void fire(float from, float to, Listener l) {
		if (phase == Phase.LOOP) {
			float c = (float) (single.roundCommit() / speed);
			if (!roundCommittedThisLoop && c > from && c <= to) {
				roundCommittedThisLoop = true;
				l.cue(single.roundCue());
				if (l.loadRound()) {
					roundsLoaded++;
				} else {
					stopRequested = true;
				}
			}
			return;
		}
		List<Cue> cues = timeline.cues();
		for (Cue c : cues) {
			if (c.tick() > from && c.tick() <= to) {
				l.cue(c.name());
			}
		}
		if (!committed && timeline.commit() >= 0 && timeline.commit() > from && timeline.commit() <= to) {
			committed = true;
			l.commit();
		}
		if (!chambered && timeline.chamber() >= 0 && timeline.chamber() > from && timeline.chamber() <= to) {
			chambered = true;
			l.chamber();
		}
	}

	private void nextPhase(Listener l) {
		t = 0;
		lastT = -1e-4f;
		switch (phase) {
			case MAIN, END -> phase = Phase.DONE;
			case START -> {
				if (l.wantsMoreRounds() && !stopRequested) {
					phase = Phase.LOOP;
					roundCommittedThisLoop = false;
				} else {
					enterEnd(l);
				}
			}
			case LOOP -> {
				if (!stopRequested && l.wantsMoreRounds()) {
					roundCommittedThisLoop = false;
				} else {
					enterEnd(l);
				}
			}
			default -> {
			}
		}
	}

	private void enterEnd(Listener l) {
		phase = Phase.END;
		committed = false;
		timeline = (l.needsChamber() ? single.endEmpty() : single.end()).scaled(speed);
	}
}
