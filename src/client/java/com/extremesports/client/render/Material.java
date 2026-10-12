package com.extremesports.client.render;

import com.extremesports.ExtremeSports;
import net.minecraft.resources.Identifier;

/** Tileable, tintable material textures used by the equipment models. */
public enum Material {
	WOOD("wood"),
	GRIP("grip"),
	METAL("metal"),
	RUBBER("rubber"),
	PLASTIC("plastic"),
	FABRIC("fabric"),
	CHROME("chrome");

	public final Identifier texture;

	Material(String name) {
		this.texture = ExtremeSports.id("textures/entity/material/" + name + ".png");
	}
}
