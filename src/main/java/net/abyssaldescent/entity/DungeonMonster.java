package net.abyssaldescent.entity;

import net.abyssaldescent.entity.projectile.SoulBoltEntity;
import net.abyssaldescent.registry.ModAttachments;
import net.abyssaldescent.registry.ModParticles;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/**
 * Base class for every dungeon enemy: elite affix behaviour, aura, no despawning. Subclasses implement their own AI and
 * telegraphed attacks.
 */
public abstract class DungeonMonster extends Monster {
	/** Current telegraphed action (0 = none); drives client animations. */
	private static final EntityDataAccessor<Integer> DATA_ACTION = SynchedEntityData.defineId(DungeonMonster.class, EntityDataSerializers.INT);
	/** Attack cadence mirrored to clients so action animations can keep pace with faster (frenzied) attacks. */
	private static final EntityDataAccessor<Float> DATA_CADENCE = SynchedEntityData.defineId(DungeonMonster.class, EntityDataSerializers.FLOAT);
	private static final int WARD_INTERVAL = 160;
	private float ward;
	private int wardTimer = 60;

	protected DungeonMonster(EntityType<? extends Monster> type, Level level) {
		super(type, level);
		this.xpReward = 6;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_ACTION, 0);
		builder.define(DATA_CADENCE, 1.0F);
	}

	public int action() {
		return entityData.get(DATA_ACTION);
	}

	public void setAction(int action) {
		entityData.set(DATA_ACTION, action);
	}

	@Override
	public void onSyncedDataUpdated(EntityDataAccessor<?> accessor) {
		super.onSyncedDataUpdated(accessor);
		if (DATA_ACTION.equals(accessor) && level().isClientSide()) {
			onActionChanged(action());
		}
	}

	/** Client hook: start/stop animation states when the action changes. */
	protected void onActionChanged(int action) {
	}

	@Nullable
	public MobInfo dungeonInfo() {
		return getAttached(ModAttachments.MOB_INFO);
	}

	public int dungeonFloor() {
		MobInfo info = dungeonInfo();
		return info == null ? 1 : info.floor();
	}

	@Nullable
	public EliteAffix affix() {
		MobInfo info = dungeonInfo();
		return info == null ? null : info.eliteAffix();
	}

	public boolean isElite() {
		return affix() != null;
	}

	/** Hook after scaling/affixes were applied by {@link DungeonMobs#prepare}. */
	protected void onPrepared() {
		this.xpReward = isElite() ? 20 : 6 + dungeonFloor();
	}

	/** Attack cooldown multiplier for subclasses and shared goals (frenzied elites attack faster). */
	public float cadence() {
		return affix() == EliteAffix.FRENZIED ? 0.7F : 1.0F;
	}

	/** {@link #cadence()} as synced to clients; action animations play at {@code 1 / syncedCadence()} speed. */
	public float syncedCadence() {
		return entityData.get(DATA_CADENCE);
	}

	/**
	 * How much dungeon scaling (difficulty config, depth, elite) multiplies this enemy's attack damage. Ranged attacks
	 * that set their own damage multiply by this so they scale like melee.
	 */
	protected float damageScale() {
		AttributeInstance attack = getAttribute(Attributes.ATTACK_DAMAGE);
		return attack == null || attack.getBaseValue() <= 0 ? 1.0F : (float) (attack.getValue() / attack.getBaseValue());
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		entityData.set(DATA_CADENCE, cadence());
		EliteAffix affix = affix();
		if (affix == null) {
			return;
		}
		if (tickCount % 5 == 0) {
			Vec3 c = position();
			float w = getBbWidth();
			level.sendParticles(new DustParticleOptions(affix.color(), 1.1F), c.x, c.y + getBbHeight() * 0.5, c.z, 2, w * 0.6, getBbHeight() * 0.35,
				w * 0.6, 0.0);
		}
		if (affix == EliteAffix.WARDED) {
			if (ward <= 0 && --wardTimer <= 0) {
				ward = getMaxHealth() * 0.3F;
				wardTimer = WARD_INTERVAL;
				level.playSound(null, getX(), getY(), getZ(), ModSounds.SEAL_CLOSE, SoundSource.HOSTILE, 0.8F, 1.6F);
				level.sendParticles(ParticleTypes.ENCHANT, getX(), getY() + 1, getZ(), 20, 0.5, 0.8, 0.5, 0.5);
			}
			if (ward > 0 && tickCount % 4 == 0) {
				level.sendParticles(ModParticles.RUNE_GLYPH, getX(), getY() + getBbHeight() * 0.5, getZ(), 1, getBbWidth() * 0.7, getBbHeight() * 0.4,
					getBbWidth() * 0.7, 0.0);
			}
		}
	}

	public boolean hasWard() {
		return ward > 0;
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		// No friendly fire: stray arrows and swings from other dungeon enemies neither hurt nor enrage this one.
		if (source.getEntity() instanceof DungeonMonster other && other != this) {
			return false;
		}
		if (ward > 0 && !source.is(net.minecraft.tags.DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			float absorbed = Math.min(ward, amount);
			ward -= absorbed;
			amount -= absorbed;
			level.sendParticles(ModParticles.RUNE_GLYPH, getX(), getY() + getBbHeight() * 0.6, getZ(), 4, 0.4, 0.4, 0.4, 0.05);
			if (ward <= 0) {
				// The ward shatters: a satisfying, readable break.
				level.playSound(null, getX(), getY(), getZ(), ModSounds.SEAL_OPEN, SoundSource.HOSTILE, 1.0F, 1.4F);
				level.sendParticles(ParticleTypes.ENCHANTED_HIT, getX(), getY() + 1, getZ(), 24, 0.6, 0.8, 0.6, 0.3);
			}
			if (amount <= 0) {
				playHurtSound(source);
				return false;
			}
		}
		return super.hurtServer(level, source, amount);
	}

	@Override
	public boolean doHurtTarget(ServerLevel level, Entity target) {
		boolean hit = super.doHurtTarget(level, target);
		if (hit) {
			onDamageDealt(level, (float) getAttributeValue(Attributes.ATTACK_DAMAGE));
		}
		return hit;
	}

	/**
	 * Called after one of this enemy's attacks lands, whatever its path (melee, special strikes, its projectiles), with
	 * the damage the attack dealt before armour.
	 */
	public void onDamageDealt(ServerLevel level, float amount) {
		if (amount > 0 && isAlive() && affix() == EliteAffix.VAMPIRIC) {
			heal(amount * 0.6F);
			level.sendParticles(ModParticles.BLOOD_MOTE, getX(), getY() + 1, getZ(), 8, 0.3, 0.4, 0.3, 0.02);
		}
	}

	@Override
	public void die(DamageSource source) {
		super.die(source);
		if (level() instanceof ServerLevel level && affix() == EliteAffix.SOULBOUND) {
			// Ring of slow soul bolts: raise a shield or step between them.
			for (int i = 0; i < 8; i++) {
				double angle = i / 8.0 * Math.PI * 2;
				Vec3 dir = new Vec3(Math.cos(angle), 0.0, Math.sin(angle));
				SoulBoltEntity bolt = new SoulBoltEntity(level, this, dir, 0.35, (3.0F + dungeonFloor() * 0.3F) * damageScale(), 0.0);
				bolt.setPos(getX() + dir.x * 0.6, getY() + 0.9, getZ() + dir.z * 0.6);
				level.addFreshEntity(bolt);
			}
			level.playSound(null, getX(), getY(), getZ(), ModSounds.SKULL_WAIL, SoundSource.HOSTILE, 1.0F, 0.7F);
		}
	}

	@Override
	public boolean removeWhenFarAway(double distance) {
		return false;
	}

	@Override
	public boolean canBeLeashed() {
		return false;
	}
}
