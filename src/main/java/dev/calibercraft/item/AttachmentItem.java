package dev.calibercraft.item;

import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Item;

/** Inventory form of an attachment; its stats live in the attachment definition {@link #attachmentId()}. */
public class AttachmentItem extends Item {
	private final Identifier attachmentId;

	public AttachmentItem(Properties properties, Identifier attachmentId) {
		super(properties);
		this.attachmentId = attachmentId;
	}

	public Identifier attachmentId() {
		return attachmentId;
	}
}
