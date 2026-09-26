// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/driver/DriverFactory.java
package ph.abotkamay.qa.driver;

import java.time.Duration;
import java.util.Map;
import org.openqa.selenium.MutableCapabilities;
import org.openqa.selenium.PageLoadStrategy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.remote.RemoteWebDriver;
import ph.abotkamay.qa.config.TestConfig;

/**
 * Creates one isolated browser per test.
 *
 * <ul>
 *   <li>Local runs: Selenium Manager (built into Selenium 4) resolves the driver binaries automatically.</li>
 *   <li>CI runs: pass -Dgrid.url=http://localhost:4444 to use Selenium Grid (see docker-compose.grid.yml).</li>
 *   <li>Mobile-first: most AbotKamay donors arrive from TikTok/Facebook on phones, so Chrome emulates a
 *       Pixel 7 by default (-Dmobile=false for desktop).</li>
 *   <li>WebDriver BiDi is enabled (webSocketUrl) for console/network capture; Selenium 5 drops the
 *       CDP-only APIs, so new tooling should use BiDi.</li>
 *   <li>Implicit waits stay at zero: the suite uses explicit waits only.</li>
 * </ul>
 */
public final class DriverFactory {

    private DriverFactory() {}

    public static WebDriver create(TestConfig config) {
        MutableCapabilities options = switch (config.browser()) {
            case CHROME -> chromeOptions(config);
            case FIREFOX -> firefoxOptions(config);
            case EDGE -> edgeOptions(config);
        };
        WebDriver driver = config.gridUrl()
                .<WebDriver>map(url -> new RemoteWebDriver(url, options))
                .orElseGet(() -> localDriver(options));
        driver.manage().timeouts().pageLoadTimeout(config.pageLoadTimeout());
        driver.manage().timeouts().scriptTimeout(Duration.ofSeconds(30));
        return driver;
    }

    private static WebDriver localDriver(MutableCapabilities options) {
        if (options instanceof ChromeOptions chrome) {
            return new ChromeDriver(chrome);
        }
        if (options instanceof FirefoxOptions firefox) {
            return new FirefoxDriver(firefox);
        }
        if (options instanceof EdgeOptions edge) {
            return new EdgeDriver(edge);
        }
        throw new IllegalStateException("Unsupported options type: " + options.getClass());
    }

    static ChromeOptions chromeOptions(TestConfig config) {
        ChromeOptions options = new ChromeOptions();
        if (config.headless()) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--lang=en-PH", "--disable-search-engine-choice-screen");
        if (config.mobileEmulation()) {
            options.setExperimentalOption("mobileEmulation", Map.of("deviceName", "Pixel 7"));
        } else {
            options.addArguments("--window-size=1366,900");
        }
        options.setPageLoadStrategy(PageLoadStrategy.NORMAL);
        options.setCapability("webSocketUrl", true);
        return options;
    }

    static FirefoxOptions firefoxOptions(TestConfig config) {
        FirefoxOptions options = new FirefoxOptions();
        if (config.headless()) {
            options.addArguments("-headless");
        }
        options.addPreference("intl.accept_languages", "en-PH,en,fil");
        options.setCapability("webSocketUrl", true);
        return options;
    }

    static EdgeOptions edgeOptions(TestConfig config) {
        EdgeOptions options = new EdgeOptions();
        if (config.headless()) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--lang=en-PH", "--window-size=1366,900");
        options.setCapability("webSocketUrl", true);
        return options;
    }
}
