package dev.portalgun.registry;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.portalgun.PortalGunMod;
import java.util.Optional;
import net.minecraft.advancements.criterion.ContextAwarePredicate;
import net.minecraft.advancements.criterion.EntityPredicate;
import net.minecraft.advancements.criterion.SimpleCriterionTrigger;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

public final class ModCriteria {
	public static final VisitedTrigger VISITED = Registry.register(BuiltInRegistries.TRIGGER_TYPES, PortalGunMod.id("visited_dimension"), new VisitedTrigger());

	private ModCriteria() {
	}

	public static void init() {
	}

	/** Fires whenever a player arrives in a portal-gun dimension; can match a dimension and/or a visited count. */
	public static class VisitedTrigger extends SimpleCriterionTrigger<VisitedTrigger.Instance> {
		@Override
		public Codec<Instance> codec() {
			return Instance.CODEC;
		}

		public void trigger(ServerPlayer player, Identifier dimension, int visitedCount) {
			this.trigger(player, i -> i.matches(dimension, visitedCount));
		}

		public record Instance(Optional<ContextAwarePredicate> player, Optional<Identifier> dimension, Optional<Integer> count)
			implements SimpleCriterionTrigger.SimpleInstance {
			public static final Codec<Instance> CODEC = RecordCodecBuilder.create(i -> i.group(
				EntityPredicate.ADVANCEMENT_CODEC.optionalFieldOf("player").forGetter(Instance::player),
				Identifier.CODEC.optionalFieldOf("dimension").forGetter(Instance::dimension),
				Codec.INT.optionalFieldOf("count").forGetter(Instance::count)
			).apply(i, Instance::new));

			public boolean matches(Identifier dim, int visited) {
				return this.dimension.map(dim::equals).orElse(true) && this.count.map(c -> visited >= c).orElse(true);
			}
		}
	}
}
