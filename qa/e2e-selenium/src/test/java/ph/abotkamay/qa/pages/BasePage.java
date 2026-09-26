// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/pages/BasePage.java
package ph.abotkamay.qa.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import ph.abotkamay.qa.config.TestConfig;

/**
 * Shared page-object plumbing. AbotKamay's frontend puts a data-testid on every interactive element (enforced
 * by a lint rule), so locators never depend on CSS classes, copy text, or DOM structure.
 */
public abstract class BasePage {

    protected final WebDriver driver;
    protected final TestConfig config;
    protected final WebDriverWait wait;

    protected BasePage(WebDriver driver, TestConfig config) {
        this.driver = driver;
        this.config = config;
        this.wait = new WebDriverWait(driver, config.explicitWait());
    }

    protected static By testId(String id) {
        return By.cssSelector("[data-testid='" + id + "']");
    }

    protected WebElement visible(String id) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(testId(id)));
    }

    protected WebElement clickable(String id) {
        return wait.until(ExpectedConditions.elementToBeClickable(testId(id)));
    }

    protected boolean isPresent(String id) {
        return !driver.findElements(testId(id)).isEmpty();
    }
}
