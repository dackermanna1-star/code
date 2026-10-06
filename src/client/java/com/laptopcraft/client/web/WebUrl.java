package com.laptopcraft.client.web;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * An in-game URL: host + path + query parameters. Paths are normalized WITHOUT leading or trailing
 * slashes ("" = home page, "product", "orders/12"). {@link #toString()} gives the canonical form
 * {@code host/path?query} shown in the address bar.
 *
 * <pre>{@code
 * WebUrl u = WebUrl.parse("https://www.emerazon.mc/product?id=top_hat");
 * u.host();               // "emerazon.mc"
 * u.path();               // "product"
 * u.param("id", "");      // "top_hat"
 * WebUrl.of("emerazon.mc", "search", "q", "red hat").toString();   // "emerazon.mc/search?q=red+hat"
 * }</pre>
 */
public record WebUrl(String host, String path, Map<String, String> query) {
	public WebUrl {
		host = host == null ? "" : host.toLowerCase(Locale.ROOT).trim();
		path = normalizePath(path);
		query = query == null || query.isEmpty() ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(query));
	}

	private static String normalizePath(String p) {
		if (p == null) {
			return "";
		}
		String s = p.trim();
		while (s.startsWith("/")) {
			s = s.substring(1);
		}
		while (s.endsWith("/")) {
			s = s.substring(0, s.length() - 1);
		}
		return s;
	}

	/**
	 * Parses user input or links: accepts "emerazon.mc/product?id=x", with/without "https://" or "http://",
	 * with/without "www.". Fragments ("#...") are ignored.
	 */
	public static WebUrl parse(String raw) {
		String s = raw == null ? "" : raw.trim();
		String lower = s.toLowerCase(Locale.ROOT);
		if (lower.startsWith("https://")) {
			s = s.substring(8);
		} else if (lower.startsWith("http://")) {
			s = s.substring(7);
		}
		int hash = s.indexOf('#');
		if (hash >= 0) {
			s = s.substring(0, hash);
		}
		String queryString = "";
		int q = s.indexOf('?');
		if (q >= 0) {
			queryString = s.substring(q + 1);
			s = s.substring(0, q);
		}
		String host = s;
		String path = "";
		int slash = s.indexOf('/');
		if (slash >= 0) {
			host = s.substring(0, slash);
			path = s.substring(slash + 1);
		}
		host = host.toLowerCase(Locale.ROOT);
		if (host.startsWith("www.")) {
			host = host.substring(4);
		}
		Map<String, String> params = new LinkedHashMap<>();
		if (!queryString.isEmpty()) {
			for (String pair : queryString.split("&")) {
				if (pair.isEmpty()) {
					continue;
				}
				int eq = pair.indexOf('=');
				String k = decode(eq < 0 ? pair : pair.substring(0, eq));
				String v = eq < 0 ? "" : decode(pair.substring(eq + 1));
				if (!k.isEmpty()) {
					params.put(k, v);
				}
			}
		}
		return new WebUrl(host, decodePath(path), params);
	}

	/** Builds a URL from host, path and alternating key/value strings. */
	public static WebUrl of(String host, String path, String... keyValues) {
		Map<String, String> params = new LinkedHashMap<>();
		for (int i = 0; i + 1 < keyValues.length; i += 2) {
			params.put(keyValues[i], keyValues[i + 1]);
		}
		return new WebUrl(host, path, params);
	}

	/** Query parameter or {@code def}. */
	public String param(String key, String def) {
		String v = query.get(key);
		return v == null ? def : v;
	}

	/** Integer query parameter or {@code def} if missing/invalid. */
	public int intParam(String key, int def) {
		try {
			return Integer.parseInt(param(key, "").trim());
		} catch (NumberFormatException e) {
			return def;
		}
	}

	/** Path segments: "orders/12" → ["orders", "12"]; home page → []. */
	public List<String> segments() {
		if (path.isEmpty()) {
			return List.of();
		}
		List<String> out = new ArrayList<>();
		for (String seg : path.split("/")) {
			if (!seg.isEmpty()) {
				out.add(seg);
			}
		}
		return out;
	}

	/** Segment {@code i} or "" if there is none. */
	public String segment(int i) {
		List<String> s = segments();
		return i >= 0 && i < s.size() ? s.get(i) : "";
	}

	public WebUrl withPath(String newPath) {
		return new WebUrl(host, newPath, Map.of());
	}

	public WebUrl withParam(String key, String value) {
		Map<String, String> m = new LinkedHashMap<>(query);
		m.put(key, value);
		return new WebUrl(host, path, m);
	}

	public WebUrl withoutParam(String key) {
		Map<String, String> m = new LinkedHashMap<>(query);
		m.remove(key);
		return new WebUrl(host, path, m);
	}

	/** True if this is the site's home page. */
	public boolean isHome() {
		return path.isEmpty();
	}

	/** Canonical "host/path?query" (no scheme). */
	@Override
	public String toString() {
		StringBuilder sb = new StringBuilder(host);
		if (!path.isEmpty()) {
			sb.append('/').append(encodePath(path));
		}
		if (!query.isEmpty()) {
			sb.append('?');
			boolean first = true;
			for (Map.Entry<String, String> e : query.entrySet()) {
				if (!first) {
					sb.append('&');
				}
				first = false;
				sb.append(encode(e.getKey()));
				if (!e.getValue().isEmpty()) {
					sb.append('=').append(encode(e.getValue()));
				}
			}
		}
		return sb.toString();
	}

	/** URL-encodes a query component (spaces become '+'). */
	public static String encode(String s) {
		return URLEncoder.encode(s, StandardCharsets.UTF_8);
	}

	public static String decode(String s) {
		try {
			return URLDecoder.decode(s, StandardCharsets.UTF_8);
		} catch (IllegalArgumentException e) {
			return s;
		}
	}

	private static String decodePath(String s) {
		if (s.indexOf('%') < 0) {
			return s;
		}
		try {
			return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8);
		} catch (IllegalArgumentException e) {
			return s;
		}
	}

	private static String encodePath(String p) {
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < p.length(); i++) {
			char c = p.charAt(i);
			if (c == ' ') {
				sb.append("%20");
			} else if (c == '?' || c == '#' || c == '%' || c == '&') {
				sb.append(String.format(Locale.ROOT, "%%%02X", (int) c));
			} else {
				sb.append(c);
			}
		}
		return sb.toString();
	}
}
