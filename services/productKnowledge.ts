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
};

export const getDesignGuide = (productType: string) =>
  PRODUCT_DESIGN_GUIDE[productType] || "";
