// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/pages/DonationResultPage.java
package ph.abotkamay.qa.pages;

import java.time.Duration;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import ph.abotkamay.qa.config.TestConfig;

/** Page the donor returns to after checkout: receipt on success, a clear message on failure. */
public final class DonationResultPage extends BasePage {

    private static final Duration GATEWAY_REDIRECT_TIMEOUT = Duration.ofSeconds(60);

    DonationResultPage(WebDriver driver, TestConfig config) {
        super(driver, config);
        new WebDriverWait(driver, GATEWAY_REDIRECT_TIMEOUT).until(ExpectedConditions.or(
                ExpectedConditions.visibilityOfElementLocated(testId("receipt-reference")),
                ExpectedConditions.visibilityOfElementLocated(testId("payment-error"))));
    }

    /** Receipt reference printed on the receipt; also accepted by GET /api/v1/ledger/verify/{ref}. */
    public String receiptReference() {
        return visible("receipt-reference").getText().trim();
    }

    public String errorMessage() {
        return visible("payment-error").getText();
    }
}
