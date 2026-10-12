package com.mineception.dream;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import org.junit.jupiter.api.Test;

/** Writes the layout preview sheets to build/preview/layout (look at them when changing the generator). */
class LayoutPreviewTest {
	@Test
	void writesLayoutPreviews() throws Exception {
		File dir = new File("build/preview/layout");
		LayoutPreview.main(new String[]{dir.getPath()});
		assertTrue(new File(dir, "level1_seed1.png").isFile());
	}
}
