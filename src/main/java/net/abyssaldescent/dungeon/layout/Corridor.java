package net.abyssaldescent.dungeon.layout;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A passage between two rooms made of axis-aligned interior segments. */
public final class Corridor {
	public enum Trap {
		NONE,
		SPIKES,
		DARTS
	}

	private final int id;
	private final int roomA;
	private final int roomB;
	private final List<Box> segments;
	private final boolean secret;
	private final long seed;
	private Trap trap = Trap.NONE;
	private final List<Fixture> fixtures = new ArrayList<>();

	Corridor(int id, int roomA, int roomB, List<Box> segments, boolean secret, long seed) {
		this.id = id;
		this.roomA = roomA;
		this.roomB = roomB;
		this.segments = List.copyOf(segments);
		this.secret = secret;
		this.seed = seed;
	}

	public int id() {
		return id;
	}

	public int roomA() {
		return roomA;
	}

	public int roomB() {
		return roomB;
	}

	public List<Box> segments() {
		return segments;
	}

	public boolean secret() {
		return secret;
	}

	public long seed() {
		return seed;
	}

	public Trap trap() {
		return trap;
	}

	void setTrap(Trap trap) {
		this.trap = trap;
	}

	public List<Fixture> fixtures() {
		return Collections.unmodifiableList(fixtures);
	}

	void addFixture(Fixture fixture) {
		fixtures.add(fixture);
	}

	public Box bounds() {
		Box b = segments.get(0);
		for (int i = 1; i < segments.size(); i++) {
			b = b.encapsulate(segments.get(i));
		}
		return b;
	}

	public boolean containsInterior(int x, int y, int z) {
		for (Box s : segments) {
			if (s.contains(x, y, z)) {
				return true;
			}
		}
		return false;
	}
}
