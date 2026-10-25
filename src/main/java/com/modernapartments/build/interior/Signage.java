package com.modernapartments.build.interior;

import com.modernapartments.build.Canvas;
import com.modernapartments.build.Inits;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import net.minecraft.core.Direction;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

/** Building names in block letters, wall signs and wayfinding. */
public final class Signage {
	private static final Map<Character, String[]> FONT = new HashMap<>();

	static {
		glyph('A', ".#.", "#.#", "###", "#.#", "#.#");
		glyph('B', "##.", "#.#", "##.", "#.#", "##.");
		glyph('C', ".##", "#..", "#..", "#..", ".##");
		glyph('D', "##.", "#.#", "#.#", "#.#", "##.");
		glyph('E', "###", "#..", "##.", "#..", "###");
		glyph('F', "###", "#..", "##.", "#..", "#..");
		glyph('G', ".##", "#..", "#.#", "#.#", ".##");
		glyph('H', "#.#", "#.#", "###", "#.#", "#.#");
		glyph('I', "###", ".#.", ".#.", ".#.", "###");
		glyph('J', "..#", "..#", "..#", "#.#", ".#.");
		glyph('K', "#.#", "#.#", "##.", "#.#", "#.#");
		glyph('L', "#..", "#..", "#..", "#..", "###");
		glyph('M', "#...#", "##.##", "#.#.#", "#...#", "#...#");
		glyph('N', "#..#", "##.#", "#.##", "#..#", "#..#");
		glyph('O', ".#.", "#.#", "#.#", "#.#", ".#.");
		glyph('P', "##.", "#.#", "##.", "#..", "#..");
		glyph('Q', ".#.", "#.#", "#.#", "##.", ".##");
		glyph('R', "##.", "#.#", "##.", "#.#", "#.#");
		glyph('S', ".##", "#..", ".#.", "..#", "##.");
		glyph('T', "###", ".#.", ".#.", ".#.", ".#.");
		glyph('U', "#.#", "#.#", "#.#", "#.#", "###");
		glyph('V', "#.#", "#.#", "#.#", "#.#", ".#.");
		glyph('W', "#...#", "#...#", "#.#.#", "##.##", "#...#");
		glyph('X', "#.#", "#.#", ".#.", "#.#", "#.#");
		glyph('Y', "#.#", "#.#", ".#.", ".#.", ".#.");
		glyph('Z', "###", "..#", ".#.", "#..", "###");
		glyph('0', "###", "#.#", "#.#", "#.#", "###");
		glyph('1', ".#.", "##.", ".#.", ".#.", "###");
		glyph('2', "##.", "..#", ".#.", "#..", "###");
		glyph('3', "##.", "..#", ".#.", "..#", "##.");
		glyph('4', "#.#", "#.#", "###", "..#", "..#");
		glyph('5', "###", "#..", "##.", "..#", "##.");
		glyph('6', ".##", "#..", "###", "#.#", "###");
		glyph('7', "###", "..#", ".#.", ".#.", ".#.");
		glyph('8', "###", "#.#", "###", "#.#", "###");
		glyph('9', "###", "#.#", "###", "..#", "##.");
		glyph(' ', "..", "..", "..", "..", "..");
		glyph('.', ".", ".", ".", ".", "#");
		glyph('&', ".#.", "#.#", ".#.", "#.#", ".##");
	}

	private Signage() {
	}

	private static void glyph(char ch, String... rows) {
		FONT.put(ch, rows);
	}

	/** Width in blocks of {@code text} in the block font (one block between letters). */
	public static int width(String text) {
		int w = 0;
		String t = text.toUpperCase(Locale.ROOT);
		for (int i = 0; i < t.length(); i++) {
			String[] g = FONT.getOrDefault(t.charAt(i), FONT.get(' '));
			w += g[0].length() + (i < t.length() - 1 ? 1 : 0);
		}
		return w;
	}

	/**
	 * Draws block letters on a vertical plane. The text starts at (x, y, z) (bottom-left of the first
	 * letter, as read by a viewer) and runs towards {@code along}; letters are five blocks tall.
	 */
	public static void letters(Canvas c, int x, int y, int z, Direction along, String text, Block block) {
		String t = text.toUpperCase(Locale.ROOT);
		int offset = 0;
		for (int i = 0; i < t.length(); i++) {
			String[] g = FONT.getOrDefault(t.charAt(i), FONT.get(' '));
			for (int row = 0; row < 5; row++) {
				String line = g[row];
				for (int col = 0; col < line.length(); col++) {
					if (line.charAt(col) == '#') {
						int k = offset + col;
						c.set(x + along.getStepX() * k, y + 4 - row, z + along.getStepZ() * k, block);
					}
				}
			}
			offset += g[0].length() + 1;
		}
	}

	/** Letters centred on (cx, z) along {@code along}. */
	public static void centredLetters(Canvas c, int cx, int y, int cz, Direction along, String text, Block block) {
		int w = width(text);
		int sx = cx - along.getStepX() * (w / 2);
		int sz = cz - along.getStepZ() * (w / 2);
		letters(c, sx, y, sz, along, text, block);
	}

	/** Wall sign with up to four lines, glowing text. */
	public static void sign(Canvas c, int x, int y, int z, Direction facing, Block sign, DyeColor color, String... lines) {
		c.wallSign(x, y, z, sign, facing, Inits.sign(color, true, false, lines));
	}

	/** Dark wall sign with white glowing text: wayfinding, directories, room names. */
	public static void wayfinding(Canvas c, int x, int y, int z, Direction facing, String... lines) {
		sign(c, x, y, z, facing, Blocks.DARK_OAK_WALL_SIGN, DyeColor.WHITE, lines);
	}

	/** Free-standing sign post with text on both sides. */
	public static void post(Canvas c, int x, int y, int z, Direction facing, Block standing, String... lines) {
		c.set(x, y, z, standing.defaultBlockState().setValue(net.minecraft.world.level.block.StandingSignBlock.ROTATION,
			switch (facing) {
				case SOUTH -> 0;
				case WEST -> 4;
				case NORTH -> 8;
				default -> 12;
			}));
		c.init(x, y, z, Inits.sign(DyeColor.WHITE, true, true, lines));
	}
}
