package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.entity.LauncherGrenadeEntity;
import com.ordnance.network.OrdnanceNetworking;
import com.ordnance.registry.ModComponents;
import com.ordnance.registry.ModSounds;
import java.util.function.Consumer;
import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.ItemStack;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/**
 * Six-shot revolving 40 mm grenade launcher. Rounds follow a ballistic arc; the selectable fire mode chooses
 * impact or timed detonation for every round fired.
 */
public class GrenadeLauncherItem extends MagazineWeaponItem {
	public GrenadeLauncherItem(Settings settings) {
		super(settings.component(ModComponents.FIRE_MODE, FireMode.IMPACT));
	}

	@Override
	public AmmoCategory ammoCategory() {
		return AmmoCategory.GRENADE_40MM;
	}

	@Override
	public int magazineSize() {
		return ConfigManager.get().weapons.grenadeLauncher.magazineSize;
	}

	@Override
	public int reloadTicksPerRound() {
		return ConfigManager.get().weapons.grenadeLauncher.reloadTicksPerRound;
	}

	@Override
	protected int cooldownTicks() {
		return ConfigManager.get().weapons.grenadeLauncher.cooldownTicks;
	}

	@Override
	protected SoundEvent fireSound() {
		return ModSounds.GL_FIRE;
	}

	@Override
	protected SoundEvent reloadSound() {
		return ModSounds.GL_RELOAD;
	}

	public static FireMode fireMode(ItemStack stack) {
		return stack.getOrDefault(ModComponents.FIRE_MODE, FireMode.IMPACT);
	}

	@Override
	protected void fire(ServerWorld world, PlayerEntity player, ItemStack weapon, AmmoItem round) {
		OrdnanceConfig.GrenadeLauncher cfg = ConfigManager.get().weapons.grenadeLauncher;
		LauncherGrenadeEntity grenade = new LauncherGrenadeEntity(world, player, new ItemStack(round), fireMode(weapon));
		grenade.setPosition(WeaponHelper.muzzle(player, 0.7, 0.15, 0.15));
		grenade.setVelocity(player, player.getPitch(), player.getYaw(), 0.0F, cfg.muzzleVelocity, 0.6F);
		world.spawnEntity(grenade);
		OrdnanceNetworking.sendMuzzleFlash(player, OrdnanceNetworking.MuzzleFlash.Kind.GRENADE_LAUNCHER);
	}

	/** Handles the fire-mode key: cycles the mode of the launcher in the player's main hand. */
	public static void cycleFireMode(ServerPlayerEntity player) {
		ItemStack stack = player.getMainHandStack();
		if (!(stack.getItem() instanceof GrenadeLauncherItem)) {
			return;
		}

		FireMode mode = fireMode(stack).next();
		stack.set(ModComponents.FIRE_MODE, mode);
		player.getEntityWorld().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GL_MODE, SoundCategory.PLAYERS, 0.8F, 1.0F);
		player.sendMessage(Text.translatable("message.ordnance.fire_mode", Text.translatable(mode.translationKey())).formatted(Formatting.GOLD), true);
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable("tooltip.ordnance.fire_mode", Text.translatable(fireMode(stack).translationKey())).formatted(Formatting.GOLD));
		super.appendTooltip(stack, context, displayComponent, textConsumer, type);
		textConsumer.accept(Text.translatable("tooltip.ordnance.fire_mode_hint").formatted(Formatting.DARK_GRAY));
	}
}
