// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/pages/SandboxCheckoutPage.java
package ph.abotkamay.qa.pages;

import org.openqa.selenium.WebDriver;
import ph.abotkamay.qa.config.TestConfig;
import ph.abotkamay.qa.scenarios.DonationScenario.SandboxOutcome;

/**
 * Deterministic checkout used in preview/staging: AbotKamay's payment-gateway simulator page, which mimics the
 * PayMongo/Xendit redirect flow and sends correctly signed webhooks back to the API. Real gateway sandboxes are
 * exercised separately by a small @Tag("gateway-sandbox") suite, because third-party sandbox pages change
 * without notice and rate-limit test traffic.
 */
public final class SandboxCheckoutPage extends BasePage {

    SandboxCheckoutPage(WebDriver driver, TestConfig config) {
        super(driver, config);
        visible("sandbox-checkout");
    }

    public DonationResultPage complete(SandboxOutcome outcome) {
        switch (outcome) {
            case AUTHORIZE -> clickable("sandbox-authorize").click();
            case FAIL -> clickable("sandbox-fail").click();
            case NOT_REACHED -> throw new IllegalArgumentException("A scenario that never reaches checkout cannot complete it");
        }
        return new DonationResultPage(driver, config);
    }
}
