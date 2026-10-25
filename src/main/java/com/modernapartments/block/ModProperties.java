package com.modernapartments.block;

import net.minecraft.util.StringRepresentable;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.block.state.properties.IntegerProperty;

/** Block state properties shared by the furniture blocks. */
public final class ModProperties {
	/** Appliances, screens and fixtures that can be switched on (lights use the vanilla {@code lit}). */
	public static final BooleanProperty ON = BooleanProperty.create("on");
	public static final EnumProperty<SofaShape> SOFA_SHAPE = EnumProperty.create("shape", SofaShape.class);
	/** Tabletop items: how many pixels the model is lowered to rest on a furniture top below 16px. */
	public static final IntegerProperty DROP = IntegerProperty.create("drop", 0, 12);

	private ModProperties() {
	}

	public enum SofaShape implements StringRepresentable {
		SINGLE("single"),
		LEFT("left"),
		MIDDLE("middle"),
		RIGHT("right"),
		CORNER_LEFT("corner_left"),
		CORNER_RIGHT("corner_right");

		private final String name;

		SofaShape(String name) {
			this.name = name;
		}

		@Override
		public String getSerializedName() {
			return name;
		}

		public SofaShape mirrored() {
			return switch (this) {
				case LEFT -> RIGHT;
				case RIGHT -> LEFT;
				case CORNER_LEFT -> CORNER_RIGHT;
				case CORNER_RIGHT -> CORNER_LEFT;
				default -> this;
			};
		}
	}
}
