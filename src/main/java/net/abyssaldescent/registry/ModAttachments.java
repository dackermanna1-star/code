package net.abyssaldescent.registry;

import net.abyssaldescent.AbyssalDescent;
import net.abyssaldescent.dungeon.run.PlayerProgress;
import net.abyssaldescent.dungeon.run.RunHud;
import net.abyssaldescent.entity.MobInfo;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentSyncPredicate;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.resources.Identifier;

public final class ModAttachments {
	/** Permanent progression (checkpoints, statistics, return point). */
	public static final AttachmentType<PlayerProgress> PROGRESS = AttachmentRegistry.create(AbyssalDescent.id("progress"),
		builder -> builder.persistent(PlayerProgress.CODEC).copyOnDeath().initializer(() -> PlayerProgress.DEFAULT));
	/** HUD snapshot, synced to the owning client only. */
	public static final AttachmentType<RunHud> HUD = AttachmentRegistry.create(AbyssalDescent.id("hud"),
		builder -> builder.initializer(() -> RunHud.NONE).syncWith(RunHud.STREAM_CODEC.cast(), AttachmentSyncPredicate.targetOnly()));
	/** Dungeon bookkeeping on spawned enemies (run, room, floor, elite affix). */
	public static final AttachmentType<MobInfo> MOB_INFO = AttachmentRegistry.create(AbyssalDescent.id("mob_info"),
		builder -> builder.persistent(MobInfo.CODEC));

	/** Which dungeon weapon fired a projectile (synced so clients can draw its trail). */
	public static final AttachmentType<Identifier> PROJECTILE_SOURCE = AttachmentRegistry.create(AbyssalDescent.id("projectile_source"),
		builder -> builder.persistent(Identifier.CODEC).syncWith(Identifier.STREAM_CODEC.cast(), AttachmentSyncPredicate.all()));

	private ModAttachments() {
	}

	public static void init() {
	}
}
