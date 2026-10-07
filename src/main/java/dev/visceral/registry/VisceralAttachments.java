package dev.visceral.registry;

import dev.visceral.Visceral;
import dev.visceral.wound.WoundData;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;

public final class VisceralAttachments {
	/** Wounds of a living entity: saved with the entity and synced to every player tracking it. */
	public static final AttachmentType<WoundData> WOUNDS = AttachmentRegistry.create(Visceral.id("wounds"), builder -> builder
		.persistent(WoundData.CODEC)
		.syncWith(WoundData.STREAM_CODEC, AttachmentSyncPredicate.all())
	);

	private VisceralAttachments() {
	}

	public static void init() {
	}
}
