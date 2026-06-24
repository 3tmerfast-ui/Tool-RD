
export interface ProductAnalysis {
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
  "Glass Ornament",
  "Ceramic Ornament",
  "Transparent Acrylic Ornament",
  "Custom Shape Wooden Ornament",
  "2 Layered Piece Wooden Ornament",
  "Suncatcher Ornament"
];

export const PRODUCT_MATERIALS: Record<string, string> = {
  "1 Layer Suncatcher Ornament": "Thin transparent acrylic sheet, 3mm depth, glossy finish.",
  "Stained Glass Suncatcher": "Translucent textured glass effect, lead soldering lines, vibrant colors.",
  "Glass Ornament": "Hand-blown glass, spherical or flat disc, high-shine finish.",
  "Ceramic Ornament": "Solid white ceramic, matte or glossy glaze, durable feel.",
  "Transparent Acrylic Ornament": "Optically clear acrylic, laser-cut edges, 3mm thickness.",
  "Custom Shape Wooden Ornament": "Natural plywood or MDF, laser-engraved details, matte wood finish.",
  "2 Layered Piece Wooden Ornament": "Dual-layer construction, 3D depth effect, combined wood textures.",
  "Suncatcher Ornament": "Transparent material with prismatic light-refracting properties."
};
