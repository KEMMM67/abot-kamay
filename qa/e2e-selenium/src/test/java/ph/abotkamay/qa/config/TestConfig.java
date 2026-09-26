// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/config/TestConfig.java
package ph.abotkamay.qa.config;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.time.Duration;
import java.util.Optional;
import ph.abotkamay.qa.driver.BrowserType;

/**
 * Runtime configuration for the AbotKamay E2E suite. Every value can come from a system property
 * (-Dbase.url=...) or an environment variable (E2E_BASE_URL=...); system properties win.
 */
public record TestConfig(
        String baseUrl,
        String apiUrl,
        Optional<URL> gridUrl,
        BrowserType browser,
        boolean headless,
        boolean mobileEmulation,
        Duration explicitWait,
        Duration pageLoadTimeout,
        Optional<String> seedToken) {

    private static final TestConfig INSTANCE = load();

    public static TestConfig get() {
        return INSTANCE;
    }

    private static TestConfig load() {
        return new TestConfig(
                trimTrailingSlash(value("base.url", "E2E_BASE_URL").orElse("http://localhost:3000")),
                trimTrailingSlash(value("api.url", "E2E_API_URL").orElse("http://localhost:4000/api/v1")),
                value("grid.url", "E2E_GRID_URL").map(TestConfig::toUrl),
                BrowserType.parse(value("browser", "E2E_BROWSER").orElse("chrome")),
                Boolean.parseBoolean(value("headless", "E2E_HEADLESS").orElse("true")),
                Boolean.parseBoolean(value("mobile", "E2E_MOBILE").orElse("true")),
                Duration.ofSeconds(Long.parseLong(value("wait.seconds", "E2E_WAIT_SECONDS").orElse("15"))),
                Duration.ofSeconds(Long.parseLong(value("pageload.seconds", "E2E_PAGELOAD_SECONDS").orElse("45"))),
                value("seed.token", "E2E_SEED_TOKEN"));
    }

    private static Optional<String> value(String property, String envVar) {
        String fromProperty = System.getProperty(property);
        if (fromProperty != null && !fromProperty.isBlank()) {
            return Optional.of(fromProperty.trim());
        }
        String fromEnv = System.getenv(envVar);
        return fromEnv == null || fromEnv.isBlank() ? Optional.empty() : Optional.of(fromEnv.trim());
    }

    private static URL toUrl(String raw) {
        try {
            return URI.create(raw).toURL();
        } catch (MalformedURLException | IllegalArgumentException e) {
            throw new IllegalStateException("Invalid grid URL: " + raw, e);
        }
    }

    private static String trimTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
