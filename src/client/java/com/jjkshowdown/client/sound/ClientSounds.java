package com.jjkshowdown.client.sound;

import com.jjkshowdown.client.ClientState;
import com.jjkshowdown.client.config.ClientConfig;
import com.jjkshowdown.domain.DomainEntity;
import com.jjkshowdown.domain.DomainType;
import com.jjkshowdown.entity.projectile.BlueEntity;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.registry.VoiceLine;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.AbstractTickableSoundInstance;
import net.minecraft.client.resources.sounds.EntityBoundSoundInstance;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;

/** Voice lines with subtitles and entity-bound looping ambience. */
public final class ClientSounds {
	private static final Int2ObjectOpenHashMap<SoundInstance> VOICES = new Int2ObjectOpenHashMap<>();

	private ClientSounds() {
	}

	public static void voice(Payloads.Voice p) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		VoiceLine line = VoiceLine.byOrdinal(p.line());
		if (line == null) return;
		Entity speaker = mc.level.getEntity(p.entityId());
		if (ClientConfig.get().voiceLines && speaker != null) {
			SoundInstance old = VOICES.remove(p.entityId());
			if (old != null) mc.getSoundManager().stop(old);
			SoundInstance inst = new EntityBoundSoundInstance(line.sound(), SoundSource.VOICE, 1.6f, 1.0f, speaker, mc.level.getRandom().nextLong());
			mc.getSoundManager().play(inst);
			VOICES.put(p.entityId(), inst);
		}
		int len = line.subtitle().getString().length();
		ClientState.subtitle = new ClientState.Subtitle(line.character.displayName(), line.subtitle(), line.character.accentColor,
				mc.level.getGameTime(), Math.max(50, 30 + len * 2));
	}

	/** Start looping sounds for technique entities as they appear. */
	public static void onEntityLoad(Entity e) {
		Minecraft mc = Minecraft.getInstance();
		if (e instanceof BlueEntity) {
			mc.getSoundManager().play(new EntityLoop(ModSounds.BLUE_LOOP, e, 0.9f, 1.0f));
		} else if (e instanceof DomainEntity d) {
			SoundEvent amb = d.domainType() == DomainType.UNLIMITED_VOID ? ModSounds.VOID_AMBIENT : ModSounds.SHRINE_AMBIENT;
			mc.getSoundManager().play(new EntityLoop(amb, e, 2.0f, 1.0f));
		}
	}

	/** A looping sound that follows an entity and stops when it disappears. */
	static final class EntityLoop extends AbstractTickableSoundInstance {
		private final Entity entity;

		EntityLoop(SoundEvent sound, Entity entity, float volume, float pitch) {
			super(sound, SoundSource.PLAYERS, RandomSource.create());
			this.entity = entity;
			this.looping = true;
			this.delay = 0;
			this.volume = volume;
			this.pitch = pitch;
			this.x = entity.getX();
			this.y = entity.getY();
			this.z = entity.getZ();
		}

		@Override
		public void tick() {
			if (entity.isRemoved()) {
				stop();
				return;
			}
			x = entity.getX();
			y = entity.getY();
			z = entity.getZ();
		}
	}
}
