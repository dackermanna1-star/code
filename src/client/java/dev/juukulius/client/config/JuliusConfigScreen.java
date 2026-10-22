package dev.juukulius.client.config;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.CycleButton;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import org.jspecify.annotations.Nullable;

/** In-game visual settings: particle density, camera shake, trails, magic circles and HUD placement. */
public class JuliusConfigScreen extends Screen {
	private final @Nullable Screen parent;

	public JuliusConfigScreen(@Nullable Screen parent) {
		super(Component.translatable("options.julius_juukulius.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		JuliusClientConfig config = JuliusClientConfig.get();
		int left = this.width / 2 - 155;
		int right = this.width / 2 + 5;
		int y = this.height / 6;
		int row = 24;

		this.addRenderableWidget(CycleButton.builder((JuliusClientConfig.ParticleLevel level) ->
				Component.translatable("options.julius_juukulius.particles." + level.name().toLowerCase(java.util.Locale.ROOT)), config.particles)
			.withValues(List.of(JuliusClientConfig.ParticleLevel.values()))
			.create(left, y, 150, 20, Component.translatable("options.julius_juukulius.particles"), (button, value) -> {
				config.particles = value;
				config.apply();
			}));
		this.addRenderableWidget(CycleButton.onOffBuilder(config.swordTrails)
			.create(right, y, 150, 20, Component.translatable("options.julius_juukulius.trails"), (button, value) -> config.swordTrails = value));
		y += row;
		this.addRenderableWidget(CycleButton.onOffBuilder(config.cameraShake)
			.create(left, y, 150, 20, Component.translatable("options.julius_juukulius.camera_shake"), (button, value) -> config.cameraShake = value));
		this.addRenderableWidget(new PercentSlider(right, y, 150, 20, "options.julius_juukulius.camera_shake_intensity", config.cameraShakeIntensity, 0.0,
			1.0, value -> config.cameraShakeIntensity = value));
		y += row;
		this.addRenderableWidget(CycleButton.onOffBuilder(config.magicCircles)
			.create(left, y, 150, 20, Component.translatable("options.julius_juukulius.magic_circles"), (button, value) -> config.magicCircles = value));
		this.addRenderableWidget(CycleButton.onOffBuilder(config.showHud)
			.create(right, y, 150, 20, Component.translatable("options.julius_juukulius.hud"), (button, value) -> config.showHud = value));
		y += row;
		this.addRenderableWidget(CycleButton.builder((JuliusClientConfig.HudAnchor anchor) ->
				Component.translatable("options.julius_juukulius.hud_anchor." + anchor.name().toLowerCase(java.util.Locale.ROOT)), config.hudAnchor)
			.withValues(List.of(JuliusClientConfig.HudAnchor.values()))
			.create(left, y, 150, 20, Component.translatable("options.julius_juukulius.hud_anchor"), (button, value) -> config.hudAnchor = value));
		this.addRenderableWidget(new PercentSlider(right, y, 150, 20, "options.julius_juukulius.hud_scale", config.hudScale, 0.5, 2.0,
			value -> config.hudScale = value));
		y += row * 2;
		this.addRenderableWidget(Button.builder(CommonComponents.GUI_DONE, button -> this.onClose()).bounds(this.width / 2 - 100, y, 200, 20).build());
	}

	@Override
	public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
		super.render(graphics, mouseX, mouseY, partialTick);
		graphics.drawCenteredString(this.font, this.title, this.width / 2, 20, 0xFFFFFFFF);
		graphics.drawCenteredString(this.font, Component.translatable("options.julius_juukulius.subtitle"), this.width / 2, 34, 0xFFB9A3E3);
	}

	@Override
	public void onClose() {
		JuliusClientConfig.save();
		JuliusClientConfig.get().apply();
		if (this.minecraft != null) {
			this.minecraft.setScreen(this.parent);
		}
	}

	private static final class PercentSlider extends AbstractSliderButton {
		private final String key;
		private final double min;
		private final double max;
		private final java.util.function.DoubleConsumer setter;

		PercentSlider(int x, int y, int width, int height, String key, double current, double min, double max, java.util.function.DoubleConsumer setter) {
			super(x, y, width, height, Component.empty(), (current - min) / (max - min));
			this.key = key;
			this.min = min;
			this.max = max;
			this.setter = setter;
			this.updateMessage();
		}

		private double actual() {
			return this.min + this.value * (this.max - this.min);
		}

		@Override
		protected void updateMessage() {
			this.setMessage(Component.translatable(this.key, Math.round(this.actual() * 100.0) + "%"));
		}

		@Override
		protected void applyValue() {
			this.setter.accept(this.actual());
		}
	}
}
