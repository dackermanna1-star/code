package com.jjkshowdown.registry;

import com.jjkshowdown.JjkShowdown;
import com.jjkshowdown.sorcerer.SorcererData;
import com.jjkshowdown.sorcerer.SorcererState;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;

public final class ModAttachments {
	/** Persistent: character choice, mastery, energy, fingers. Copied on player death. */
	public static final AttachmentType<SorcererData> DATA = AttachmentRegistry.create(JjkShowdown.id("sorcerer"),
			b -> b.persistent(SorcererData.CODEC).copyOnDeath().initializer(SorcererData::new));
	/** Transient runtime combat state. */
	public static final AttachmentType<SorcererState> STATE = AttachmentRegistry.create(JjkShowdown.id("sorcerer_state"),
			b -> b.initializer(SorcererState::new));

	private ModAttachments() {
	}

	public static void init() {
	}
}
