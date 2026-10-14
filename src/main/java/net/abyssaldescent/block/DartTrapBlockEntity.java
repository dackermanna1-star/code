package net.abyssaldescent.block;

import net.abyssaldescent.config.AdConfig;
import net.abyssaldescent.registry.ModBlockEntities;
import net.abyssaldescent.registry.ModSounds;
import net.abyssaldescent.util.Seeds;
import net.abyssaldescent.world.DungeonDimension;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.arrow.Arrow;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

/**
 * Fires on a fixed cadence (offset per trap so pairs alternate) whenever a player is within range. Each shot is preceded
 * by a click and a puff of dust from the mouth so the rhythm can be read and timed.
 */
public class DartTrapBlockEntity extends BlockEntity {
	private static final int PERIOD = 44;
	private static final int WINDUP = 12;
	private static final double RANGE = 9.0;

	public DartTrapBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.DART_TRAP, pos, state);
	}

	public static void serverTick(Level level, BlockPos pos, BlockState state, DartTrapBlockEntity trap) {
		if (!(level instanceof ServerLevel serverLevel)) {
			return;
		}
		int phase = Seeds.hashInt(0xDA27L, pos.getX(), pos.getY(), pos.getZ(), 2) * (PERIOD / 2);
		long t = (level.getGameTime() + phase) % PERIOD;
		if (t != 0 && t != WINDUP) {
			return;
		}
		AABB area = new AABB(pos).inflate(RANGE);
		boolean playerNear = !serverLevel.getEntitiesOfClass(Player.class, area, p -> !p.isSpectator() && !p.isCreative()).isEmpty();
		if (!playerNear) {
			return;
		}
		Direction facing = state.getValue(DartTrapBlock.FACING);
		double mx = pos.getX() + 0.5 + facing.getStepX() * 0.6;
		double my = pos.getY() + 0.45;
		double mz = pos.getZ() + 0.5 + facing.getStepZ() * 0.6;
		if (t == 0) {
			// Telegraph.
			serverLevel.playSound(null, pos, ModSounds.TRAP_CLICK, SoundSource.BLOCKS, 0.8F, 1.5F);
			serverLevel.sendParticles(ParticleTypes.SMOKE, mx, my, mz, 5, 0.05, 0.05, 0.05, 0.01);
			return;
		}
		int floor = Math.max(1, DungeonDimension.floorAt(level, pos));
		Arrow dart = new Arrow(serverLevel, mx, my, mz, new ItemStack(Items.ARROW), null);
		dart.pickup = AbstractArrow.Pickup.DISALLOWED;
		dart.setBaseDamage((1.6 + 0.12 * floor) * AdConfig.get().difficulty.damageMultiplier);
		if (floor >= 3) {
			dart.addEffect(new MobEffectInstance(MobEffects.POISON, 60, 0));
		}
		dart.shoot(facing.getStepX(), 0.02, facing.getStepZ(), 1.7F, 0.5F);
		serverLevel.addFreshEntity(dart);
		serverLevel.playSound(null, pos, ModSounds.DART_FIRE, SoundSource.BLOCKS, 1.0F, 1.1F + serverLevel.random.nextFloat() * 0.2F);
	}
}
