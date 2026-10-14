package net.abyssaldescent.client.hud;

import com.mojang.blaze3d.systems.RenderSystem;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;

/**
 * Vanilla never wraps tooltip lines, so long effect descriptions would run off narrow screens. This splits every line
 * after the item name to a readable width, keeping each piece's style and the line's leading indentation.
 */
public final class TooltipWrap {
	private static final int MAX_WIDTH = 210;

	private TooltipWrap() {
	}

	public static void wrap(List<Component> lines) {
		// Tooltip lines are also built on worker threads (the creative and recipe-book search trees). Measuring text
		// there can bake glyphs, which uploads to the GPU and throws off the render thread; search only needs the
		// unwrapped text anyway.
		if (!RenderSystem.isOnRenderThread()) {
			return;
		}
		Font font = Minecraft.getInstance().font;
		if (font == null || lines.size() < 2) {
			return;
		}
		List<Component> out = new ArrayList<>(lines.size() + 4);
		out.add(lines.get(0));
		for (int i = 1; i < lines.size(); i++) {
			Component line = lines.get(i);
			if (font.width(line) <= MAX_WIDTH) {
				out.add(line);
				continue;
			}
			String indent = leadingSpaces(line.getString());
			List<FormattedText> pieces = font.getSplitter().splitLines(line, MAX_WIDTH, Style.EMPTY);
			for (int p = 0; p < pieces.size(); p++) {
				MutableComponent piece = p == 0 ? Component.empty() : Component.literal(indent);
				MutableComponent target = piece;
				pieces.get(p).visit((style, text) -> {
					target.append(Component.literal(text).withStyle(style));
					return Optional.empty();
				}, Style.EMPTY);
				out.add(piece);
			}
		}
		lines.clear();
		lines.addAll(out);
	}

	private static String leadingSpaces(String text) {
		int n = 0;
		while (n < text.length() && text.charAt(n) == ' ') {
			n++;
		}
		return text.substring(0, n);
	}
}
