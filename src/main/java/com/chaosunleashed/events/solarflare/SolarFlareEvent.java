package com.chaosunleashed.events.solarflare;

import com.chaosunleashed.core.ChaosEvent;
import com.chaosunleashed.core.EventContext;
import com.chaosunleashed.registry.ModDamageTypes;
import com.chaosunleashed.registry.ModParticles;
import com.chaosunleashed.registry.ModSounds;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.CropBlock;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.registry.tag.BlockTags;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.sound.SoundCategory;
import net.minecraft.sound.SoundEvent;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.Heightmap;

/**
 * Solar Flare: the sky turns orange, anyone under the open sky slowly burns, all redstone sources go dark
 * (except the Chaos Control Panel) and exposed crops/grass dry out. Shade or a roof protects you
 * (glass does not!).
 */
public class SolarFlareEvent extends ChaosEvent {
	private boolean suppressing;

	public SolarFlareEvent(EventContext context) {
		super(context);
	}

	@Override
	public Text warningTitle() {
		return Text.literal("⚠ The sun is flaring!").formatted(Formatting.GOLD, Formatting.BOLD);
	}

	@Override
	public Text warningSubtitle() {
		return Text.literal("Get under a roof before the sky ignites").formatted(Formatting.YELLOW);
	}

	@Override
	protected SoundEvent warningSound() {
		return ModSounds.SOLAR_FLARE_WARNING;
	}

	@Override
	protected void tickWarning() {
		if (this.phaseTicks() % 10 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.EMBER, player.getX(), player.getY() + 10, player.getZ(),
					2 + (int) (this.phaseProgress() * 8), 10, 3, 10, 0.01);
			}
		}
		int secondsLeft = this.remainingTicks() / 20;
		if (this.remainingTicks() % 20 == 0 && secondsLeft <= 10 && secondsLeft > 0) {
			this.actionBarAll(Text.literal("☀ Solar flare in " + secondsLeft + "s — find shade!").formatted(Formatting.GOLD));
		}
	}

	@Override
	protected void onActiveStart() {
		this.actionBarAll(Text.literal("☀ SOLAR FLARE! The open sky burns — stay under a roof!").formatted(Formatting.RED, Formatting.BOLD));
		this.playSoundToAll(ModSounds.SOLAR_FLARE_WARNING, 1.0F, 0.7F);
		if (this.config().solarFlareDisablesRedstone) {
			RedstoneSuppression.begin(this.world);
			this.suppressing = true;
			this.chatAll(Text.literal("[Chaos] ").formatted(Formatting.GOLD)
				.append(Text.literal("The flare's radiation knocked out all redstone!").formatted(Formatting.YELLOW)));
		}
	}

	@Override
	protected void tickActive() {
		int interval = Math.max(10, 40 - this.intensity * 6);
		boolean burnTick = this.phaseTicks() % interval == 0;
		for (ServerPlayerEntity player : this.players()) {
			if (this.phaseTicks() % 4 == 0) {
				this.world.spawnParticles(ModParticles.EMBER, player.getX(), player.getY() + 8, player.getZ(), 3 + this.intensity, 12, 4, 12, 0.01);
			}
			if (burnTick && !player.isCreative() && isExposed(player)) {
				float damage = 0.5F + this.intensity * 0.5F;
				player.damage(this.world, ModDamageTypes.of(this.world, ModDamageTypes.SOLAR_FLARE), damage);
				player.setOnFireFor(2.0F + this.intensity);
				this.world.playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.SOLAR_FLARE_BURN, SoundCategory.PLAYERS, 0.6F, 1.0F);
				this.world.spawnParticles(ParticleTypes.SMOKE, player.getX(), player.getBodyY(0.6), player.getZ(), 6, 0.3, 0.5, 0.3, 0.02);
				player.sendMessage(Text.literal("☀ You are burning in the sunlight! Find shade!").formatted(Formatting.RED), true);
			}
		}
		this.scorchTerrain();
	}

	private boolean isExposed(ServerPlayerEntity player) {
		BlockPos eyes = BlockPos.ofFloored(player.getX(), player.getEyeY(), player.getZ());
		return this.world.isSkyVisible(eyes) && !player.isSubmergedInWater();
	}

	/** Dries out crops and grass in exposed areas around players, spread over many ticks. */
	private void scorchTerrain() {
		if (!this.config().solarFlareScorchesTerrain || !this.blockDamage()) {
			return;
		}
		if (this.blocks().pending(this) > 64) {
			return;
		}
		int radius = this.radius(24, 6);
		for (ServerPlayerEntity player : this.players()) {
			for (int i = 0; i < this.intensity; i++) {
				int x = player.getBlockX() + this.random.nextBetween(-radius, radius);
				int z = player.getBlockZ() + this.random.nextBetween(-radius, radius);
				BlockPos top = this.world.getTopPosition(Heightmap.Type.MOTION_BLOCKING, new BlockPos(x, 0, z));
				if (!this.isChunkLoaded(top) || !this.world.isSkyVisible(top)) {
					continue;
				}
				BlockPos ground = top.down();
				BlockState plant = this.world.getBlockState(top);
				BlockState soil = this.world.getBlockState(ground);
				this.blocks().enqueue(this, () -> this.scorch(top, ground, plant, soil));
			}
		}
	}

	private int scorch(BlockPos top, BlockPos ground, BlockState plant, BlockState soil) {
		if (this.world.getBlockState(top) != plant || this.world.getBlockState(ground) != soil) {
			return 1;
		}
		int changes = 0;
		if (plant.getBlock() instanceof CropBlock && this.canModify(top, plant)) {
			// Crops wither into dead bushes; the farmland bakes into coarse dirt.
			if (soil.isOf(Blocks.FARMLAND) && this.canModify(ground, soil)) {
				this.world.setBlockState(ground, Blocks.COARSE_DIRT.getDefaultState(), Block.NOTIFY_LISTENERS);
				changes++;
			}
			this.world.setBlockState(top, Blocks.DEAD_BUSH.getDefaultState(), Block.NOTIFY_ALL);
			this.world.spawnParticles(ParticleTypes.SMOKE, top.getX() + 0.5, top.getY() + 0.3, top.getZ() + 0.5, 3, 0.2, 0.1, 0.2, 0.01);
			return changes + 1;
		}
		if ((plant.isIn(BlockTags.FLOWERS) || plant.isOf(Blocks.SHORT_GRASS) || plant.isOf(Blocks.FERN) || plant.isOf(Blocks.TALL_GRASS))
			&& this.canModify(top, plant)) {
			this.world.setBlockState(top, this.random.nextInt(3) == 0 ? Blocks.DEAD_BUSH.getDefaultState() : Blocks.AIR.getDefaultState(), Block.NOTIFY_ALL);
			changes++;
		}
		if (soil.isOf(Blocks.GRASS_BLOCK) && this.canModify(ground, soil)) {
			this.world.setBlockState(ground, Blocks.DIRT.getDefaultState(), Block.NOTIFY_ALL);
			changes++;
		}
		return Math.max(1, changes);
	}

	@Override
	protected void onAftermathStart() {
		this.stopSuppression();
		this.actionBarAll(Text.literal("☀ The flare is subsiding. Redstone is coming back online.").formatted(Formatting.YELLOW));
	}

	@Override
	protected void tickAftermath() {
		if (this.phaseTicks() % 10 == 0) {
			for (ServerPlayerEntity player : this.players()) {
				this.world.spawnParticles(ModParticles.EMBER, player.getX(), player.getY() + 8, player.getZ(), 1, 10, 3, 10, 0.01);
			}
		}
	}

	@Override
	protected void onEnd(boolean forced) {
		this.stopSuppression();
	}

	private void stopSuppression() {
		if (this.suppressing) {
			this.suppressing = false;
			RedstoneSuppression.end(this.world);
		}
	}
}
