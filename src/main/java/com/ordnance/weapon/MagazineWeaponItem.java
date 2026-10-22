package com.ordnance.weapon;

import com.ordnance.ClientBridge;
import com.ordnance.registry.ModComponents;
import com.ordnance.registry.ModSounds;
import java.util.function.Consumer;
import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.consume.UseAction;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.stat.Stats;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.world.World;

/**
 * Base for weapons that fire rounds from a magazine.
 *
 * <ul>
 * <li>Use with rounds loaded: fire the next round (server spawns the projectile; the shooter's client predicts
 * recoil and muzzle flash).</li>
 * <li>Use while empty, or sneak-use with room in the magazine: hold to reload, one round per
 * {@link #reloadTicksPerRound()} while held.</li>
 * <li>Use while empty without ammo: dry-fire click.</li>
 * </ul>
 *
 * <p>New launchers subclass this and implement {@link #fire}; their rounds are {@link AmmoItem}s of the matching
 * {@link AmmoCategory}.
 */
public abstract class MagazineWeaponItem extends Item {
	protected MagazineWeaponItem(Settings settings) {
		super(settings.maxCount(1).component(ModComponents.MAGAZINE, MagazineComponent.EMPTY));
	}

	public abstract AmmoCategory ammoCategory();

	public abstract int magazineSize();

	public abstract int reloadTicksPerRound();

	protected abstract int cooldownTicks();

	protected abstract SoundEvent fireSound();

	protected abstract SoundEvent reloadSound();

	protected SoundEvent reloadDoneSound() {
		return this.reloadSound();
	}

	/** Server side: launch the round. The magazine has already been decremented. */
	protected abstract void fire(ServerWorld world, PlayerEntity player, ItemStack weapon, AmmoItem round);

	public static MagazineComponent magazine(ItemStack stack) {
		return stack.getOrDefault(ModComponents.MAGAZINE, MagazineComponent.EMPTY);
	}

	public boolean canReload(PlayerEntity player, ItemStack stack) {
		return magazine(stack).size() < this.magazineSize() && WeaponHelper.hasAmmo(player, this.ammoCategory());
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		MagazineComponent magazine = magazine(stack);
		boolean canReload = this.canReload(user, stack);
		if (canReload && (magazine.isEmpty() || user.isSneaking())) {
			user.setCurrentHand(hand);
			return ActionResult.CONSUME;
		}

		if (magazine.isEmpty()) {
			world.playSound(user, user.getX(), user.getY(), user.getZ(), ModSounds.WEAPON_DRY_FIRE, SoundCategory.PLAYERS, 0.8F, 1.3F);
			return ActionResult.FAIL;
		}

		if (user.getItemCooldownManager().isCoolingDown(stack)) {
			return ActionResult.FAIL;
		}

		world.playSound(user, user.getX(), user.getY(), user.getZ(), this.fireSound(), SoundCategory.PLAYERS, 1.0F, 0.95F + world.getRandom().nextFloat() * 0.1F);
		if (world instanceof ServerWorld serverWorld) {
			RegistryEntry<Item> next = magazine.next();
			stack.set(ModComponents.MAGAZINE, magazine.withoutNext());
			if (next.value() instanceof AmmoItem round) {
				this.fire(serverWorld, user, stack, round);
			}

			user.incrementStat(Stats.USED.getOrCreateStat(this));
		} else {
			ClientBridge.get().weaponFired(user, stack);
		}

		user.getItemCooldownManager().set(stack, this.cooldownTicks());
		return ActionResult.CONSUME;
	}

	@Override
	public void usageTick(World world, LivingEntity user, ItemStack stack, int remainingUseTicks) {
		if (world.isClient() || !(user instanceof PlayerEntity player)) {
			return;
		}

		MagazineComponent magazine = magazine(stack);
		if (magazine.size() >= this.magazineSize()) {
			return;
		}

		int used = this.getMaxUseTime(stack, user) - remainingUseTicks;
		int perRound = this.reloadTicksPerRound();
		if (used % perRound == perRound / 2) {
			world.playSound(null, user.getX(), user.getY(), user.getZ(), this.reloadSound(), SoundCategory.PLAYERS, 0.7F, 0.9F);
		}

		if (used > 0 && used % perRound == 0) {
			AmmoItem round = WeaponHelper.takeAmmo(player, this.ammoCategory());
			if (round == null) {
				return;
			}

			MagazineComponent loaded = magazine.withLoaded(round.getRegistryEntry());
			stack.set(ModComponents.MAGAZINE, loaded);
			boolean full = loaded.size() >= this.magazineSize();
			world.playSound(null, user.getX(), user.getY(), user.getZ(), full ? this.reloadDoneSound() : this.reloadSound(), SoundCategory.PLAYERS, 0.9F, full ? 1.0F : 1.15F);
		}
	}

	/** Reload progress of the round currently being inserted, 0..1, for HUD and animations. */
	public float reloadProgress(ItemStack stack, LivingEntity user) {
		if (!user.isUsingItem() || user.getActiveItem() != stack && !ItemStack.areItemsEqual(user.getActiveItem(), stack)) {
			return 0.0F;
		}

		int used = user.getItemUseTime();
		int perRound = this.reloadTicksPerRound();
		return (used % perRound) / (float)perRound;
	}

	@Override
	public int getMaxUseTime(ItemStack stack, LivingEntity user) {
		return 72000;
	}

	@Override
	public UseAction getUseAction(ItemStack stack) {
		return UseAction.CROSSBOW;
	}

	@Override
	public boolean allowComponentsUpdateAnimation(PlayerEntity player, Hand hand, ItemStack oldStack, ItemStack newStack) {
		return false;
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		MagazineComponent magazine = magazine(stack);
		textConsumer.accept(Text.translatable("tooltip.ordnance.loaded", magazine.size(), this.magazineSize()).formatted(Formatting.GRAY));
		for (RegistryEntry<Item> round : magazine.rounds()) {
			textConsumer.accept(Text.literal(" • ").append(round.value().getName()).formatted(Formatting.DARK_GRAY));
		}

		textConsumer.accept(Text.translatable("tooltip.ordnance.reload_hint").formatted(Formatting.DARK_GRAY));
	}
}
