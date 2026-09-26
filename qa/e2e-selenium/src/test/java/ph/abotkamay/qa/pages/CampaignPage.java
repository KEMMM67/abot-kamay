// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/pages/CampaignPage.java
package ph.abotkamay.qa.pages;

import org.openqa.selenium.WebDriver;
import ph.abotkamay.qa.config.TestConfig;

/** Public campaign page: /c/{slug}. */
public final class CampaignPage extends BasePage {

    public CampaignPage(WebDriver driver, TestConfig config) {
        super(driver, config);
    }

    public CampaignPage open(String slug) {
        driver.get(config.baseUrl() + "/c/" + slug);
        visible("campaign-title");
        return this;
    }

    /** Trust signal: e.g. "Field-verified by a Tier 3 coordinator on 25 Sep 2026". */
    public String verificationBadgeText() {
        return visible("verification-badge").getText();
    }

    public boolean showsVerificationTimeline() {
        return isPresent("verification-timeline");
    }

    public boolean hasPublicLedgerLink() {
        return isPresent("public-ledger-link");
    }

    public DonationModal startDonation() {
        clickable("donate-button").click();
        return new DonationModal(driver, config);
    }
}
