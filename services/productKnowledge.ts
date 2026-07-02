/**
 * Kiến thức thiết kế POD (Etsy US) nhúng thẳng vào prompt hệ thống — KHÔNG cần bot ngoài.
 * Rút gọn từ docs/PRODUCT_KNOWLEDGE_BASE.md để inject vào bước phân tích & redesign.
 */

// Nguyên tắc chung áp cho mọi sản phẩm — dùng ở cả analyze lẫn generate.
export const ETSY_DESIGN_PRINCIPLES =
  "TARGET MARKET: US Etsy buyers (gift & keepsake). Top niches: memorial/remembrance (pet rainbow-bridge, cardinal, 'in loving memory'), birth flower, zodiac/celestial, floral, pet portrait, family/name. " +
  "SELL-DRIVERS: clear personalization zone (name/date/quote), one strong focal subject, symmetrical balanced composition, premium gallery-grade finish. " +
  "AVOID (looks cheap): tiny illegible text, low-contrast art, cluttered multi-element layouts, generic non-personalized clip-art, off-trend muddy palettes.";

// Hướng dẫn riêng theo từng loại (niche + bố cục + màu + quy tắc kỹ thuật + cảnh mockup).
export const PRODUCT_DESIGN_GUIDE: Record<string, string> = {
  "1 Layer Suncatcher Ornament":
    "Backlit translucent acrylic: use saturated transparent JEWEL/CANDY tones that GLOW when lit; NO heavy dark/black fills (they block light). Single centered motif, radial/vertical symmetry, name arced above or banner below. Keep print inside the disc with margin. Best niches: pet/human memorial, birth flower. Mockup: hanging in a sunlit window casting colored light.",
  "Stained Glass Suncatcher":
    "Faux-leaded look: divide the motif into translucent jewel-tone glass CELLS separated by BOLD consistent dark lead lines + strong border; round, symmetrical centered subject. Colors glow backlit. Best niches: floral, birds (hummingbird/cardinal), pet memorial, celestial. Mockup: sunlit window with vivid colored light cast.",
  "Glass Ornament":
    "Opaque glossy disc (NOT backlit): rich saturated colors, strong contrast; one strong centered photo/motif with curved name text on top/bottom arc, optional thin wreath border. Two-sided is a plus. Best niches: photo keepsake, memorial, baby's first Christmas. Mockup: on a Christmas tree with warm bokeh.",
  "Ceramic Ornament":
    "Opaque glazed (can use DARK/black backgrounds — impossible on suncatchers). Treat like a printed card: balanced layout, decorative frame/wreath, NAME as hero in a display font. Lean into lucrative aesthetic micro-niches (gothmas, nutcrackercore, coquette) to escape price competition. Mockup: tree + styled flat-lay matching the niche.",
  "Transparent Acrylic Ornament":
    "Clear modern minimalist 'floating' look: embrace negative space; centered monogram/photo/logo with breathing room; minimalist line-art + script fonts. Text needs a white underbase to stay legible on clear/light backgrounds. Best niches: graduation, wedding, custom logo/business, baby. Mockup: against soft window light / neutral wall.",
  "Custom Shape Wooden Ornament":
    "The die-cut SILHOUETTE is the hook (paw, heart, tree, breed). Matte natural wood; contrast via bold engraving (dark on light birch) or limited UV color; red ribbon accent. Name/date centered, often multiple names (2-7). Best niches: pet, family, milestone. Avoid thin fragile protrusions & tiny text. Mockup: on a tree with red ribbon / rustic flat-lay.",
  "2 Layered Piece Wooden Ornament":
    "Dimensional relief: a raised top layer (subject/name) over a CONTRASTING base layer with a visible drop-shadow between layers; depth is the selling point. Bold elements (no fragile thin top pieces). Best niches: pet, family, 3D scenes. Mockup: angled lighting showing the shadow/depth (NOT shot flat).",
  "Suncatcher Ornament":
    "Light-catching translucent acrylic center (glowing jewel tones, no opaque dark fills in the light area) optionally inside a warm matte WOOD FRAME; keep the design within the frame aperture; two personalization zones (printed on acrylic + engraved on frame). Best niches: memorial, birth flower, celestial. Mockup: sunlit window showing glow + visible wood frame.",
  "Oval Stained Glass Suncatcher":
    "Faux-leaded OVAL panel: same bold dark lead-line cell structure as round Stained Glass Suncatcher but adapted to the oval frame. Portrait oval suits tall subjects (heron, iris, full-length angel, narrow flowering tree); landscape oval suits wide scenes (row of sunflowers, birds on a branch). Include a decorative border cell that follows the oval curve. Jewel-tone transparent fills, minimal dark fills to preserve glow. Best niches: botanical/floral, pet memorial, celestial/moon, bird. Mockup: sunlit window, vivid oval of colored light cast.",
  "Rectangle Stained Glass Suncatcher":
    "Faux-leaded RECTANGULAR panel: same bold lead-line cell structure as round Stained Glass Suncatcher but rectangular format. Unlocks scene/landscape layouts (winter village, cottage garden, sunset horizon, lighthouse, architectural arch) and strong vertical compositions (tall tree, standing lighthouse, cathedral arch feeling). Include a rectangular border cell framing the scene. Best niches: scenic/landscape, floral vertical, religious/arch window, cardinal memorial. Mockup: window frame with rectangular cast of colored light resembling a real stained-glass church window.",
  "Heart Glass Ornament":
    "Heart-shaped OPAQUE glossy glass (6mm): the heart silhouette IS the emotional hook — lean into it. Designs should be top-heavy and symmetrical (widest at the upper lobes, narrowing to the V point); avoid heavy elements near the bottom point. Warm romantic/memorial palette. Best niches: valentines (couple photo, initials, anniversary date), pet memorial (paw-print-in-heart, 'Forever in My Heart'), baby/newborn keepsake, mother's day. Mockup: hanging on a satin ribbon with a soft bokeh background, or on a Valentine's Day styled flat-lay.",
  "Rubber-Backed Doormat":
    "Flat rectangular surface (NOT backlit, NOT glossy): design for a viewer STANDING above looking down from 4–5 feet — bold, instantly readable. Use THICK letterforms and HIGH-contrast colors (no thin scripts, no fine gradients — woven polyester texture softens detail). Horizontal/landscape layout standard. Best niches: welcome/family name ('The Smith Family'), seasonal (fall leaves, Christmas snowflakes, spring tulips), pet owner humor ('Wipe Your Paws', 'The Dog Is Watching You'), humor ('I Hope You Brought Wine'). AVOID fine lines, small text, or photorealistic imagery. Mockup: on a front porch step or entryway floor showing scale relative to a door.",
  "Wooden Hanging Sign":
    "Flat single-layer matte WOOD SIGN (5mm): functions as wall decor or door sign — design must read well from across a room. Bold readable typography IS the hero; simple silhouette or minimal background. Any shape: rectangle (classic sign), house-shape, arrow, state outline, custom. Limited-color UV print or engraved-look dark-on-light. Best niches: family name / last name welcome sign ('The Williams Family Est. 2015'), farmhouse-style quotes, 'Welcome Friends', pet name/paw sign, inspirational quotes, business door sign. Mockup: hung on a door or wall with a rope or jute twine loop, showcasing natural wood tone.",
  "Clipboard":
    "Clear acrylic CLIPBOARD (3mm) with metal clip: design lives in the lower 80% of the board to avoid clip overlap at top — keep the top 15–20% free or use only lightweight elements there. Clean modern layout, generous negative space (the clear acrylic IS the aesthetic — unprinted areas are transparent). Best niches: teacher gifts ('Best Teacher Ever' + apple), school/back-to-school (student name + grade year), office desk personalization (name + title), nurse/medical, motivational quote + botanical. Avoid busy backgrounds — the desk surface behind will show through unprinted areas. Mockup: held in hand or propped on a desk against a neutral background, showing the transparent acrylic quality.",
};

export const getDesignGuide = (productType: string) =>
  PRODUCT_DESIGN_GUIDE[productType] || "";

// Hướng dẫn riêng theo KIỂU ÁO T-Shirt (song song PRODUCT_DESIGN_GUIDE nhưng cho tab T-Shirt).
export const TSHIRT_STYLE_GUIDE: Record<string, string> = {
  "Standard T-Shirt":
    "Standard graphic tee: ONE bold hero motif/quote as a single centered full-front print — no back layout, no jersey number/name conventions. Clean vector-style rendering, generous negative space around the motif, transparent/pure white background so it reads as a print-ready file. Best niches: quote/typography tees, pet/hobby graphics, holiday/occasion graphics.",
  "Baseball Jersey":
    "BASEBALL JERSEY layout — a two-sided personalization garment. First pick which DESIGN MODE fits the detected concept, then follow it strictly:\n" +
    "MODE A — CLEAN PERSONALIZED (default for family/rec-league/team-name gifts, bachelorette 'team bride' sets, wedding-party, teacher/retirement, kids' keepsakes): FRONT is small/secondary ONLY — EITHER a small number (~3-4in) OR a small wordmark, upper-RIGHT chest, never centered, never large. BACK is the hero: if a name is present, ALL CAPS, ARCHED across the upper back, centered directly ABOVE a LARGE number (up to ~8in tall), ~1in gap between name and number; no name supplied -> show ONLY the large number. NO slogans, NO illustrated graphics on the back — keep it clean and text-only.\n" +
    "MODE B — FAN-ART / BOOTLEG (for sport-team mascot fandom, pop-culture parody, retro-streetwear/90s-bootleg requests): FRONT is the hero — one bold illustrated mascot/graphic as the main focal point, plus the team/country name as bold vertical text down the button placket, optional small number. BACK STILL STAYS CLEAN even in this mode: ARCHED name above a LARGE number only, at most one small badge/emblem above the arch — never stack a second full illustration or a slogan/tagline on the back; if there's a tagline, place it as a small front accent near the mascot instead.\n" +
    "TYPOGRAPHY: bold block or bold serif-slab 'varsity/collegiate' numerals ONLY (never thin script or handwritten for numbers); IDENTICAL numeral font on front and back.\n" +
    "SILHOUETTE/TRIM (depicted as a flat outline/template, NOT a photograph — pick ONE cohesive variant, don't mix all): raglan or set-in short sleeves; crew neck or button-front placket; optional contrast side-panel or sleeve stripe in a secondary team color; classic pinstripe body; OR a trending gradient/ombré color-block panel; OR a distressed/vintage-wash texture.\n" +
    "TEAM IDENTITY: derive a cohesive fictional team name/colors/mascot consistent with the DETECTED SPORT if none is specified via user notes; never invent identity that contradicts one the user explicitly supplied.\n" +
    "⚠️ TRADEMARK SAFETY (critical, avoid Etsy takedown/report): any crest, mascot or emblem MUST be an ORIGINAL fan-art-style illustration only INSPIRED BY the detected team's colors/vibe — NEVER reproduce an official federation/league crest, kit-sponsor logo (e.g. Nike/Adidas swoosh), or any copyrighted character pixel-for-pixel. Treat any player as a generic stylized fan figure/silhouette, never a photorealistic licensed likeness.\n" +
    "OUTPUT FOCUS: match whichever the reference/theme emphasizes — a back-oriented (name+number) request stays within its mode's back rule; a front-chest-logo/mascot request stays within its mode's front rule.\n" +
    "Best niches: sport-team mascot fandom (bootleg/retro style), personalized family/last-name & rec-league team gifts, bachelorette 'team bride' matching sets, wedding-party, teacher/retirement gifts, kids' character-themed keepsakes. AVOID: thin script numerals, an off-center oversized front number, mismatched front/back fonts, cluttered multi-element backs.",
};

export const getTshirtStyleGuide = (style: string) =>
  TSHIRT_STYLE_GUIDE[style] || "";
