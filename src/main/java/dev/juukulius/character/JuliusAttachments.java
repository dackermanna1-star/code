package dev.juukulius.character;

import dev.juukulius.JuliusMod;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.world.entity.player.Player;

/**
 * Data attachments on players.
 * <ul>
 *     <li>{@link #DATA}: persistent authoritative state, server only (copied manually on respawn).</li>
 *     <li>{@link #APPEARANCE}: synced to every tracking client, drives all rendering.</li>
 *     <li>{@link #STATS}: synced to the owner only, drives the HUD and input prediction.</li>
 * </ul>
 */
public final class JuliusAttachments {
	public static final AttachmentType<JuliusData> DATA = AttachmentRegistry.create(
		JuliusMod.id("data"), builder -> builder.persistent(JuliusData.CODEC).initializer(JuliusData::new)
	);
	public static final AttachmentType<JuliusAppearance> APPEARANCE = AttachmentRegistry.create(
		JuliusMod.id("appearance"), builder -> builder.syncWith(JuliusAppearance.STREAM_CODEC, AttachmentSyncPredicate.all())
	);
	public static final AttachmentType<JuliusStats> STATS = AttachmentRegistry.create(
		JuliusMod.id("stats"), builder -> builder.syncWith(JuliusStats.STREAM_CODEC, AttachmentSyncPredicate.targetOnly())
	);

	private JuliusAttachments() {
	}

	public static void init() {
		// Static initialisation registers the types.
	}

	public static JuliusData data(Player player) {
		return player.getAttachedOrCreate(DATA);
	}

	public static JuliusAppearance appearance(Player player) {
		JuliusAppearance appearance = player.getAttached(APPEARANCE);
		return appearance != null ? appearance : JuliusAppearance.NONE;
	}

	public static JuliusStats stats(Player player) {
		JuliusStats stats = player.getAttached(STATS);
		return stats != null ? stats : JuliusStats.EMPTY;
	}
}
