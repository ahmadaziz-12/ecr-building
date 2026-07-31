import cement from "@/assets/products/cement.jpg";
import cementWhite from "@/assets/products/cement-white.jpg";
import steelRebar from "@/assets/products/steel-rebar.jpg";
import steelRebar16 from "@/assets/products/steel-rebar-16.jpg";
import tilesGrey from "@/assets/products/tiles-grey.jpg";
import tilesMarble from "@/assets/products/tiles-marble.jpg";
import paintWhite from "@/assets/products/paint-white.jpg";
import paintBeige from "@/assets/products/paint-beige.jpg";
import pvcPipe from "@/assets/products/pvc-pipe.jpg";
import pvcElbow from "@/assets/products/pvc-elbow.jpg";
import cable from "@/assets/products/cable.jpg";
import switchImg from "@/assets/products/switch.jpg";
import drill from "@/assets/products/drill.jpg";
import hammer from "@/assets/products/hammer.jpg";
import glass from "@/assets/products/glass.jpg";
import sealant from "@/assets/products/sealant.jpg";
import sandFine from "@/assets/products/sand-fine.jpg";
import mdfBoard from "@/assets/products/mdf-board.jpg";
import rockwool from "@/assets/products/rockwool.jpg";
import anchorBolt from "@/assets/products/anchor-bolt.jpg";
import waterproofMembrane from "@/assets/products/waterproof-membrane.jpg";
import pavingBlock from "@/assets/products/paving-block.jpg";

export const productImage: Record<string, string> = {
  "CEM-OPC-50KG": cement,
  "CEM-WHT-40KG": cementWhite,
  "STEEL-RBR-12MM": steelRebar,
  "STEEL-RBR-16MM": steelRebar16,
  "TILE-GRY-60X60": tilesGrey,
  "TILE-MRB-80X80": tilesMarble,
  "PAINT-WHT-20L": paintWhite,
  "PAINT-BEIGE-4L": paintBeige,
  "PVC-PIPE-2IN": pvcPipe,
  "PVC-ELB-2IN": pvcElbow,
  "ELEC-CBL-2.5MM": cable,
  "ELEC-SW-1G": switchImg,
  "TOOL-DRL-18V": drill,
  "TOOL-HMR-500": hammer,
  "GLASS-6MM-CLR": glass,
  "SEAL-SILC-300": sealant,
  // §4-17 seeded building-materials catalog
  "ABC-OPC-50KG": cement,
  "DPC-OPC-50KG": cementWhite,
  "NJC-SRC-50KG": cement,
  "GRS-RAPID-25KG": cementWhite,
  "AFS-RBR-12MM-G60": steelRebar,
  "GRF-RBR-12MM-G60": steelRebar16,
  "NSW-RBR-12MM-G60": steelRebar,
  "EMT-RBR-12MM-G40": steelRebar16,
  "AGG-SAND-FINE": sandFine,
  "TIM-MDF-18MM": mdfBoard,
  "CABLE-2.5MM": cable,
  "INS-RW-50MM": rockwool,
  "GLASS-CLR-8MM": glass,
  "HRD-ANCH-10MM": anchorBolt,
  "TOOL-DRILL-500W": drill,
  "WPF-LIQ-20L": waterproofMembrane,
  "LAND-PAVE-GRY": pavingBlock,
};

export const categoryImage: Record<string, string> = {
  Cement: cement,
  Steel: steelRebar,
  Tiles: tilesGrey,
  Paint: paintWhite,
  Plumbing: pvcPipe,
  Electrical: cable,
  Tools: drill,
  // Category-level placeholders (§3): shown when a product has no own photo yet — a product is
  // NEVER hidden just because its image is missing.
  "Cement & Binders": cement,
  "Aggregates & Sand": sandFine,
  "Steel & Reinforcement": steelRebar,
  "Tiles & Stone": tilesGrey,
  "Timber & Boards": mdfBoard,
  "Paint & Coatings": paintWhite,
  "Pipes & Plumbing": pvcPipe,
  Insulation: rockwool,
  "Glass & Windows": glass,
  "Hardware & Fasteners": anchorBolt,
  "Power & Hand Tools": drill,
  Waterproofing: waterproofMembrane,
  Landscaping: pavingBlock,
};

/** §3: resolve a product image, falling back to a category-based construction placeholder. */
export function resolveProductImage(sku: string, category?: string | null, imageUrl?: string | null) {
  return imageUrl || productImage[sku] || (category ? categoryImage[category] : undefined) || cement;
}