# AbotKamay Brand Kit

File: brand/BRAND.md

## Concept

"Abot-kamay" means "within reach", literally "within the reach of a hand". The mark shows two reaching hands whose arms form a heart. Inside the heart is a gold circle: the person being helped, held safely. At the top, the fingertips almost touch but leave a small gap. That gap is the idea behind the whole platform: help that is close, verified, and within reach.

- Left hand, Bayanihan Teal: trust, verification, the community that shows up (bayanihan).
- Right hand, Kalinga Coral: compassion and care (kalinga).
- Center, Sunrise Gold: hope, and the dignity of the person at the center of every campaign.

National symbols: the gold circle is deliberately a plain dot, not the eight-rayed sun or any element of the Philippine flag. RA 8491 (the Flag and Heraldic Code) restricts using national symbols in trademarks and commercial branding. Keep it that way.

## Files

- abotkamay-logo.svg: primary horizontal lockup, for light backgrounds.
- abotkamay-logo-dark.svg: horizontal lockup, for dark backgrounds.
- abotkamay-mark.svg: symbol only, transparent (headers, avatars, favicons).
- abotkamay-app-icon.svg: app icon and PWA icon source. Export 512, 192, 180 (Apple touch), 32 and 16 px PNGs.

Before production, convert the wordmark text to outlines (Figma, Illustrator, or Inkscape: Object > Object to Path) so it renders the same everywhere. Until then, load the typeface below.

## Palette

- Bayanihan Teal #0E7C6B: primary brand color, buttons, links. 5.10:1 on white (passes WCAG AA for body text). White text on teal buttons: 5.10:1.
- Kalinga Coral #E0603A: accent. 3.56:1 on white, so use it only for large text (24px+, or 18.66px+ bold), icons, and graphics. Never for body text.
- Sunrise Gold #F2B632: highlights and progress bars. 1.82:1 on white, so it is decorative only; never text on white. Ink text on gold: 8.30:1.
- Ink #0B2B26: headings and body text (15.13:1 on white), and the dark-mode background.
- Muted Green-Gray #4A6B65: secondary text (5.86:1 on white).
- Cream #FFF8EC: warm page background and app icon background.
- Dark-mode tints: Light Teal #2DBFA3 (6.55:1 on Ink), Light Coral #F27A56, Light Gold #F7C45A, Muted Light #A9C7C0 (8.37:1 on Ink), Cream text (14.33:1 on Ink).

Money states in the product UI: use Teal for "verified" and "disbursed", Gold for "in progress", and Coral only for attention states such as "proof overdue". Never use red-for-danger on a beneficiary's own page; it reads as blame.

## Typography

- Headings and wordmark: Plus Jakarta Sans, 800 (headings) and 600 (labels), from Google Fonts. It was designed in Southeast Asia, is friendly and highly legible, and supports the Filipino ñ.
- Body: Plus Jakarta Sans 400/500, or the system UI stack for performance-critical pages.
- Minimum body size is 16px, because many donors and beneficiaries are older adults.

## Usage rules

- Clear space: keep at least the height of the gold circle (about 20% of the mark's height) empty on every side.
- Minimum size: mark 24px, full lockup 120px wide.
- Do not recolor the hands to the same color; the two colors are the two people.
- Do not close the gap between the fingertips, rotate the mark, add drop shadows, or place the light logo on busy photos (use the dark logo on a solid Ink panel instead).
- Photography must follow the dignity policy: beneficiaries appear only with recorded consent, never in pity-bait framing, and minors' faces are always blurred.

## Image-generation prompts (marketing versions)

Use these in Midjourney, DALL-E / GPT-Image, Imagen, or Firefly. Generated images are marketing art only. Never generate or edit images of real beneficiaries, and never present AI images as real people helped by the platform. Label them as illustrations where the platform requires it.

### 1. Master prompt: 3D brand emblem

A modern, premium brand emblem for a Filipino humanitarian platform called "AbotKamay" (meaning "within reach"). Two stylized human arms with open hands rise from a shared point at the bottom and curve outward and upward, together outlining a soft heart shape. The fingertips reach toward each other at the top of the heart and almost touch, leaving a small, deliberate gap. Inside the heart floats a warm golden sphere representing the person being helped. The left arm is deep teal (#0E7C6B), the right arm is warm coral (#E0603A), and the sphere is sunrise gold (#F2B632). Smooth rounded tubular forms, soft-touch matte material with subtle clay texture, gentle studio lighting from the upper left, soft ambient occlusion, faint warm glow from the golden sphere. Perfectly centered, symmetrical composition on a warm cream background (#FFF8EC), generous negative space. Minimal, trustworthy, dignified, hopeful, not sentimental. No text, no letters, no flags, no national symbols, no religious symbols, no extra fingers, no photorealistic skin.

Midjourney parameters to append: --ar 1:1 --style raw --stylize 150 --v 7
DALL-E / GPT-Image: prepend "Square image, 1024x1024." and keep the full description.

### 2. Flat vector version (for designers to trace)

Flat vector logo mark, "AbotKamay": two rounded single-stroke arms forming a heart outline, fingertips almost touching at the top with a small gap, a solid golden circle inside the heart. Uniform stroke weight, perfectly round stroke caps, geometric curves, no gradients, no shadows. Left stroke teal #0E7C6B, right stroke coral #E0603A, circle gold #F2B632, pure white background. Swiss-style minimalism, app-icon clarity at 16 pixels. No text. --ar 1:1 --style raw --no gradient, shadow, texture, text, letters

### 3. Hero banner: website and campaign launch

Wide cinematic editorial illustration for the AbotKamay donation platform. Dawn light over a Philippine town street: a sari-sari store, a tricycle, jeepneys softly out of focus, capiz-shell windows. In the foreground, an elderly street vendor (a lola) with a small bilao of kakanin smiles with quiet dignity while a young volunteer in a teal AbotKamay vest kneels at her eye level, holding a phone that shows a verified-checkmark screen. Warm gold morning light, gentle teal and coral accents in clothing and signage, a hopeful and respectful mood with no pity. Soft painterly digital illustration, clean shapes, subtle grain, lots of calm negative space in the upper left for a headline. No text, no logos, no brand names, no flags. --ar 21:9 --style raw --stylize 200

### 4. Social media card: TikTok, Facebook, Instagram (vertical)

Vertical 9:16 illustrated social card in AbotKamay colors. A large, soft 3D emblem of two reaching arms forming a heart around a glowing golden sphere, floating above a stylized smartphone. The phone screen shows abstract, blurred UI blocks suggesting a verified campaign page: a teal verified badge shape, a gold progress bar, a coral update card. Warm cream background with a subtle paper texture, gentle depth of field, friendly and trustworthy, modern Filipino fintech-meets-bayanihan aesthetic. Leave clear empty space in the top third for text overlay. No readable text, no logos, no real people. --ar 9:16 --style raw

### 5. Transparency and ledger explainer visual

Isometric illustration explaining transparent donations: a chain of rounded translucent blocks (a ledger) flows from a donor's phone on the left, through a teal verification checkpoint with a small shield, to a community scene on the right where a volunteer hands a wheelchair to an elderly man in front of a pharmacy and a small store. Golden light connects each block like a thread. Palette: teal #0E7C6B, coral #E0603A, gold #F2B632, cream background #FFF8EC, ink details #0B2B26. Clean, soft 3D isometric style, friendly, precise, uncluttered. No text, no currency symbols, no flags. --ar 16:9 --style raw

### Negative prompt (for tools that support it)

text, letters, watermark, logo of other brands, Philippine flag, eight-rayed sun, religious symbols, pity, crying, dirt-caked faces, poverty clichés, extra fingers, malformed hands, photorealistic skin on the emblem, harsh shadows, neon colors, clutter
