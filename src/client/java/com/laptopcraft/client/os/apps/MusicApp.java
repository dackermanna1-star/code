package com.laptopcraft.client.os.apps;

import com.laptopcraft.client.os.Icons;
import com.laptopcraft.client.os.OSSettings;
import com.laptopcraft.client.os.Theme;
import com.laptopcraft.client.os.apps.kit.KitApp;
import com.laptopcraft.client.os.ui.Ease;
import com.laptopcraft.client.os.ui.Gfx;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.Holder;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import org.lwjgl.glfw.GLFW;

/** Note Player: public-domain melodies played on note-block instruments, with a visualizer. */
public class MusicApp extends KitApp {
	private record Note(int semitone, int ms) {
	}

	private record Song(String title, String artist, int bpm, int color, String score) {
	}

	private static final Song[] SONGS = {
			new Song("Ode to Joy", "L. van Beethoven", 132, 0xFF3D8BFD,
					"E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4/1.5 D4/.5 D4/2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4/1.5 C4/.5 C4/2"),
			new Song("Twinkle Twinkle", "Traditional", 120, 0xFFF2B33D,
					"C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2 G4 G4 F4 F4 E4 E4 D4/2 G4 G4 F4 F4 E4 E4 D4/2 C4 C4 G4 G4 A4 A4 G4/2 F4 F4 E4 E4 D4 D4 C4/2"),
			new Song("Für Elise (opening)", "L. van Beethoven", 150, 0xFF9B5CF6,
					"E5/.5 D#5/.5 E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/.5 A4/1.5 R/.5 C4/.5 E4/.5 A4/.5 B4/1.5 R/.5 E4/.5 G#4/.5 B4/.5 C5/1.5 R/.5 E4/.5 E5/.5 D#5/.5 E5/.5 D#5/.5 E5/.5 B4/.5 D5/.5 C5/.5 A4/2"),
			new Song("Jingle Bells", "J. Pierpont", 160, 0xFFE5484D,
					"E4 E4 E4/2 E4 E4 E4/2 E4 G4 C4/1.5 D4/.5 E4/4 F4 F4 F4/1.5 F4/.5 F4 E4 E4 E4/.5 E4/.5 E4 D4 D4 E4 D4/2 G4/2"),
			new Song("Mary Had a Little Lamb", "Traditional", 140, 0xFF22B55E,
					"E4 D4 C4 D4 E4 E4 E4/2 D4 D4 D4/2 E4 G4 G4/2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4/4"),
			new Song("Happy Birthday", "M. & P. Hill", 110, 0xFFEC6FA9,
					"G4/.75 G4/.25 A4 G4 C5 B4/2 G4/.75 G4/.25 A4 G4 D5 C5/2 G4/.75 G4/.25 G5 E5 C5 B4 A4/2 F5/.75 F5/.25 E5 C5 D5 C5/2"),
			new Song("Brahms' Lullaby", "J. Brahms", 100, 0xFF1FB5A8,
					"E4/.5 E4/.5 G4/2 E4/.5 E4/.5 G4/2 E4/.5 G4/.5 C5 B4/1.5 A4/.5 A4 G4 D4/.5 E4/.5 F4 D4 D4/.5 E4/.5 F4/2"),
	};
	private static final String[] INSTRUMENT_NAMES = {"Harp", "Bell", "Flute", "Chime", "Xylophone", "Guitar", "Bit", "Pling"};

	private int current;
	private boolean playing;
	private int noteIdx;
	private long nextAt;
	private long songStart, pausedAt;
	private int instrument;
	private final float[] bars = new float[25];
	private List<Note> notes = parse(SONGS[0]);

	private static List<Note> parse(Song s) {
		List<Note> out = new ArrayList<>();
		int beat = 60000 / s.bpm;
		for (String tok : s.score.split(" ")) {
			String[] p = tok.split("/");
			double beats = p.length > 1 ? Double.parseDouble(p[1]) : 1;
			out.add(new Note(p[0].equals("R") ? -1 : semitone(p[0]), (int) (beats * beat)));
		}
		return out;
	}

	/** Note-block semitone (0 = F#3 ... 24 = F#5), clamped. */
	private static int semitone(String name) {
		String[] letters = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
		String n = name.substring(0, name.length() - 1);
		int oct = name.charAt(name.length() - 1) - '0';
		int idx = 0;
		for (int i = 0; i < letters.length; i++) {
			if (letters[i].equals(n)) {
				idx = i;
			}
		}
		int midi = (oct + 1) * 12 + idx;
		int s = midi - 54;
		while (s < 0) {
			s += 12;
		}
		while (s > 24) {
			s -= 12;
		}
		return s;
	}

	private SoundEvent instrument() {
		Holder<SoundEvent> h = switch (instrument) {
			case 1 -> SoundEvents.NOTE_BLOCK_BELL;
			case 2 -> SoundEvents.NOTE_BLOCK_FLUTE;
			case 3 -> SoundEvents.NOTE_BLOCK_CHIME;
			case 4 -> SoundEvents.NOTE_BLOCK_XYLOPHONE;
			case 5 -> SoundEvents.NOTE_BLOCK_GUITAR;
			case 6 -> SoundEvents.NOTE_BLOCK_BIT;
			case 7 -> SoundEvents.NOTE_BLOCK_PLING;
			default -> SoundEvents.NOTE_BLOCK_HARP;
		};
		return h.value();
	}

	private void select(int i) {
		current = Math.floorMod(i, SONGS.length);
		notes = parse(SONGS[current]);
		noteIdx = 0;
		nextAt = Ease.now() + 150;
		songStart = Ease.now();
		playing = true;
	}

	private int duration() {
		return notes.stream().mapToInt(Note::ms).sum();
	}

	private int elapsed() {
		return (int) Math.min(duration(), (playing ? Ease.now() : pausedAt) - songStart);
	}

	private void play(Note n) {
		if (n.semitone < 0) {
			return;
		}
		bars[n.semitone] = 1f;
		if (OSSettings.sounds(ctx.data())) {
			float pitch = (float) Math.pow(2, (n.semitone - 12) / 12.0);
			Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(instrument(), pitch, 0.6f));
		}
	}

	@Override
	protected void draw(GuiGraphics g, int w, int h, float pt) {
		long now = Ease.now();
		while (playing && noteIdx < notes.size() && now >= nextAt) {
			Note n = notes.get(noteIdx++);
			play(n);
			nextAt += n.ms;
		}
		if (playing && noteIdx >= notes.size() && now >= nextAt) {
			select(current + 1);
		}
		for (int i = 0; i < bars.length; i++) {
			bars[i] = Math.max(0, bars[i] - 0.03f);
		}
		Theme t = t();
		Gfx.rect(g, 0, 0, w, h, t.bg());
		int listW = w >= 300 ? 130 : 0;
		if (listW > 0) {
			Gfx.rect(g, 0, 0, listW, h, t.surfaceAlt());
			Gfx.text(g, "Library", 8, 6, t.textDim());
			for (int i = 0; i < SONGS.length; i++) {
				int y = 18 + i * 24, idx = i;
				boolean hov = region(g, 3, y, listW - 6, 22, () -> select(idx));
				if (i == current || hov) {
					Gfx.roundRect(g, 3, y, listW - 6, 22, 4, i == current ? t.selection() : t.hover());
				}
				art(g, SONGS[i], 6, y + 3, 16);
				Gfx.textClipped(g, SONGS[i].title, 26, y + 3, listW - 32, t.text());
				Gfx.textClipped(g, SONGS[i].artist, 26, y + 12, listW - 32, t.textDim());
			}
		}
		int x = listW + 10, cw = w - x - 10;
		Song s = SONGS[current];
		int art = Math.min(64, h / 3);
		art(g, s, x, 10, art);
		Gfx.textClipped(g, s.title, x + art + 10, 18, cw - art - 10, t.text());
		Gfx.textClipped(g, s.artist, x + art + 10, 30, cw - art - 10, t.textDim());
		String inst = "♪ " + INSTRUMENT_NAMES[instrument] + " ▾";
		if (region(g, x + art + 10, 44, Gfx.width(inst), 10, () -> instrument = (instrument + 1) % INSTRUMENT_NAMES.length)) {
			Gfx.text(g, inst, x + art + 10, 44, t.accent());
		} else {
			Gfx.text(g, inst, x + art + 10, 44, t.textDim());
		}
		// visualizer
		int vy = 20 + art, vh = Math.max(20, h - vy - 50);
		int bw = Math.max(2, cw / bars.length - 1);
		for (int i = 0; i < bars.length; i++) {
			float idle = playing ? 0.05f + 0.05f * (float) Math.sin(now / 200.0 + i) : 0.02f;
			int bh = (int) (Math.max(idle, bars[i]) * vh);
			Gfx.rect(g, x + i * (bw + 1), vy + vh - bh, bw, bh, Gfx.lerp(s.color, 0xFFFFFFFF, bars[i] * 0.4f));
		}
		// progress
		int py = h - 40;
		int el = elapsed(), du = Math.max(1, duration());
		Gfx.progressBar(g, x, py, cw, 3, el / (float) du, t.border(), s.color);
		Gfx.text(g, fmt(el), x, py + 6, t.textDim());
		Gfx.textRight(g, fmt(du), x + cw, py + 6, t.textDim());
		// controls
		int cx = x + cw / 2, cy = h - 22;
		ctrl(g, cx - 40, cy, "<<", () -> select(current - 1));
		boolean ph = region(g, cx - 10, cy - 2, 20, 20, this::toggle);
		Gfx.roundRect(g, cx - 10, cy - 2, 20, 20, 10, ph ? Gfx.lighten(t.accent(), 0.1f) : t.accent());
		Gfx.icon(g, playing ? Icons.PAUSE : Icons.PLAY, cx - 6, cy + 2, 12);
		ctrl(g, cx + 24, cy, ">>", () -> select(current + 1));
	}

	private void ctrl(GuiGraphics g, int x, int y, String label, Runnable r) {
		boolean hov = region(g, x, y, 16, 16, r);
		Gfx.roundRect(g, x, y, 16, 16, 8, hov ? t().hover() : t().surface());
		Gfx.textCentered(g, label, x + 8, y + 4, t().text());
	}

	private void toggle() {
		if (playing) {
			pausedAt = Ease.now();
			playing = false;
		} else {
			if (noteIdx >= notes.size()) {
				select(current);
				return;
			}
			long shift = Ease.now() - pausedAt;
			songStart += shift;
			nextAt += shift;
			playing = true;
		}
	}

	private static void art(GuiGraphics g, Song s, int x, int y, int size) {
		Gfx.gradientV(g, x, y, size, size, s.color, Gfx.darken(s.color, 0.5f));
		int u = Math.max(1, size / 8);
		for (int i = 0; i < 6; i++) {
			int px = x + (int) (Math.abs(s.title.hashCode() * (i + 3) % 7) * u);
			int py = y + (int) (Math.abs(s.artist.hashCode() * (i + 5) % 7) * u);
			Gfx.rect(g, px, py, u, u, 0x55FFFFFF);
		}
		Gfx.textCentered(g, "♫", x + size / 2, y + size / 2 - 4, 0xEEFFFFFF);
	}

	private static String fmt(int ms) {
		return (ms / 60000) + ":" + String.format("%02d", ms / 1000 % 60);
	}

	@Override
	public boolean keyPressed(int key, int scan, int mods) {
		switch (key) {
			case GLFW.GLFW_KEY_SPACE -> toggle();
			case GLFW.GLFW_KEY_RIGHT -> select(current + 1);
			case GLFW.GLFW_KEY_LEFT -> select(current - 1);
			default -> {
				return false;
			}
		}
		return true;
	}

	@Override
	public void onClose() {
		playing = false;
	}
}
