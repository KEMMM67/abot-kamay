// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/scenarios/ScenarioCatalog.java
package ph.abotkamay.qa.scenarios;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import ph.abotkamay.qa.scenarios.DonationScenario.Outcome;
import ph.abotkamay.qa.scenarios.DonationScenario.SandboxOutcome;

/**
 * Loads and validates AI-generated scenario catalogs from src/test/resources/scenarios.
 *
 * <p>Human-in-the-loop rule: only scenarios whose review.status is APPROVED are executed. New AI output lands
 * as PENDING_REVIEW in a pull request, and a QA engineer approves, edits, or rejects each one.
 *
 * <p>Filter by tag with -Dscenario.tags=smoke,payments (a scenario runs if it has any listed tag).
 */
public final class ScenarioCatalog {

    public record Generation(String tool, String model, String promptVersion, String generatedAt) {}

    public record CatalogFile(
            String catalog,
            int version,
            Generation generatedBy,
            List<String> sourceRequirements,
            List<DonationScenario> scenarios) {}

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true)
            .configure(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES, true);

    private static final Pattern REQUIREMENT_ID = Pattern.compile("AK-[A-Z]{2,5}-\\d{3}");
    private static final Pattern MINOR_UNITS = Pattern.compile("[1-9]\\d*");

    private ScenarioCatalog() {}

    public static CatalogFile load(String name) {
        String resource = "/scenarios/" + name + ".scenarios.json";
        try (InputStream in = ScenarioCatalog.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Scenario catalog not found on classpath: " + resource);
            }
            return MAPPER.readValue(in, CatalogFile.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot parse scenario catalog " + resource, e);
        }
    }

    /** APPROVED scenarios, optionally filtered by -Dscenario.tags. Fails fast on an invalid catalog. */
    public static Stream<DonationScenario> approved(String name) {
        CatalogFile file = load(name);
        List<String> problems = validate(file);
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Scenario catalog '" + name + "' is invalid:\n - " + String.join("\n - ", problems));
        }
        Set<String> wantedTags = Arrays.stream(System.getProperty("scenario.tags", "").split(","))
                .map(String::trim)
                .filter(tag -> !tag.isEmpty())
                .map(tag -> tag.toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
        return file.scenarios().stream()
                .filter(DonationScenario::isApproved)
                .filter(s -> wantedTags.isEmpty() || s.tags().stream().anyMatch(t -> wantedTags.contains(t.toLowerCase(Locale.ROOT))));
    }

    /** Structural rules every catalog must satisfy; checked in CI without a browser (ScenarioCatalogTest). */
    public static List<String> validate(CatalogFile file) {
        List<String> problems = new ArrayList<>();
        if (file.generatedBy() == null || file.generatedBy().promptVersion() == null) {
            problems.add("generatedBy.promptVersion is required for traceability");
        }
        Set<String> ids = new HashSet<>();
        for (DonationScenario s : file.scenarios()) {
            String where = s.id() == null ? "(scenario without id)" : s.id();
            if (s.id() == null || !ids.add(s.id())) {
                problems.add(where + ": id missing or duplicated");
            }
            if (s.requirementIds() == null || s.requirementIds().isEmpty()) {
                problems.add(where + ": must trace to at least one requirement id");
            } else {
                s.requirementIds().stream()
                        .filter(req -> !REQUIREMENT_ID.matcher(req).matches())
                        .forEach(req -> problems.add(where + ": malformed requirement id " + req));
            }
            if (s.review() == null || s.review().status() == null) {
                problems.add(where + ": review.status is required");
            } else if (s.isApproved() && (s.review().reviewedBy() == null || s.review().reviewedBy().isBlank())) {
                problems.add(where + ": APPROVED scenarios need review.reviewedBy");
            }
            if (s.tags() == null || s.input() == null || s.expected() == null || s.expected().outcome() == null) {
                problems.add(where + ": tags, input and expected.outcome are required");
                continue;
            }
            Outcome outcome = s.expected().outcome();
            if (outcome == Outcome.RECEIPT) {
                if (s.sandboxOutcome() != SandboxOutcome.AUTHORIZE) {
                    problems.add(where + ": RECEIPT requires sandboxOutcome AUTHORIZE");
                }
                if (s.expected().ledgerAmountMinor() == null || !MINOR_UNITS.matcher(s.expected().ledgerAmountMinor()).matches()) {
                    problems.add(where + ": RECEIPT requires a positive integer ledgerAmountMinor (centavos)");
                }
            }
            if (outcome == Outcome.DECLINED && s.sandboxOutcome() != SandboxOutcome.FAIL) {
                problems.add(where + ": DECLINED requires sandboxOutcome FAIL");
            }
            if (outcome == Outcome.VALIDATION_ERROR && s.sandboxOutcome() != SandboxOutcome.NOT_REACHED) {
                problems.add(where + ": VALIDATION_ERROR requires sandboxOutcome NOT_REACHED");
            }
            if (outcome != Outcome.RECEIPT && (s.expected().messageContains() == null || s.expected().messageContains().isBlank())) {
                problems.add(where + ": " + outcome + " requires expected.messageContains");
            }
        }
        return problems;
    }
}
