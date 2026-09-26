// qa/e2e-selenium/src/test/java/ph/abotkamay/qa/driver/BrowserType.java
package ph.abotkamay.qa.driver;

import java.util.Locale;

public enum BrowserType {
    CHROME,
    FIREFOX,
    EDGE;

    public static BrowserType parse(String raw) {
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Unsupported browser '" + raw + "'. Use chrome, firefox or edge.", e);
        }
    }
}
