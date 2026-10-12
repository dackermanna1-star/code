package com.chaosunleashed.client.screen;

import com.chaosunleashed.client.ClientChaosState;
import com.chaosunleashed.core.ChaosEventType;
import com.chaosunleashed.core.EventPhase;
import com.chaosunleashed.network.ChaosStatusPayload;
import com.chaosunleashed.network.PanelActionPayload;
import com.chaosunleashed.registry.ModBlocks;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.tooltip.Tooltip;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.item.ItemStack;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;

/**
 * The Chaos Control Panel GUI: every event with its icon, an ON/OFF toggle (random triggering) and a Start Now
 * button, an intensity slider, the master Random Events switch, a big STOP button and a live status line.
 * <p>
 * All buttons only send a {@link PanelActionPayload}; the server validates and applies it, then broadcasts the new
 * status to everyone, so this screen (and every other open panel, and the chat menu) always shows the same data.
 */
public class ChaosPanelScreen extends Screen {
	private static final int CELL_W = 196;
	private static final int ROW_H = 22;
	private static final int PANEL_W = 8 + CELL_W + 8 + CELL_W + 8;
	private static final int PANEL_H = 232;
	private static int lastIntensity = 3;

	private final BlockPos pos;
	private final ColoredButton[] toggles = new ColoredButton[ChaosEventType.values().length];
	private final ColoredButton[] starts = new ColoredButton[ChaosEventType.values().length];
	private ColoredButton randomButton;
	private ColoredButton stopButton;
	private IntensitySlider slider;
	private int left;
	private int top;

	public ChaosPanelScreen(BlockPos pos) {
		super(Text.translatable("screen.chaosunleashed.control_panel"));
		this.pos = pos;
	}

	@Override
	protected void init() {
		this.left = (this.width - PANEL_W) / 2;
		this.top = Math.max(4, (this.height - PANEL_H) / 2);
		ChaosEventType[] types = ChaosEventType.values();
		for (int i = 0; i < types.length; i++) {
			ChaosEventType type = types[i];
			int cx = this.cellX(i);
			int cy = this.cellY(i);
			this.toggles[i] = this.addDrawableChild(new ColoredButton(cx + 104, cy, 34, 20, Text.empty(), button -> {
				boolean enabled = ClientChaosState.isEnabled(type);
				this.send(enabled ? PanelActionPayload.Action.DISABLE : PanelActionPayload.Action.ENABLE, type);
			}));
			this.starts[i] = this.addDrawableChild(new ColoredButton(cx + 140, cy, 56, 20, Text.empty(), button -> {
				if (ClientChaosState.active(type) != null) {
					this.send(PanelActionPayload.Action.STOP_EVENT, type);
				} else {
					this.send(PanelActionPayload.Action.START, type);
				}
			}));
			this.starts[i].setTooltip(Tooltip.of(Text.literal(type.description()).formatted(Formatting.GRAY)));
		}
		int controlsY = this.top + 40 + 5 * ROW_H + 6;
		this.slider = this.addDrawableChild(new IntensitySlider(this.left + 8, controlsY, CELL_W, 20, lastIntensity));
		this.randomButton = this.addDrawableChild(new ColoredButton(this.left + 16 + CELL_W, controlsY, CELL_W, 20, Text.empty(),
			button -> this.send(ClientChaosState.isRandomEnabled() ? PanelActionPayload.Action.RANDOM_OFF : PanelActionPayload.Action.RANDOM_ON, null)));
		this.randomButton.setTooltip(Tooltip.of(Text.literal("Master switch for random events. Events can still be started manually.")));
		this.stopButton = this.addDrawableChild(new ColoredButton(this.left + 8, controlsY + 26, PANEL_W - 16, 24,
			Text.literal("■ STOP CURRENT EVENT").formatted(Formatting.BOLD),
			button -> this.send(PanelActionPayload.Action.STOP_ALL, null)));
		this.stopButton.overlay = 0xB0D01010;
		this.stopButton.setTooltip(Tooltip.of(Text.literal("Immediately end every running event and clean everything up.\n(Tip: sneak + right-click the panel does the same.)")));
		this.addDrawableChild(ButtonWidget.builder(Text.literal("Close"), button -> this.close())
			.dimensions(this.left + PANEL_W - 58, this.top + 6, 50, 16).build());
		this.refresh();
	}

	private int cellX(int index) {
		return this.left + 8 + (index % 2) * (CELL_W + 8);
	}

	private int cellY(int index) {
		return this.top + 40 + (index / 2) * ROW_H;
	}

	private void send(PanelActionPayload.Action action, ChaosEventType type) {
		if (!ClientChaosState.canEdit()) {
			return;
		}
		int ordinal = type == null ? -1 : type.ordinal();
		ClientPlayNetworking.send(new PanelActionPayload(this.pos, action, ordinal, this.slider.intensity()));
	}

	/** Refreshes all labels and enabled states from the synced client state. */
	private void refresh() {
		boolean canEdit = ClientChaosState.canEdit();
		ChaosEventType[] types = ChaosEventType.values();
		for (int i = 0; i < types.length; i++) {
			ChaosEventType type = types[i];
			boolean enabled = ClientChaosState.isEnabled(type);
			ColoredButton toggle = this.toggles[i];
			toggle.setMessage(enabled ? Text.literal("ON").formatted(Formatting.GREEN, Formatting.BOLD) : Text.literal("OFF").formatted(Formatting.RED, Formatting.BOLD));
			toggle.overlay = enabled ? 0x6000A000 : 0x60A00000;
			toggle.active = canEdit;
			toggle.setTooltip(Tooltip.of(Text.literal((enabled ? "ON" : "OFF") + ": " + type.displayName()
				+ (enabled ? " can trigger randomly. Click to turn OFF." : " will not trigger randomly. Click to turn ON."))));

			ColoredButton start = this.starts[i];
			boolean running = ClientChaosState.active(type) != null;
			start.setMessage(running ? Text.literal("Stop").formatted(Formatting.GOLD) : Text.literal("Start Now"));
			start.overlay = running ? 0x60C06000 : 0x302060C0;
			start.active = canEdit;
		}
		boolean random = ClientChaosState.isRandomEnabled();
		this.randomButton.setMessage(Text.literal("Random Events: ").append(random
			? Text.literal("ON").formatted(Formatting.GREEN, Formatting.BOLD)
			: Text.literal("OFF").formatted(Formatting.RED, Formatting.BOLD)));
		this.randomButton.overlay = random ? 0x5000A000 : 0x50A00000;
		this.randomButton.active = canEdit;
		this.stopButton.active = canEdit && !ClientChaosState.events().isEmpty();
		this.slider.active = canEdit;
	}

	@Override
	public void tick() {
		this.refresh();
		if (this.client != null && this.client.player != null && this.client.world != null) {
			boolean tooFar = this.client.player.squaredDistanceTo(Vec3d.ofCenter(this.pos)) > 10.0 * 10.0;
			boolean gone = !this.client.world.getBlockState(this.pos).isOf(ModBlocks.CHAOS_CONTROL_PANEL);
			if (tooFar || gone) {
				this.close();
			}
		}
	}

	@Override
	public void renderBackground(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
		super.renderBackground(context, mouseX, mouseY, deltaTicks);
		int x0 = this.left;
		int y0 = this.top;
		int x1 = x0 + PANEL_W;
		int y1 = y0 + PANEL_H;
		int accent = this.accentColor();
		context.fill(x0 - 2, y0 - 2, x1 + 2, y1 + 2, accent);
		context.fill(x0, y0, x1, y1, 0xF0101016);
		context.fillGradient(x0, y0, x1, y0 + 28, 0xFF1C1C2A, 0xFF101016);
		// Event cells
		ChaosEventType[] types = ChaosEventType.values();
		for (int i = 0; i < types.length; i++) {
			int cx = this.cellX(i);
			int cy = this.cellY(i);
			ChaosStatusPayload.EventInfo info = ClientChaosState.active(types[i]);
			int bg = 0xFF1A1A24;
			if (info != null) {
				float pulse = 0.5F + 0.5F * MathHelper.sin((this.client.world != null ? this.client.world.getTime() : 0) * 0.3F + deltaTicks * 0.3F);
				int alpha = 0x60 + (int) (pulse * 0x60);
				bg = (alpha << 24) | (info.phase() == EventPhase.ACTIVE.ordinal() ? 0xC01010 : 0xC0A010);
			}
			context.fill(cx - 2, cy - 1, cx + CELL_W, cy + 21, bg);
		}
	}

	private int accentColor() {
		EventPhase phase = null;
		for (ChaosStatusPayload.EventInfo info : ClientChaosState.events()) {
			EventPhase p = EventPhase.byOrdinal(info.phase());
			if (phase == null || p == EventPhase.ACTIVE) {
				phase = p;
			}
		}
		if (phase == null) {
			return 0xFF20A040;
		}
		return phase == EventPhase.ACTIVE ? 0xFFD02020 : 0xFFD0B020;
	}

	@Override
	public void render(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
		super.render(context, mouseX, mouseY, deltaTicks);
		context.drawTextWithShadow(this.textRenderer, Text.literal("⚠ ").formatted(Formatting.YELLOW)
			.append(this.title.copy().formatted(Formatting.GOLD, Formatting.BOLD))
			.append(Text.literal(" ⚠").formatted(Formatting.YELLOW)), this.left + 10, this.top + 8, 0xFFFFFFFF);
		context.drawTextWithShadow(this.textRenderer, this.statusLine(), this.left + 10, this.top + 24, 0xFFFFFFFF);

		ChaosEventType[] types = ChaosEventType.values();
		for (int i = 0; i < types.length; i++) {
			ChaosEventType type = types[i];
			int cx = this.cellX(i);
			int cy = this.cellY(i);
			context.drawItem(new ItemStack(type.icon()), cx, cy + 2);
			MutableText name = Text.literal(type.displayName()).styled(s -> s.withColor(type.color()));
			context.drawTextWithShadow(this.textRenderer, name, cx + 20, cy + 6, 0xFFFFFFFF);
		}

		int bottom = this.top + 40 + 5 * ROW_H + 6 + 26 + 28;
		if (!ClientChaosState.canEdit()) {
			context.drawCenteredTextWithShadow(this.textRenderer,
				Text.literal("Read-only: only operators can change Chaos settings on this server.").formatted(Formatting.YELLOW),
				this.left + PANEL_W / 2, bottom, 0xFFFFFFFF);
		} else {
			context.drawCenteredTextWithShadow(this.textRenderer,
				Text.literal("ON/OFF = random triggering · Start Now works even when OFF").formatted(Formatting.DARK_GRAY),
				this.left + PANEL_W / 2, bottom, 0xFFFFFFFF);
		}
	}

	private Text statusLine() {
		if (ClientChaosState.events().isEmpty()) {
			MutableText text = Text.literal("● Idle").formatted(Formatting.GREEN);
			int cooldown = ClientChaosState.cooldownTicks();
			if (!ClientChaosState.isRandomEnabled()) {
				text.append(Text.literal("  —  random events are OFF").formatted(Formatting.GRAY));
			} else if (cooldown > 0) {
				int s = cooldown / 20;
				text.append(Text.literal("  —  next random event possible in " + s / 60 + ":" + String.format("%02d", s % 60)).formatted(Formatting.GRAY));
			} else {
				text.append(Text.literal("  —  a random event may strike at any time...").formatted(Formatting.GRAY));
			}
			return text;
		}
		ChaosStatusPayload.EventInfo info = ClientChaosState.events().getFirst();
		ChaosEventType type = ChaosEventType.byOrdinal(info.type());
		EventPhase phase = EventPhase.byOrdinal(info.phase());
		int seconds = MathHelper.ceil(ClientChaosState.remaining(info) / 20.0F);
		Formatting color = phase == EventPhase.ACTIVE ? Formatting.RED : phase == EventPhase.WARNING ? Formatting.YELLOW : Formatting.GREEN;
		MutableText text = Text.literal("▶ ").formatted(color);
		if (type != null) {
			text.append(type.coloredName());
		}
		text.append(Text.literal("  " + phase.label().toUpperCase()).formatted(color, Formatting.BOLD));
		if (info.waiting()) {
			text.append(Text.literal("  waiting for the right time of day").formatted(Formatting.GRAY));
		} else {
			text.append(Text.literal("  " + seconds / 60 + ":" + String.format("%02d", seconds % 60) + " left").formatted(Formatting.WHITE));
		}
		text.append(Text.literal("  (intensity " + info.intensity() + ")").formatted(Formatting.DARK_GRAY));
		if (ClientChaosState.events().size() > 1) {
			text.append(Text.literal(" +" + (ClientChaosState.events().size() - 1) + " more").formatted(Formatting.GRAY));
		}
		return text;
	}

	@Override
	public boolean shouldPause() {
		return false;
	}

	@Override
	public void removed() {
		lastIntensity = this.slider != null ? this.slider.intensity() : lastIntensity;
		super.removed();
	}

	/** A vanilla button with a colored tint. */
	static class ColoredButton extends ButtonWidget {
		int overlay;

		ColoredButton(int x, int y, int width, int height, net.minecraft.text.Text message, PressAction onPress) {
			super(x, y, width, height, message, onPress, DEFAULT_NARRATION_SUPPLIER);
		}

		@Override
		protected void drawIcon(DrawContext context, int mouseX, int mouseY, float deltaTicks) {
			this.drawButton(context);
			if (this.overlay != 0) {
				int color = this.active ? this.overlay : (this.overlay & 0x00FFFFFF) | 0x20000000;
				context.fill(this.getX() + 1, this.getY() + 1, this.getX() + this.getWidth() - 1, this.getY() + this.getHeight() - 1, color);
			}
			this.drawLabel(context.getHoverListener(this, DrawContext.HoverType.NONE));
		}
	}

	/** Intensity 1-5 used by "Start Now". */
	static class IntensitySlider extends SliderWidget {
		IntensitySlider(int x, int y, int width, int height, int intensity) {
			super(x, y, width, height, Text.empty(), (MathHelper.clamp(intensity, 1, 5) - 1) / 4.0);
			this.updateMessage();
		}

		int intensity() {
			return 1 + (int) Math.round(this.value * 4.0);
		}

		@Override
		protected void updateMessage() {
			int level = this.intensity();
			MutableText bars = Text.literal("▮".repeat(level)).formatted(level >= 4 ? Formatting.RED : level >= 3 ? Formatting.GOLD : Formatting.GREEN)
				.append(Text.literal("▯".repeat(5 - level)).formatted(Formatting.DARK_GRAY));
			this.setMessage(Text.literal("Intensity: " + level + "  ").append(bars));
		}

		@Override
		protected void applyValue() {
			this.value = (this.intensity() - 1) / 4.0;
			lastIntensity = this.intensity();
		}
	}
}
