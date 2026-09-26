// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/tests/ScenarioCatalogTest.java
package ph.abotkamay.qa.tests;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import ph.abotkamay.qa.scenarios.DonationScenario;
import ph.abotkamay.qa.scenarios.DonationScenario.Origin;
import ph.abotkamay.qa.scenarios.ScenarioCatalog;
import ph.abotkamay.qa.scenarios.ScenarioCatalog.CatalogFile;

/**
 * Browser-free gate that runs on every pull request: AI-generated scenario catalogs must be well-formed,
 * traceable to requirements, and human-reviewed before they can execute.
 */
@Tag("catalog")
class ScenarioCatalogTest {

    private final CatalogFile donationFlow = ScenarioCatalog.load("donation-flow");

    @Test
    void donation_flow_catalog_is_valid() {
        assertThat(ScenarioCatalog.validate(donationFlow)).isEmpty();
    }

    @Test
    void every_executable_scenario_was_approved_by_a_named_reviewer() {
        List<DonationScenario> approved = ScenarioCatalog.approved("donation-flow").toList();
        assertThat(approved).isNotEmpty();
        assertThat(approved).allSatisfy(s -> assertThat(s.review().reviewedBy()).isNotBlank());
    }

    @Test
    void ai_generated_scenarios_are_labelled_and_pending_ones_do_not_run() {
        List<DonationScenario> all = donationFlow.scenarios();
        assertThat(all).anyMatch(s -> s.origin() == Origin.AI_GENERATED);
        List<String> approvedIds = ScenarioCatalog.approved("donation-flow").map(DonationScenario::id).toList();
        assertThat(all.stream().filter(s -> !s.isApproved()).map(DonationScenario::id))
                .doesNotContainAnyElementsOf(approvedIds);
    }

    @Test
    void smoke_subset_covers_success_and_failure_paths() {
        List<DonationScenario> smoke = donationFlow.scenarios().stream()
                .filter(DonationScenario::isApproved)
                .filter(s -> s.tags().contains("smoke"))
                .toList();
        assertThat(smoke).extracting(s -> s.expected().outcome())
                .contains(DonationScenario.Outcome.RECEIPT, DonationScenario.Outcome.DECLINED);
    }
}
