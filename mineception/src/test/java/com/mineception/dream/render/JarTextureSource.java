package com.mineception.dream.render;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.Optional;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import javax.imageio.ImageIO;

/** Reads the vanilla block textures straight from the Minecraft client jar in the Gradle cache (tests and previews). */
final class JarTextureSource extends ImageTextureSource implements AutoCloseable {
	private final ZipFile jar;

	private JarTextureSource(ZipFile jar) {
		this.jar = jar;
	}

	/** The client jar Loom extracted for 1.21.11, if this machine has it. */
	static Optional<Path> findClientJar() {
		String property = System.getProperty("mineception.clientJar");
		if (property != null && Files.isRegularFile(Paths.get(property))) {
			return Optional.of(Paths.get(property));
		}
		Path loom = Paths.get(System.getProperty("user.home"), ".gradle", "caches", "fabric-loom");
		Path direct = loom.resolve("1.21.11").resolve("minecraft-client.jar");
		if (Files.isRegularFile(direct)) {
			return Optional.of(direct);
		}
		if (!Files.isDirectory(loom)) {
			return Optional.empty();
		}
		try (Stream<Path> files = Files.walk(loom, 3)) {
			return files.filter(p -> p.getFileName().toString().equals("minecraft-client.jar"))
				.filter(p -> p.toString().contains("1.21.11"))
				.max(Comparator.comparing(Path::toString));
		} catch (IOException e) {
			return Optional.empty();
		}
	}

	static Optional<JarTextureSource> open() {
		return findClientJar().map(path -> {
			try {
				return new JarTextureSource(new ZipFile(path.toFile()));
			} catch (IOException e) {
				throw new UncheckedIOException(e);
			}
		});
	}

	/** Decodes any PNG in the jar (e.g. "assets/minecraft/textures/block/stone.png"); null if missing. */
	BlockTextures.RawImage read(String entryName) {
		ZipEntry entry = jar.getEntry(entryName);
		if (entry == null) {
			return null;
		}
		try (InputStream in = jar.getInputStream(entry)) {
			BufferedImage image = ImageIO.read(in);
			if (image == null) {
				return null;
			}
			int w = image.getWidth();
			int h = image.getHeight();
			return new BlockTextures.RawImage(image.getRGB(0, 0, w, h, null, 0, w), w, h);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	boolean hasBlockTexture(String name) {
		return jar.getEntry("assets/minecraft/textures/block/" + name + ".png") != null;
	}

	@Override
	protected BlockTextures.RawImage loadImage(String name) {
		return read("assets/minecraft/textures/block/" + name + ".png");
	}

	@Override
	public void close() throws IOException {
		jar.close();
	}
}
