// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/support/TestDataApi.java
package ph.abotkamay.qa.support;

import static io.restassured.RestAssured.given;

import io.restassured.http.ContentType;
import java.util.Map;
import ph.abotkamay.qa.config.TestConfig;

/**
 * Creates test data through the API, never through the UI (UI setup is slow and flaky).
 *
 * <p>Contract the API provides in NON-PRODUCTION environments only (preview, staging): POST
 * /api/v1/test-support/campaigns, guarded by a feature flag and the X-Seed-Token header, and compiled out of
 * production builds. It creates a field-verified beneficiary, an ACTIVE campaign with two milestones, and
 * zero donations.
 */
public final class TestDataApi {

    public record SeededCampaign(String id, String slug) {}

    private TestDataApi() {}

    public static SeededCampaign createPublishedCampaign(TestConfig config, String label) {
        String token = config.seedToken().orElseThrow(() -> new IllegalStateException(
                "Seeding needs -Dseed.token=... (or E2E_SEED_TOKEN). It is only available in preview/staging."));

        return given()
                .baseUri(config.apiUrl())
                .header("X-Seed-Token", token)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "label", label,
                        "status", "ACTIVE",
                        "fieldVerified", true,
                        "goalMinor", "5000000",
                        "milestones", 2))
                .when()
                .post("/test-support/campaigns")
                .then()
                .statusCode(201)
                .extract()
                .as(SeededCampaign.class);
    }
}
