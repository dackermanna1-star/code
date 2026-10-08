package dev.portalgun.registry;

import com.mojang.serialization.Codec;
import dev.portalgun.PortalGunMod;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;

@SuppressWarnings("UnstableApiUsage")
public final class ModAttachments {
	/** Where each player last stood in each dimension before portalling out of it. */
	public static final AttachmentType<Map<Identifier, Vec3>> LAST_LOCATIONS = AttachmentRegistry.create(PortalGunMod.id("last_locations"),
		builder -> builder.persistent(Codec.unboundedMap(Identifier.CODEC, Vec3.CODEC).xmap(HashMap::new, m -> m))
			.initializer(HashMap::new)
			.copyOnDeath());
	/** Every portal-gun dimension the player has visited. */
	public static final AttachmentType<Set<Identifier>> VISITED = AttachmentRegistry.create(PortalGunMod.id("visited"),
		builder -> builder.persistent(Identifier.CODEC.listOf().xmap(HashSet::new, s -> List.copyOf(s)))
			.initializer(HashSet::new)
			.copyOnDeath());

	private ModAttachments() {
	}

	public static void init() {
	}
}
