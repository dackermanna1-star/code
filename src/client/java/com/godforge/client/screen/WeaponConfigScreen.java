package com.godforge.client.screen;

import com.godforge.client.ClientConfig;
import com.godforge.network.SettingsPayload;
import com.godforge.weapon.BeamColors;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.SettingSpec;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import com.godforge.weapon.WeaponType;
import java.util.function.Function;
import java.util.function.IntConsumer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.ARGB;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

/**
 * Tune the held god weapon (sent to the server, which validates and clamps every value) and the
 * player's own visual-effect preferences (stored locally).
 */
public class WeaponConfigScreen extends Screen {
	private final ItemStack stack;
	private final InteractionHand hand;
	private final WeaponType type;
	private WeaponSettings settings;
	private Button colorButton;
	private int weaponColumnX = -1;
	private int visualColumnX = -1;
	private int columnLabelY;

	public WeaponConfigScreen(ItemStack stack, InteractionHand hand) {
		super(Component.translatable("screen.godforge.configure"));
		this.stack = stack;
		this.hand = hand;
		this.type = ((GodWeaponItem) stack.getItem()).type();
		this.settings = GodWeaponItem.settings(stack);
	}

	@Override
	protected void init() {
		// two columns from 400 scaled pixels: that covers 1280x720 at GUI scale 3 (426x240)
		boolean twoColumns = this.width >= 400;
		int colW = twoColumns ? Math.min(200, (this.width - 30) / 2) : Math.min(260, this.width - 20);
		int left = twoColumns ? this.width / 2 - colW - 5 : this.width / 2 - colW / 2;
		int top = 44;
		int row = this.height < 300 ? 22 : 24;
		int y = top;
		this.weaponColumnX = twoColumns ? left : -1;
		this.columnLabelY = top - 10;

		// firing mode
		this.addRenderableWidget(Button.builder(this.modeLabel(), b -> {
			this.settings = this.settings.with(WeaponSettings.Field.MODE, (this.settings.mode() + (hasShift() ? -1 + this.type.modes().size() : 1)) % this.type.modes().size());
			b.setMessage(this.modeLabel());
		}).bounds(left, y, colW, 20).build());
		y += row;

		for (SettingSpec spec : this.type.settings()) {
			int value = this.settings.get(spec.field());
			switch (spec.format()) {
				case TOGGLE -> this.addRenderableWidget(Button.builder(this.toggleLabel(spec, value != 0), b -> {
					boolean on = this.settings.get(spec.field()) == 0;
					this.settings = this.settings.with(spec.field(), on ? 1 : 0);
					b.setMessage(this.toggleLabel(spec, on));
				}).bounds(left, y, colW, 20).build());
				case COLOR -> this.colorButton = this.addRenderableWidget(Button.builder(this.colorLabel(value), b -> {
					int next = (this.settings.get(spec.field()) + (hasShift() ? BeamColors.COUNT - 1 : 1)) % BeamColors.COUNT;
					this.settings = this.settings.with(spec.field(), next);
					b.setMessage(this.colorLabel(next));
				}).bounds(left, y, colW - 24, 20).build());
				default -> this.addRenderableWidget(new IntSlider(left, y, colW, 20, spec.min(), spec.max(), value,
					v -> Component.translatable(spec.translationKey()).append(": ").append(format(spec, v)),
					v -> this.settings = this.settings.with(spec.field(), v)));
			}
			y += row;
		}

		// client visual preferences
		int vx = twoColumns ? this.width / 2 + 5 : left;
		int vy = twoColumns ? top : y + 8;
		this.visualColumnX = twoColumns ? vx : -1;
		ClientConfig cfg = ClientConfig.get();
		this.addRenderableWidget(new IntSlider(vx, vy, colW, 20, 0, 200, (int) Math.round(cfg.screenShake * 100),
			v -> Component.translatable("setting.godforge.client.shake").append(": " + v + "%"), v -> cfg.screenShake = v / 100.0));
		vy += row;
		this.addRenderableWidget(new IntSlider(vx, vy, colW, 20, 0, 100, (int) Math.round(cfg.flashes * 100),
			v -> Component.translatable("setting.godforge.client.flashes").append(": " + v + "%"), v -> cfg.flashes = v / 100.0));
		vy += row;
		this.addRenderableWidget(new IntSlider(vx, vy, colW, 20, 10, 200, (int) Math.round(cfg.particles * 100),
			v -> Component.translatable("setting.godforge.client.particles").append(": " + v + "%"), v -> cfg.particles = v / 100.0));
		vy += row;
		this.addRenderableWidget(Button.builder(this.onOff("setting.godforge.client.distortion", cfg.distortion), b -> {
			cfg.distortion = !cfg.distortion;
			b.setMessage(this.onOff("setting.godforge.client.distortion", cfg.distortion));
		}).bounds(vx, vy, colW / 2 - 2, 20).build());
		this.addRenderableWidget(Button.builder(this.onOff("setting.godforge.client.hud", cfg.hud), b -> {
			cfg.hud = !cfg.hud;
			b.setMessage(this.onOff("setting.godforge.client.hud", cfg.hud));
		}).bounds(vx + colW / 2 + 2, vy, colW / 2 - 2, 20).build());
		vy += row;

		int bottom = Math.max(y, vy) + 10;
		bottom = Math.min(bottom, this.height - 28);
		int bw = 96;
		int bx = this.width / 2 - (bw * 3 + 8) / 2;
		this.addRenderableWidget(Button.builder(Component.translatable("screen.godforge.reset"), b -> {
			this.settings = this.type.defaultSettings().with(WeaponSettings.Field.MODE, this.settings.mode());
			this.rebuildWidgets();
		}).bounds(bx, bottom, bw, 20).build());
		this.addRenderableWidget(Button.builder(Component.translatable("screen.godforge.apply"), b -> this.apply()).bounds(bx + bw + 4, bottom, bw, 20).build());
		this.addRenderableWidget(Button.builder(Component.translatable("gui.cancel"), b -> {
			ClientConfig.load();
			this.onClose();
		}).bounds(bx + (bw + 4) * 2, bottom, bw, 20).build());
	}

	private void apply() {
		ClientConfig.save();
		ClientPlayNetworking.send(new SettingsPayload(this.hand == InteractionHand.OFF_HAND ? 1 : 0, this.type.sanitize(this.settings)));
		this.onClose();
	}

	private static boolean hasShift() {
		return net.minecraft.client.Minecraft.getInstance().hasShiftDown();
	}

	private Component modeLabel() {
		WeaponMode mode = this.type.mode(this.settings.mode());
		return Component.translatable("screen.godforge.mode", Component.translatable(mode.translationKey()).withStyle(mode.ultimate() ? ChatFormatting.GOLD : ChatFormatting.AQUA));
	}

	private Component toggleLabel(SettingSpec spec, boolean on) {
		return Component.translatable(spec.translationKey()).append(": ").append(Component.translatable(on ? "options.on" : "options.off"));
	}

	private Component onOff(String key, boolean on) {
		return Component.translatable(key).append(": ").append(Component.translatable(on ? "options.on" : "options.off"));
	}

	private Component colorLabel(int index) {
		String name = index >= 0 && index < BeamColors.NAMES.length ? BeamColors.NAMES[index] : "rainbow";
		return Component.translatable("setting.godforge.beam_color").append(": ").append(Component.translatable("color.godforge." + name));
	}

	static Component format(SettingSpec spec, int value) {
		return switch (spec.format()) {
			case PERCENT -> Component.literal(value + "%");
			case BLOCKS -> Component.translatable("format.godforge.blocks", value);
			case LEVEL -> Component.translatable("format.godforge.level", value);
			default -> Component.literal(Integer.toString(value));
		};
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		super.render(graphics, mouseX, mouseY, partialTick);
		int color = ARGB.opaque(this.type.color());
		graphics.drawCenteredString(this.font, Component.translatable(this.type.translationKey()).withStyle(ChatFormatting.BOLD), this.width / 2, 12, color);
		graphics.drawCenteredString(this.font, Component.translatable(this.type.translationKey() + ".title"), this.width / 2, 24, 0xFFB0B0C0);
		if (this.weaponColumnX >= 0) {
			graphics.drawString(this.font, Component.translatable("screen.godforge.weapon_settings"), this.weaponColumnX + 2, this.columnLabelY, 0xFF8890A0);
			graphics.drawString(this.font, Component.translatable("screen.godforge.visual_settings"), this.visualColumnX + 2, this.columnLabelY, 0xFF8890A0);
		}
		if (this.colorButton != null) {
			int x = this.colorButton.getX() + this.colorButton.getWidth() + 4;
			int y = this.colorButton.getY();
			int rgb = BeamColors.rgb(this.settings.color(), this.minecraft.player != null ? this.minecraft.player.tickCount + partialTick : 0);
			graphics.fill(x, y, x + 20, y + 20, 0xFF000000);
			graphics.fill(x + 2, y + 2, x + 18, y + 18, ARGB.opaque(rgb));
		}
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public boolean isInGameUi() {
		// darken the world behind the screen like inventories do
		return true;
	}

	/** Integer slider with live label. */
	static final class IntSlider extends AbstractSliderButton {
		private final int min;
		private final int max;
		private final Function<Integer, Component> label;
		private final IntConsumer onChange;

		IntSlider(int x, int y, int width, int height, int min, int max, int value, Function<Integer, Component> label, IntConsumer onChange) {
			super(x, y, width, height, Component.empty(), max == min ? 0.0 : (value - min) / (double) (max - min));
			this.min = min;
			this.max = max;
			this.label = label;
			this.onChange = onChange;
			this.updateMessage();
		}

		int intValue() {
			return this.min + (int) Math.round(this.value * (this.max - this.min));
		}

		@Override
		protected void updateMessage() {
			this.setMessage(this.label.apply(this.intValue()));
		}

		@Override
		protected void applyValue() {
			this.onChange.accept(this.intValue());
		}
	}
}
