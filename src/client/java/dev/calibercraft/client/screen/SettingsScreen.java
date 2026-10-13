package dev.calibercraft.client.screen;

import dev.calibercraft.client.config.ClientConfig;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleSupplier;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;
import java.util.function.Supplier;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/** In-game editor for {@link ClientConfig} (HUD, effects, controls, audio). Changes apply immediately. */
public final class SettingsScreen extends Screen {
	private static final String[] TABS = {"hud", "effects", "controls", "audio"};
	private final @Nullable Screen parent;
	private int tab;
	private int index;

	public SettingsScreen(@Nullable Screen parent) {
		super(Component.translatable("calibercraft.settings.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int tw = Math.min(90, (width - 20) / TABS.length);
		int tx = width / 2 - tw * TABS.length / 2;
		for (int i = 0; i < TABS.length; i++) {
			int t = i;
			Button b = Button.builder(Component.translatable("calibercraft.settings.tab." + TABS[i]), x -> {
				tab = t;
				rebuildWidgets();
			}).bounds(tx + i * tw, 24, tw - 2, 20).build();
			b.active = i != tab;
			addRenderableWidget(b);
		}
		index = 0;
		ClientConfig c = ClientConfig.get();
		switch (TABS[tab]) {
			case "hud" -> {
				toggle("hud_enabled", () -> c.hudEnabled, v -> c.hudEnabled = v);
				cycle("hud_corner", 4, () -> c.hudCorner, v -> c.hudCorner = v);
				slider("hud_scale", 0.5, 2.0, () -> c.hudScale, v -> c.hudScale = (float) v, "%.2fx");
				toggle("simplified_hud", () -> c.simplifiedHud, v -> c.simplifiedHud = v);
				toggle("hit_markers", () -> c.hitMarkers, v -> c.hitMarkers = v);
				toggle("damage_numbers", () -> c.damageNumbers, v -> c.damageNumbers = v);
				cycle("crosshair", 3, () -> c.crosshairStyle, v -> c.crosshairStyle = v);
			}
			case "effects" -> {
				cycle("particles", 3, () -> c.particleQuality, v -> c.particleQuality = v);
				toggle("casings", () -> c.shellCasings, v -> c.shellCasings = v);
				toggle("tracers", () -> c.tracers, v -> c.tracers = v);
				toggle("muzzle_flash", () -> c.muzzleFlash, v -> c.muzzleFlash = v);
				toggle("muzzle_light", () -> c.muzzleLight, v -> c.muzzleLight = v);
				toggle("bullet_holes", () -> c.bulletHoles, v -> c.bulletHoles = v);
				slider("screen_shake", 0, 2, () -> c.screenShake, v -> c.screenShake = (float) v, "%.0f%%", 100);
				slider("camera_recoil", 0, 2, () -> c.cameraRecoil, v -> c.cameraRecoil = (float) v, "%.0f%%", 100);
				toggle("reduced_motion", () -> c.reducedMotion, v -> c.reducedMotion = v);
			}
			case "controls" -> {
				toggle("toggle_aim", () -> c.toggleAim, v -> c.toggleAim = v);
				slider("aim_sensitivity", 0.1, 2, () -> c.aimSensitivity, v -> c.aimSensitivity = (float) v, "%.0f%%", 100);
				slider("scope_sensitivity", 0.1, 2, () -> c.scopeSensitivity, v -> c.scopeSensitivity = (float) v, "%.0f%%", 100);
			}
			default -> {
				slider("gun_volume", 0, 2, () -> c.gunVolume, v -> c.gunVolume = (float) v, "%.0f%%", 100);
				toggle("reduce_repeated", () -> c.reduceRepeatedSounds, v -> c.reduceRepeatedSounds = v);
				toggle("travel_delay", () -> c.soundTravelDelay, v -> c.soundTravelDelay = v);
				toggle("occlusion", () -> c.soundOcclusion, v -> c.soundOcclusion = v);
			}
		}
		addRenderableWidget(Button.builder(CommonComponents.GUI_DONE, b -> onClose()).bounds(width / 2 - 100, height - 28, 200, 20).build());
	}

	private int[] nextSlot() {
		int col = index % 2;
		int row = index / 2;
		index++;
		int w = Math.min(150, width / 2 - 14);
		int x = col == 0 ? width / 2 - w - 4 : width / 2 + 4;
		return new int[] {x, 54 + row * 24, w};
	}

	private Component label(String key) {
		return Component.translatable("calibercraft.settings." + key);
	}

	private Tooltip tip(String key) {
		return Tooltip.create(Component.translatable("calibercraft.settings." + key + ".tooltip"));
	}

	private void toggle(String key, Supplier<Boolean> get, Consumer<Boolean> set) {
		int[] s = nextSlot();
		Button b = Button.builder(Component.empty(), x -> {
			set.accept(!get.get());
			commit();
			x.setMessage(CommonComponents.optionNameValue(label(key), CommonComponents.optionStatus(get.get())));
		}).bounds(s[0], s[1], s[2], 20).tooltip(tip(key)).build();
		b.setMessage(CommonComponents.optionNameValue(label(key), CommonComponents.optionStatus(get.get())));
		addRenderableWidget(b);
	}

	private void cycle(String key, int count, IntSupplier get, IntConsumer set) {
		int[] s = nextSlot();
		Button b = Button.builder(Component.empty(), x -> {
			set.accept((get.getAsInt() + 1) % count);
			commit();
			x.setMessage(CommonComponents.optionNameValue(label(key), label(key + "." + get.getAsInt())));
		}).bounds(s[0], s[1], s[2], 20).tooltip(tip(key)).build();
		b.setMessage(CommonComponents.optionNameValue(label(key), label(key + "." + get.getAsInt())));
		addRenderableWidget(b);
	}

	private void slider(String key, double min, double max, DoubleSupplier get, DoubleConsumer set, String fmt) {
		slider(key, min, max, get, set, fmt, 1);
	}

	private void slider(String key, double min, double max, DoubleSupplier get, DoubleConsumer set, String fmt, double display) {
		int[] s = nextSlot();
		AbstractSliderButton slider = new AbstractSliderButton(s[0], s[1], s[2], 20, Component.empty(), (get.getAsDouble() - min) / (max - min)) {
			{
				updateMessage();
			}

			@Override
			protected void updateMessage() {
				double v = min + value * (max - min);
				setMessage(CommonComponents.optionNameValue(label(key), Component.literal(String.format(fmt, v * display))));
			}

			@Override
			protected void applyValue() {
				set.accept(min + value * (max - min));
				commit();
			}
		};
		slider.setTooltip(tip(key));
		addRenderableWidget(slider);
	}

	private static void commit() {
		ClientConfig.get().validate();
		ClientConfig.save();
	}

	@Override
	public void render(GuiGraphics g, int mx, int my, float partial) {
		super.render(g, mx, my, partial);
		g.drawCenteredString(font, title, width / 2, 8, 0xFFFFFFFF);
	}

	@Override
	public void onClose() {
		commit();
		minecraft.setScreen(parent);
	}
}
