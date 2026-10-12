package com.extremesports.client.screen;

import java.util.function.DoubleConsumer;
import java.util.function.DoubleFunction;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.network.chat.Component;

/** Slider over [min, max] that reports changes immediately. */
public class ValueSlider extends AbstractSliderButton {
	private final double min;
	private final double max;
	private final DoubleFunction<Component> label;
	private final DoubleConsumer onChange;

	public ValueSlider(int x, int y, int width, int height, double min, double max, double current,
					   DoubleFunction<Component> label, DoubleConsumer onChange) {
		super(x, y, width, height, Component.empty(), (current - min) / (max - min));
		this.min = min;
		this.max = max;
		this.label = label;
		this.onChange = onChange;
		updateMessage();
	}

	private double actual() {
		return min + (max - min) * value;
	}

	@Override
	protected void updateMessage() {
		setMessage(label.apply(actual()));
	}

	@Override
	protected void applyValue() {
		onChange.accept(actual());
	}
}
