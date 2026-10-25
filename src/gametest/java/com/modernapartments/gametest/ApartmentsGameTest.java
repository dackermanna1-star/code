package com.modernapartments.gametest;

import com.modernapartments.build.BlockBuffer;
import com.modernapartments.build.BuildCache;
import com.modernapartments.build.ComplexType;
import com.modernapartments.build.validation.ReachabilityValidator;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * Server game tests: every complex must generate with the exact plot size, and the reachability
 * validator must reach every unit, room and amenity from the entrance with no structural warnings.
 * Run with {@code ./gradlew runGameTest}.
 */
public class ApartmentsGameTest {
	private static void check(GameTestHelper helper, ComplexType type, long seed) {
		long start = System.currentTimeMillis();
		BlockBuffer buffer = BuildCache.generate(type, seed);
		ReachabilityValidator.Report report = ReachabilityValidator.validate(buffer);
		int units = buffer.markers("unit").size();
		System.out.printf("[gametest] %s seed %d: %d units, %d markers, %d unreachable, %d warnings, %d ms%n", type.id(), seed, units,
			report.markersChecked(), report.unreachable().size(), report.warnings().size(), System.currentTimeMillis() - start);
		report.unreachable().stream().limit(20).forEach(u -> System.out.println("[gametest]   unreachable " + u));
		report.warnings().stream().limit(20).forEach(w -> System.out.println("[gametest]   warning " + w));
		if (!report.unreachable().isEmpty()) {
			String first = report.unreachable().get(0);
			java.util.regex.Matcher m = java.util.regex.Pattern.compile("x=(-?\\d+), y=(-?\\d+), z=(-?\\d+)").matcher(first);
			if (m.find()) {
				int x = Integer.parseInt(m.group(1));
				int y = Integer.parseInt(m.group(2));
				int z = Integer.parseInt(m.group(3));
				TestDump.dump(buffer, x - 14, z - 12, x + 14, z + 12, y);
				TestDump.dump(buffer, x - 14, z - 12, x + 14, z + 12, y + 1);
				TestDump.list(buffer, x - 3, z - 3, x + 3, z + 3, y);
			}
		}
		helper.assertTrue(units > 0, "no apartments generated in " + type.id());
		helper.assertTrue(report.unreachable().isEmpty(), type.id() + ": " + report.unreachable().size() + " unreachable markers");
		helper.assertTrue(report.warnings().isEmpty(), type.id() + ": " + report.warnings().size() + " structural warnings");
		helper.succeed();
	}

	@GameTest(maxTicks = 400)
	public void metropolitan(GameTestHelper helper) {
		check(helper, ComplexType.METROPOLITAN, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void parkside(GameTestHelper helper) {
		check(helper, ComplexType.PARKSIDE, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void skyline(GameTestHelper helper) {
		check(helper, ComplexType.SKYLINE, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void courtyard(GameTestHelper helper) {
		check(helper, ComplexType.COURTYARD, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void urbanLofts(GameTestHelper helper) {
		check(helper, ComplexType.URBAN_LOFTS, 1234L);
	}

	@GameTest(maxTicks = 400)
	public void otherSeeds(GameTestHelper helper) {
		for (ComplexType type : ComplexType.values()) {
			for (long seed : new long[] {7L, 99L}) {
				BlockBuffer buffer = BuildCache.generate(type, seed);
				ReachabilityValidator.Report report = ReachabilityValidator.validate(buffer);
				System.out.printf("[gametest] %s seed %d: %d unreachable, %d warnings%n", type.id(), seed, report.unreachable().size(),
					report.warnings().size());
				report.unreachable().stream().limit(5).forEach(u -> System.out.println("[gametest]   unreachable " + u));
				helper.assertTrue(report.ok(), type.id() + " seed " + seed + " failed validation");
			}
		}
		helper.succeed();
	}
}
