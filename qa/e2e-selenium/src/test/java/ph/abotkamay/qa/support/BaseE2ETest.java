// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/support/BaseE2ETest.java
package ph.abotkamay.qa.support;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.openqa.selenium.WebDriver;
import ph.abotkamay.qa.config.TestConfig;
import ph.abotkamay.qa.driver.DriverFactory;

/** One fresh, isolated browser per test; screenshots and page source attached on failure. */
public abstract class BaseE2ETest {

    protected static final TestConfig CONFIG = TestConfig.get();

    protected WebDriver driver;

    @RegisterExtension
    final ScreenshotOnFailure screenshotOnFailure = new ScreenshotOnFailure(() -> driver);

    @BeforeEach
    void startBrowser() {
        driver = DriverFactory.create(CONFIG);
    }

    @AfterEach
    void quitBrowser() {
        if (driver != null) {
            driver.quit();
        }
    }
}
