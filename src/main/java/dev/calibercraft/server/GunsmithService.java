package dev.calibercraft.server;

import dev.calibercraft.config.ServerConfig;
import dev.calibercraft.core.GunState;
import dev.calibercraft.core.Stat;
import dev.calibercraft.data.AttachmentDefinition;
import dev.calibercraft.data.AttachmentSlot;
import dev.calibercraft.data.CaliberData;
import dev.calibercraft.data.CaliberDataHolder;
import dev.calibercraft.data.SkinDefinition;
import dev.calibercraft.data.WeaponDefinition;
import dev.calibercraft.item.AttachmentLoadout;
import dev.calibercraft.item.WeaponStacks;
import dev.calibercraft.network.GunFeedbackPayload;
import dev.calibercraft.network.GunsmithPayload;
import dev.calibercraft.network.OpenGunsmithPayload;
import dev.calibercraft.registry.ModBlocks;
import dev.calibercraft.registry.ModComponents;
import dev.calibercraft.registry.ModItems;
import dev.calibercraft.registry.ModSounds;
import java.util.Optional;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * Validates and applies customization requests. Attachments are physical items: installing consumes one
 * from the inventory (free in creative), removing gives it back, so no request can duplicate items.
 */
public final class GunsmithService {
	public static final int OK = 0;
	public static final int MISSING_ITEM = 1;
	public static final int INCOMPATIBLE = 2;
	public static final int NEEDS_BENCH = 3;
	public static final int NEEDS_KIT = 4;
	public static final int NO_WEAPON = 5;
	public static final int BUSY = 6;

	private GunsmithService() {
	}

	public static void openBench(ServerPlayer player, BlockPos pos) {
		GunService.data(player).benchPos = pos.immutable();
		player.level().playSound(null, pos, ModSounds.GUNSMITH_OPEN, SoundSource.BLOCKS, 0.7f, 1.0f);
		ServerPlayNetworking.send(player, new OpenGunsmithPayload(true));
	}

	static boolean atBench(ServerPlayer player) {
		BlockPos pos = GunService.data(player).benchPos;
		return pos != null && player.level().getBlockState(pos).is(ModBlocks.GUNSMITH_BENCH)
			&& player.position().distanceToSqr(pos.getCenter()) < 8 * 8;
	}

	static boolean slotAccessible(ServerPlayer player, AttachmentSlot slot) {
		if (atBench(player)) {
			return true;
		}
		return switch (ServerConfig.get().fieldCustomization) {
			case "all" -> true;
			case "none" -> false;
			default -> slot.quickDetach;
		};
	}

	static boolean skinAccessible(ServerPlayer player) {
		return atBench(player) || "all".equals(ServerConfig.get().fieldCustomization);
	}

	public static void handle(GunsmithPayload p, ServerPlayer player) {
		int result = apply(p, player);
		if (p.op() != GunsmithPayload.Op.CLOSE) {
			ServerPlayNetworking.send(player, new GunFeedbackPayload(GunFeedbackPayload.Kind.GUNSMITH_RESULT, result));
		}
	}

	/** Applies a request and returns a result code (also used directly by game tests). */
	public static int apply(GunsmithPayload p, ServerPlayer player) {
		if (p.op() == GunsmithPayload.Op.CLOSE) {
			GunService.data(player).benchPos = null;
			return OK;
		}
		ItemStack stack = player.getMainHandItem();
		CaliberData data = CaliberDataHolder.server();
		Optional<WeaponDefinition> od = WeaponStacks.definition(stack, data);
		if (od.isEmpty()) {
			return NO_WEAPON;
		}
		if (GunService.busy(player)) {
			return BUSY;
		}
		WeaponDefinition def = od.get();
		WeaponStacks.ensureInitialized(stack, data);
		return switch (p.op()) {
			case INSTALL -> install(player, stack, def, data, p.slot(), p.target().orElse(null));
			case REMOVE -> remove(player, stack, def, data, p.slot());
			case SKIN -> skin(player, stack, def, data, p.target().orElse(WeaponStacks.STANDARD_SKIN));
			case RESET -> reset(player, stack, def, data);
			case CLOSE -> OK;
		};
	}

	private static Item itemFor(CaliberData data, Identifier attachment) {
		return data.attachment(attachment).map(a -> BuiltInRegistries.ITEM.getValue(a.item())).orElse(null);
	}

	private static int install(ServerPlayer player, ItemStack stack, WeaponDefinition def, CaliberData data, AttachmentSlot slot,
			Identifier attachment) {
		if (attachment == null || !def.allows(slot, attachment)) {
			return INCOMPATIBLE;
		}
		Optional<AttachmentDefinition> ad = data.attachment(attachment);
		if (ad.isEmpty() || ad.get().slot() != slot) {
			return INCOMPATIBLE;
		}
		if (!slotAccessible(player, slot)) {
			return NEEDS_BENCH;
		}
		AttachmentLoadout loadout = WeaponStacks.loadout(stack);
		if (loadout.get(slot).filter(attachment::equals).isPresent()) {
			return OK;
		}
		Item item = itemFor(data, attachment);
		if (item == null) {
			return INCOMPATIBLE;
		}
		if (!player.isCreative()) {
			if (AmmoInventory.countRaw(player, item) < 1) {
				return MISSING_ITEM;
			}
			takeExact(player, item);
		}
		loadout.get(slot).ifPresent(old -> giveAttachment(player, data, old));
		stack.set(ModComponents.ATTACHMENTS, loadout.with(slot, attachment));
		afterLoadoutChange(player, stack, def, data);
		player.level().playSound(null, player.blockPosition(), ModSounds.ATTACHMENT_INSTALL, SoundSource.PLAYERS, 0.8f, 1.0f);
		return OK;
	}

	private static int remove(ServerPlayer player, ItemStack stack, WeaponDefinition def, CaliberData data, AttachmentSlot slot) {
		AttachmentLoadout loadout = WeaponStacks.loadout(stack);
		Optional<Identifier> current = loadout.get(slot);
		if (current.isEmpty()) {
			return OK;
		}
		if (!slotAccessible(player, slot)) {
			return NEEDS_BENCH;
		}
		giveAttachment(player, data, current.get());
		stack.set(ModComponents.ATTACHMENTS, loadout.without(slot));
		afterLoadoutChange(player, stack, def, data);
		player.level().playSound(null, player.blockPosition(), ModSounds.ATTACHMENT_REMOVE, SoundSource.PLAYERS, 0.8f, 1.0f);
		return OK;
	}

	private static int skin(ServerPlayer player, ItemStack stack, WeaponDefinition def, CaliberData data, Identifier skin) {
		SkinDefinition sd = data.skins().get(skin);
		if (sd == null || !def.allowsSkin(skin)) {
			return INCOMPATIBLE;
		}
		if (!skinAccessible(player)) {
			return NEEDS_BENCH;
		}
		if (skin.equals(WeaponStacks.skin(stack))) {
			return OK;
		}
		if (sd.requiresKit() && ServerConfig.get().rareSkinsRequireKit && !player.isCreative()) {
			if (AmmoInventory.countRaw(player, ModItems.PRISMATIC_FINISH_KIT) < 1) {
				return NEEDS_KIT;
			}
			takeExact(player, ModItems.PRISMATIC_FINISH_KIT);
		}
		stack.set(ModComponents.SKIN, skin);
		WeaponStacks.refreshAppearance(stack);
		player.level().playSound(null, player.blockPosition(), ModSounds.SKIN_APPLY, SoundSource.PLAYERS, 0.8f, 1.0f);
		return OK;
	}

	/**
	 * Restores the factory configuration: non-default attachments are returned, default attachments are
	 * re-installed only if the player can supply them (never created from nothing), the finish becomes standard.
	 */
	private static int reset(ServerPlayer player, ItemStack stack, WeaponDefinition def, CaliberData data) {
		AttachmentLoadout loadout = WeaponStacks.loadout(stack);
		AttachmentLoadout result = loadout;
		for (AttachmentSlot slot : AttachmentSlot.values()) {
			if (!slotAccessible(player, slot)) {
				continue;
			}
			Optional<Identifier> current = loadout.get(slot);
			Identifier wanted = def.defaultAttachments().get(slot);
			if (current.isPresent() && current.get().equals(wanted)) {
				continue;
			}
			if (current.isPresent()) {
				giveAttachment(player, data, current.get());
				result = result.without(slot);
			}
			if (wanted != null) {
				Item item = itemFor(data, wanted);
				if (item != null && (player.isCreative() || AmmoInventory.countRaw(player, item) > 0)) {
					if (!player.isCreative()) {
						takeExact(player, item);
					}
					result = result.with(slot, wanted);
				}
			}
		}
		stack.set(ModComponents.ATTACHMENTS, result);
		if (skinAccessible(player)) {
			stack.set(ModComponents.SKIN, WeaponStacks.STANDARD_SKIN);
		}
		afterLoadoutChange(player, stack, def, data);
		player.level().playSound(null, player.blockPosition(), ModSounds.ATTACHMENT_REMOVE, SoundSource.PLAYERS, 0.8f, 0.9f);
		return OK;
	}

	/** Keeps the magazine within the (possibly smaller) new capacity and refreshes visuals. */
	private static void afterLoadoutChange(ServerPlayer player, ItemStack stack, WeaponDefinition def, CaliberData data) {
		GunState s = WeaponStacks.state(stack);
		int cap = WeaponStacks.stats(def, WeaponStacks.loadout(stack), WeaponStacks.activeAmmo(s, def, data), data).i(Stat.MAGAZINE);
		if (s.rounds() > cap) {
			int excess = s.rounds() - cap;
			s.loadedAmmo().flatMap(id -> Optional.ofNullable(data.ammo().get(id)))
				.ifPresent(a -> AmmoInventory.give(player, BuiltInRegistries.ITEM.getValue(a.item()), excess));
			stack.set(ModComponents.GUN_STATE, s.withRounds(cap));
		}
		WeaponStacks.refreshAppearance(stack);
	}

	private static void giveAttachment(ServerPlayer player, CaliberData data, Identifier attachment) {
		if (player.isCreative()) {
			return;
		}
		Item item = itemFor(data, attachment);
		if (item != null) {
			ItemStack s = new ItemStack(item);
			if (!player.getInventory().add(s)) {
				player.drop(s, false);
			}
		}
	}

	private static void takeExact(ServerPlayer player, Item item) {
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack s = inv.getItem(i);
			if (s.is(item)) {
				s.shrink(1);
				inv.setChanged();
				return;
			}
		}
	}
}
