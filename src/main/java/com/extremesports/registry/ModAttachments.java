package com.extremesports.registry;

import com.extremesports.ExtremeSports;
import com.extremesports.server.PlayerSportData;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;

public final class ModAttachments {
	public static final AttachmentType<PlayerSportData> SPORT_DATA = AttachmentRegistry.create(
		ExtremeSports.id("sport_data"),
		builder -> builder
			.initializer(PlayerSportData::new)
			.persistent(PlayerSportData.CODEC)
			.copyOnDeath()
			.syncWith(PlayerSportData.STREAM_CODEC, AttachmentSyncPredicate.targetOnly())
	);

	private ModAttachments() {
	}

	public static void init() {
	}
}
