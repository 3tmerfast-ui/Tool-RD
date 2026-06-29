
export interface ProductAnalysis {
  coreTheme?: string;            // Chủ đề chủ đạo: thiết kế này LÀ GÌ (subject + theme + style)
  styleDNA?: string;             // Cách thể hiện: kỹ thuật vẽ, đường nét/leading, rendering, palette
  detectedProductType?: string;  // Loại SP AI nhận diện (khớp 1 trong PRODUCT_TYPES)
  detectedMaterial?: string;     // Chất liệu/kết cấu AI nhận diện từ ảnh
  description: string;
  designCritique: string;
  redesignPrompt: string;
  detectedComponents: string[];
}

export enum DesignMode {
  NEW_CONCEPT = 'NEW_CONCEPT',
  ENHANCE_EXISTING = 'ENHANCE_EXISTING',
  CLEAN_ONLY = 'CLEAN_ONLY'
}

export enum AppTab {
  POD = 'POD',
  TSHIRT = 'TSHIRT',
  TOOLS = 'TOOLS'
}

export enum RopeType {
  NONE = 'None',
  JUTE = 'Dây gai (Jute)',
  RED_RIBBON = 'Dây ribbon đỏ',
  RED_WHITE_TWINE = 'Dây dù trắng đỏ',
  GOLD_METALLIC = 'Dây kim tuyến vàng'
}

export const ROPE_OPTIONS = [
  { id: RopeType.NONE, name: 'None', color: 'transparent' },
  { id: RopeType.JUTE, name: 'Dây gai (Jute)', color: '#a89078' },
  { id: RopeType.RED_RIBBON, name: 'Dây ribbon đỏ', color: '#dc2626' },
  { id: RopeType.RED_WHITE_TWINE, name: 'Dây dù trắng đỏ', color: 'repeating-linear-gradient(45deg, #fff, #fff 5px, #dc2626 5px, #dc2626 10px)' },
  { id: RopeType.GOLD_METALLIC, name: 'Dây kim tuyến vàng', color: 'linear-gradient(45deg, #f59e0b, #fef3c7, #f59e0b)' },
];

export const COLOR_OPTIONS = [
  { name: 'Classic Red', color: '#ef4444' },
  { name: 'Forest Green', color: '#15803d' },
  { name: 'Royal Gold', color: '#fbbf24' },
  { name: 'Ice Blue', color: '#3b82f6' },
  { name: 'Midnight', color: '#1e293b' },
  { name: 'Pure White', color: '#ffffff' },
  { name: 'Lavender', color: '#a78bfa' },
  { name: 'Rose Gold', color: '#fb7185' },
];

export type RetentionLevel = '20%' | '40%' | '60%' | '80%';

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalImage: string;
  processedImage: string | null;
  analysis: ProductAnalysis | null;
  generatedRedesigns: string[] | null;
  productType: string;
  designMode: DesignMode;
  ropeType?: RopeType;
  tab?: AppTab;
  username?: string;
  retention?: string;
}

export enum ProcessStage {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  CLEANING = 'CLEANING',
  ANALYZING = 'ANALYZING',
  REVIEW = 'REVIEW',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE'
}

export const PRODUCT_TYPES = [
  "Auto-Detect / Random",
  "1 Layer Suncatcher Ornament",
  "Stained Glass Suncatcher",
  "Oval Stained Glass Suncatcher",
  "Rectangle Stained Glass Suncatcher",
  "Glass Ornament",
  "Heart Glass Ornament",
  "Ceramic Ornament",
  "Transparent Acrylic Ornament",
  "Custom Shape Wooden Ornament",
  "2 Layered Piece Wooden Ornament",
  "Suncatcher Ornament",
  "Rubber-Backed Doormat",
  "Wooden Hanging Sign",
  "Clipboard",
];

// Chất liệu & quy cách chuẩn (tham khảo printway.io) — tối ưu cho AI image-gen
// để mockup redesign bám sát sản phẩm thật. Mỗi chuỗi được inject trực tiếp vào prompt.
export const PRODUCT_MATERIALS: Record<string, string> = {
  "1 Layer Suncatcher Ornament":
    "Single flat 3mm clear acrylic panel, glossy translucent surface with crisp polished edges that refract light; vivid single-sided UV print that glows as sunlight passes through (no white backing); visible transparent acrylic rim/border around the panel edge; top metal loop hung on a silver chain or rope.",
  "Stained Glass Suncatcher":
    "Round thin (2-3mm) translucent glass disc, glossy reflective surface with jewel-tone colors that glow like real stained glass when backlit; subtle glass thickness at the rim; hung at a window catching daylight, casting vivid colored light.",
  "Glass Ornament":
    "Flat round 6mm glass disc, glossy reflective surface with sharp specular highlights and refractive edges; slight transparency in unprinted areas; vivid permanent print; top hole fitted with a sparkling glitter-wire loop.",
  "Ceramic Ornament":
    "Opaque glazed ceramic (circle/heart/star/oval), smooth glossy porcelain surface with soft rounded edges and gentle specular glaze sheen; fully solid, no light transmission; vivid sublimated print; hung by a thin ribbon through a metal loop.",
  "Transparent Acrylic Ornament":
    "Flat ~3mm crystal-clear acrylic square, glossy see-through faces with polished light-refracting edges; transparent unprinted areas casting soft colored shadows; vivid UV print; hung by a sparkling tinsel-wire loop.",
  "Custom Shape Wooden Ornament":
    "Custom die-cut flat MDF/fiber-wood panel (~3-5mm), matte non-reflective printed face with exposed natural-wood color and faint grain at the cut edge; natural wood-grain border/rim visible at the entire die-cut perimeter; opaque vivid print; top hole with glitter-wire loop on a string.",
  "2 Layered Piece Wooden Ornament":
    "Two stacked fiber-wood layers bonded to 6mm total, creating raised dimensional relief with a soft drop-shadow between layers; matte printed faces, natural-wood grain on the cut edges; hung by a metal-wire loop.",
  "Suncatcher Ornament":
    "6mm light-catching piece with a translucent glossy acrylic center that transmits colored light (no white backing), optionally set in a matte wood frame edge; solid thickness at the rim; hung at a window by a metal loop on a chain or rope.",
  "Oval Stained Glass Suncatcher":
    "Oval thin (4mm) translucent glass panel, glossy reflective surface with jewel-tone stained-glass colors that glow when backlit; oval silhouette with polished rim edge; portrait or landscape orientation; hung at a window casting vivid oval-shaped colored light.",
  "Rectangle Stained Glass Suncatcher":
    "Rectangular thin (4mm) translucent glass panel, glossy reflective surface with jewel-tone stained-glass colors that glow when backlit; portrait or landscape rectangle with polished rim; hung at a window casting rectangular colored-light patterns reminiscent of a church window.",
  "Heart Glass Ornament":
    "Heart-shaped flat 6mm glass panel, glossy reflective opaque surface with sharp specular highlights; fully opaque premium glass (not backlit); vivid permanent print; top hole at the heart V-notch fitted with a glitter-wire loop or satin ribbon.",
  "Rubber-Backed Doormat":
    "Rectangular woven polyester-face mat with thick non-slip rubber backing; two sizes: 30×18 inches or 24×16 inches; flat horizontal surface print; slightly textured fabric-weave face softens fine detail; laid flat on the floor, viewed from above.",
  "Wooden Hanging Sign":
    "Flat single-layer 5mm MDF/wood-fiber panel, matte non-reflective printed or engraved face; natural wood-grain border visible at all cut edges; any custom silhouette or standard rectangle shape; hung via metal loop or rope through a top hole.",
  "Clipboard":
    "Flat 3mm crystal-clear acrylic clipboard, glossy see-through faces with polished refractive edges; integrated spring metal clip at the top edge; UV-printed design on the face below the clip; transparent in unprinted areas; standard letter-size proportions.",
};
