// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/pages/DonationModal.java
package ph.abotkamay.qa.pages;

import java.util.Locale;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import ph.abotkamay.qa.config.TestConfig;
import ph.abotkamay.qa.scenarios.DonationScenario.PaymentMethod;

/** Donation modal on the campaign page: amount, payment method, anonymity, email, fee breakdown. */
public final class DonationModal extends BasePage {

    DonationModal(WebDriver driver, TestConfig config) {
        super(driver, config);
        visible("donation-modal");
    }

    public DonationModal enterAmount(String amount) {
        WebElement input = visible("amount-input");
        input.clear();
        input.sendKeys(amount);
        input.sendKeys(Keys.TAB); // trigger blur validation
        return this;
    }

    public DonationModal choosePaymentMethod(PaymentMethod method) {
        clickable("method-" + method.name().toLowerCase(Locale.ROOT)).click();
        return this;
    }

    public DonationModal setAnonymous(boolean anonymous) {
        WebElement toggle = visible("anonymous-toggle");
        if (toggle.isSelected() != anonymous) {
            toggle.click();
        }
        return this;
    }

    public DonationModal enterEmail(String email) {
        visible("email-input").sendKeys(email);
        return this;
    }

    /** Fee transparency is shown BEFORE payment, e.g. "₱500.00 ang mapupunta sa kampanya" (the UI is in Filipino). */
    public String feeBreakdownText() {
        return visible("fee-breakdown").getText();
    }

    public String validationMessage() {
        return visible("amount-error").getText();
    }

    public boolean isPayEnabled() {
        return visible("pay-button").isEnabled();
    }

    /** Continues to checkout. In preview/staging this is the gateway sandbox simulator. */
    public SandboxCheckoutPage pay() {
        clickable("pay-button").click();
        return new SandboxCheckoutPage(driver, config);
    }
}
