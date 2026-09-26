// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/tests/DonationFlowTest.java
package ph.abotkamay.qa.tests;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.deque.html.axecore.results.Results;
import com.deque.html.axecore.selenium.AxeBuilder;
import io.restassured.response.ValidatableResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import ph.abotkamay.qa.pages.CampaignPage;
import ph.abotkamay.qa.pages.DonationModal;
import ph.abotkamay.qa.pages.DonationResultPage;
import ph.abotkamay.qa.scenarios.DonationScenario;
import ph.abotkamay.qa.scenarios.DonationScenario.Expected;
import ph.abotkamay.qa.scenarios.ScenarioCatalog;
import ph.abotkamay.qa.support.BaseE2ETest;
import ph.abotkamay.qa.support.TestDataApi;
import ph.abotkamay.qa.support.TestDataApi.SeededCampaign;

/**
 * Core donation journey, driven by the AI-generated, human-reviewed catalog
 * src/test/resources/scenarios/donation-flow.scenarios.json.
 *
 * <p>How AI-driven scenarios are structured:
 * <ol>
 *   <li>Requirements (AK-DON-*, AK-LED-*, ...) and the OpenAPI spec are fed to the scenario generator prompt
 *       (ai/generate-scenarios.prompt.md). The model proposes scenarios as JSON: happy paths, boundaries,
 *       failure paths, abuse cases, each traced to requirement ids and given a risk level.</li>
 *   <li>The JSON lands in a pull request as PENDING_REVIEW. A QA engineer approves, edits, or rejects each
 *       scenario. ScenarioCatalogTest validates the structure in CI without a browser.</li>
 *   <li>This class is the single executor: one parameterized test runs every APPROVED scenario. Adding
 *       coverage means adding reviewed data, not writing new browser code.</li>
 * </ol>
 *
 * <p>Run: ./mvnw verify -Pe2e -Dbase.url=https://pr-12.preview.abotkamay.ph -Dapi.url=https://api.pr-12.preview.abotkamay.ph/api/v1
 * -Dseed.token=... [-Dgrid.url=http://localhost:4444] [-Dscenario.tags=smoke]
 */
@Tag("e2e")
@DisplayName("Donation flow")
class DonationFlowTest extends BaseE2ETest {

    private static final Duration LEDGER_TIMEOUT = Duration.ofSeconds(60);

    static Stream<DonationScenario> approvedScenarios() {
        return ScenarioCatalog.approved("donation-flow");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("approvedScenarios")
    void donation_follows_the_reviewed_scenario(DonationScenario scenario) {
        SeededCampaign campaign = TestDataApi.createPublishedCampaign(CONFIG, scenario.id());
        CampaignPage campaignPage = new CampaignPage(driver, CONFIG).open(campaign.slug());

        // Trust before money: verification badge, timeline and public ledger are visible before donating.
        assertThat(campaignPage.verificationBadgeText()).containsIgnoringCase("verified");
        assertThat(campaignPage.showsVerificationTimeline()).isTrue();
        assertThat(campaignPage.hasPublicLedgerLink()).isTrue();

        DonationModal modal = campaignPage.startDonation()
                .enterAmount(scenario.input().amount())
                .choosePaymentMethod(scenario.input().paymentMethod())
                .setAnonymous(scenario.input().anonymous())
                .enterEmail(uniqueEmail(scenario));

        Expected expected = scenario.expected();
        switch (expected.outcome()) {
            case VALIDATION_ERROR -> {
                assertThat(modal.validationMessage()).containsIgnoringCase(expected.messageContains());
                assertThat(modal.isPayEnabled()).as("donor cannot continue to payment").isFalse();
            }
            case RECEIPT -> {
                assertThat(modal.feeBreakdownText()).as("fees are disclosed before payment")
                        .containsIgnoringCase("mapupunta sa kampanya");
                DonationResultPage result = modal.pay().complete(scenario.sandboxOutcome());
                assertDonationInPublicLedger(result.receiptReference(), expected);
            }
            case DECLINED -> {
                DonationResultPage result = modal.pay().complete(scenario.sandboxOutcome());
                assertThat(result.errorMessage()).containsIgnoringCase(expected.messageContains());
                assertCampaignLedgerIsEmpty(campaign);
            }
        }
    }

    @Test
    @DisplayName("Campaign page meets WCAG 2.2 AA (automated axe checks)")
    void campaign_page_has_no_detectable_accessibility_violations() {
        SeededCampaign campaign = TestDataApi.createPublishedCampaign(CONFIG, "A11Y-001");
        new CampaignPage(driver, CONFIG).open(campaign.slug());

        Results results = new AxeBuilder()
                .withTags(List.of("wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"))
                .analyze(driver);

        assertThat(results.getViolations())
                .as("axe violations: %s", results.getViolations().stream().map(v -> v.getId()).toList())
                .isEmpty();
    }

    /** The public ledger is written asynchronously after the gateway webhook, so poll the verify endpoint. */
    private static void assertDonationInPublicLedger(String receiptReference, Expected expected) {
        await().atMost(LEDGER_TIMEOUT).pollInterval(Duration.ofSeconds(2)).untilAsserted(() -> {
            ValidatableResponse response = given()
                    .baseUri(CONFIG.apiUrl())
                    .when()
                    .get("/ledger/verify/{ref}", receiptReference)
                    .then()
                    .statusCode(200)
                    .body("entry.amountMinor", equalTo(expected.ledgerAmountMinor()))
                    .body("entry.hash", notNullValue())
                    .body("inclusionProof", notNullValue());
            if (expected.ledgerDonorLabel() != null) {
                response.body("entry.donorLabel", equalTo(expected.ledgerDonorLabel()));
            }
        });
    }

    private static void assertCampaignLedgerIsEmpty(SeededCampaign campaign) {
        given()
                .baseUri(CONFIG.apiUrl())
                .when()
                .get("/campaigns/{slug}/ledger", campaign.slug())
                .then()
                .statusCode(200)
                .body("items.size()", equalTo(0));
    }

    private static String uniqueEmail(DonationScenario scenario) {
        return "e2e+" + scenario.id().toLowerCase(Locale.ROOT) + "-" + UUID.randomUUID() + "@example.test";
    }
}
