// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/support/ScreenshotOnFailure.java
package ph.abotkamay.qa.support;

import io.qameta.allure.Allure;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebDriverException;

/**
 * Captures evidence when a test fails. AfterTestExecutionCallback runs right after the test method and
 * BEFORE @AfterEach, so the browser is still open.
 */
public final class ScreenshotOnFailure implements AfterTestExecutionCallback {

    private final Supplier<WebDriver> driver;

    public ScreenshotOnFailure(Supplier<WebDriver> driver) {
        this.driver = driver;
    }

    @Override
    public void afterTestExecution(ExtensionContext context) {
        WebDriver current = driver.get();
        if (context.getExecutionException().isEmpty() || current == null) {
            return;
        }
        try {
            if (current instanceof TakesScreenshot camera) {
                byte[] png = camera.getScreenshotAs(OutputType.BYTES);
                Allure.addAttachment("screenshot: " + context.getDisplayName(), "image/png",
                        new ByteArrayInputStream(png), ".png");
            }
            Allure.addAttachment("url", "text/plain", current.getCurrentUrl());
            Allure.addAttachment("page source", "text/html",
                    new ByteArrayInputStream(current.getPageSource().getBytes(StandardCharsets.UTF_8)), ".html");
        } catch (WebDriverException ignored) {
            // The browser may already be gone (crash, grid timeout); never mask the original failure.
        }
    }
}
