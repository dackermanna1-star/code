package dev.calibercraft.item;

import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;

/** Loose ammunition; the matching definition is {@link #ammoId()}. Reserve ammunition = these in the inventory. */
public class AmmoItem extends Item {
	private final Identifier ammoId;

	public AmmoItem(Properties properties, Identifier ammoId) {
		super(properties);
		this.ammoId = ammoId;
	}

	public Identifier ammoId() {
		return ammoId;
	}
}
