package com.ordnance.weapon;

import com.ordnance.config.ConfigManager;
import com.ordnance.config.OrdnanceConfig;
import com.ordnance.registry.ModComponents;
import com.ordnance.registry.ModItems;
import com.ordnance.registry.ModSounds;
import java.util.function.Consumer;
import net.minecraft.component.type.TooltipDisplayComponent;
import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.consume.UseAction;
import net.minecraft.item.tooltip.TooltipType;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.sound.SoundCategory;
import net.minecraft.text.Text;
import net.minecraft.util.ActionResult;
import net.minecraft.util.Formatting;
import net.minecraft.util.Hand;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;

/**
 * Hold use to project a stream of burning fuel; it arcs under gravity, splashes on surfaces, sets fire to what it
 * touches and leaves burning puddles. Sneak and hold to refuel from Fuel Canisters.
 */
public class FlamethrowerItem extends Item {
	public FlamethrowerItem(Settings settings) {
		super(settings.maxCount(1).component(ModComponents.FUEL, 0));
	}

	public static int fuel(ItemStack stack) {
		return stack.getOrDefault(ModComponents.FUEL, 0);
	}

	public static int maxFuel() {
		return ConfigManager.get().weapons.flamethrower.maxFuel;
	}

	/** Whether the holder is currently projecting flame (used by clients for visuals and sound). */
	public static boolean isFiring(LivingEntity user, ItemStack stack) {
		return user.isUsingItem() && user.getActiveItem().getItem() instanceof FlamethrowerItem && !user.isSneaking() && fuel(stack) > 0;
	}

	@Override
	public ActionResult use(World world, PlayerEntity user, Hand hand) {
		ItemStack stack = user.getStackInHand(hand);
		int fuel = fuel(stack);
		if (user.isSneaking()) {
			if (fuel < maxFuel() && (user.isInCreativeMode() || WeaponHelper.count(user, ModItems.FUEL_CANISTER) > 0)) {
				user.setCurrentHand(hand);
				return ActionResult.CONSUME;
			}

			return ActionResult.FAIL;
		}

		if (fuel <= 0) {
			world.playSound(user, user.getX(), user.getY(), user.getZ(), ModSounds.WEAPON_DRY_FIRE, SoundCategory.PLAYERS, 0.8F, 0.8F);
			return ActionResult.FAIL;
		}

		world.playSound(user, user.getX(), user.getY(), user.getZ(), ModSounds.FLAMETHROWER_IGNITE, SoundCategory.PLAYERS, 0.9F, 1.0F);
		user.setCurrentHand(hand);
		return ActionResult.CONSUME;
	}

	@Override
	public void usageTick(World world, LivingEntity user, ItemStack stack, int remainingUseTicks) {
		if (world.isClient() || !(user instanceof PlayerEntity player)) {
			return;
		}

		OrdnanceConfig.Flamethrower cfg = ConfigManager.get().weapons.flamethrower;
		int used = this.getMaxUseTime(stack, user) - remainingUseTicks;
		if (player.isSneaking()) {
			if (used > 0 && used % cfg.refuelTicks == 0 && fuel(stack) < cfg.maxFuel && WeaponHelper.consume(player, ModItems.FUEL_CANISTER)) {
				stack.set(ModComponents.FUEL, Math.min(cfg.maxFuel, fuel(stack) + cfg.fuelPerCanister));
				world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.FLAMETHROWER_REFUEL, SoundCategory.PLAYERS, 0.9F, 1.0F);
			}

			return;
		}

		int fuel = fuel(stack);
		if (fuel <= 0) {
			return;
		}

		if (!player.isInCreativeMode()) {
			stack.set(ModComponents.FUEL, fuel - 1);
			if (fuel - 1 == 0) {
				world.playSound(null, user.getX(), user.getY(), user.getZ(), ModSounds.FLAMETHROWER_STOP, SoundCategory.PLAYERS, 0.9F, 1.0F);
			}
		}

		ServerWorld serverWorld = (ServerWorld)world;
		Vec3d look = user.getRotationVec(1.0F);
		Vec3d nozzle = WeaponHelper.muzzle(user, 0.9, 0.22, 0.2);
		for (int i = 0; i < 2; i++) {
			Vec3d spread = new Vec3d(user.getRandom().nextGaussian(), user.getRandom().nextGaussian(), user.getRandom().nextGaussian()).multiply(0.035);
			Vec3d velocity = look.add(spread).normalize().multiply(0.95 * cfg.range).add(user.getMovement());
			FlameStreamManager.spawnGlob(serverWorld, nozzle.add(look.multiply(i * 0.4)), velocity, user, false);
		}
	}

	@Override
	public int getMaxUseTime(ItemStack stack, LivingEntity user) {
		return 72000;
	}

	@Override
	public UseAction getUseAction(ItemStack stack) {
		return UseAction.NONE;
	}

	@Override
	public boolean allowComponentsUpdateAnimation(PlayerEntity player, Hand hand, ItemStack oldStack, ItemStack newStack) {
		return false;
	}

	@Override
	public boolean isItemBarVisible(ItemStack stack) {
		return true;
	}

	@Override
	public int getItemBarStep(ItemStack stack) {
		return MathHelper.clamp(Math.round(13.0F * fuel(stack) / maxFuel()), 0, 13);
	}

	@Override
	public int getItemBarColor(ItemStack stack) {
		float f = fuel(stack) / (float)maxFuel();
		return MathHelper.hsvToRgb(0.02F + f * 0.1F, 0.9F, 1.0F);
	}

	@Override
	public void appendTooltip(ItemStack stack, TooltipContext context, TooltipDisplayComponent displayComponent, Consumer<Text> textConsumer, TooltipType type) {
		textConsumer.accept(Text.translatable("tooltip.ordnance.fuel", fuel(stack), maxFuel()).formatted(Formatting.GOLD));
		textConsumer.accept(Text.translatable("tooltip.ordnance.refuel_hint").formatted(Formatting.DARK_GRAY));
	}
}
