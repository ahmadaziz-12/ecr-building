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
};

export const categoryImage: Record<string, string> = {
  Cement: cement,
  Steel: steelRebar,
  Tiles: tilesGrey,
  Paint: paintWhite,
  Plumbing: pvcPipe,
  Electrical: cable,
  Tools: drill,
};