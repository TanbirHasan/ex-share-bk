import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../db/client";
import {
  brands,
  categories,
  comments,
  contentReports,
  contentTranslations,
  products,
  productImages,
  votes,
} from "../db/schema";
import { slugify } from "../lib/slug";

/**
 * DESTRUCTIVE: wipes the entire catalog (categories, brands, products, and
 * everything that cascades from products — reviews, problems, solutions,
 * service experiences, questions, saved/follows/price data) and replaces it
 * with a curated 13-category dataset sourced from real Star Tech (+ a few
 * Othoba/Rokomari/BDStall) listings collected 2026-10-11, including real
 * per-product photos. Explicit user decision (2026-10-11) after being shown
 * the real user-generated content this destroys.
 *
 *   cd backend && yarn tsx src/scripts/reset-and-seed-catalog.ts
 */

type CategorySeed = { slug: string; nameEn: string; nameBn: string };
type ProductSeed = {
  brand: string;
  name: string;
  specs: string;
  sale: number;
  regular?: number;
  image?: string;
};

const TINTS = ["eef2f7", "f0edf7", "eaf0f6", "f6f0e8"];

const CATEGORIES: CategorySeed[] = [
  { slug: "air-conditioner", nameEn: "Air Conditioner", nameBn: "এয়ার কন্ডিশনার" },
  { slug: "air-fryer", nameEn: "Air Fryer", nameBn: "এয়ার ফ্রায়ার" },
  { slug: "blender-mixer", nameEn: "Blender & Mixer Grinder", nameBn: "ব্লেন্ডার ও মিক্সার গ্রাইন্ডার" },
  { slug: "mobile-phone", nameEn: "Mobile Phone", nameBn: "মোবাইল ফোন" },
  { slug: "speaker", nameEn: "Bluetooth Speaker", nameBn: "ব্লুটুথ স্পিকার" },
  { slug: "ceiling-fan", nameEn: "Ceiling Fan", nameBn: "সিলিং ফ্যান" },
  { slug: "deep-freezer", nameEn: "Deep Freezer", nameBn: "ডিপ ফ্রিজার" },
  { slug: "cctv-smart-home", nameEn: "CCTV & Smart Home", nameBn: "সিসিটিভি ও স্মার্ট হোম" },
  { slug: "earbuds", nameEn: "Earbuds & Headphones", nameBn: "ইয়ারবাড ও হেডফোন" },
  { slug: "gaming-console", nameEn: "Gaming Console", nameBn: "গেমিং কনসোল" },
  { slug: "geyser", nameEn: "Geyser", nameBn: "গিজার" },
  { slug: "refrigerator", nameEn: "Refrigerator", nameBn: "রেফ্রিজারেটর" },
  { slug: "laptop", nameEn: "Computer & Laptops", nameBn: "কম্পিউটার ও ল্যাপটপ" },
];

const IMG = "https://www.startech.com.bd/image/cache/catalog";

const PRODUCTS: Record<string, ProductSeed[]> = {
  "air-conditioner": [
    { brand: "Midea", name: "Midea 1 Ton Portable AC", specs: "12,000 BTU/Hr, R-410A, 3-in-1 Ultra-quiet Mobile", sale: 38688, regular: 48000, image: `${IMG}/air-conditioner/midea/mwf-12cmp/mwf-12cmp-001-228x228.webp` },
    { brand: "Xiaomi", name: "Xiaomi Viomi A2 1 Ton Non-Inverter AC", specs: "12000 BTU/hr, Golden Fin, 3D Airflow, R410A", sale: 36743, regular: 49990, image: `${IMG}/air-conditioner/xiaomi/viomi-a2/viomi-a2-official-01-228x228.webp` },
    { brand: "Midea", name: "Midea 1 Ton Inverter AC", specs: "12000 BTU/hr, Rotary compressor, Coverage 120 sqft", sale: 42216, regular: 55990, image: `${IMG}/air-conditioner/midea/msi-12crn/msi-12crdn8-ag1-01-228x228.webp` },
    { brand: "Smart", name: "Smart 1 Ton Non-Inverter AC", specs: "12000 BTU, 90-120 sqft, LED Digit display", sale: 38578, regular: 56900, image: `${IMG}/air-conditioner/smart/sea-112ss/sea-112ss-official-04-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Non-Inverter AC", specs: "12000 BTU/hr, Intelligent Auto Restart, I FEEL", sale: 45900, regular: 60000, image: `${IMG}/air-conditioner/gree/gs-12xcoa5/gs-12xcoa5-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Portable AC", specs: "12,000 BTU/Hr, R-410A, 3-in-1, Self-Evaporating", sale: 49247, regular: 60500, image: `${IMG}/air-conditioner/gree/gp-12nlf410/gp-12nlf410-official-02-228x228.webp` },
    { brand: "Haier", name: "Haier 1.1 Ton UVCool WiFi Inverter AC", specs: "13000 BTU, AI ECO, UVC Pro Sterilization", sale: 46474, regular: 60990, image: `${IMG}/air-conditioner/haier/hsu-13uvcool-inv-pro-x6/hsu-13uvcool-inv-pro-x6-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Zeno-Split Inverter AC", specs: "G10 Inverter, 12000 BTU, WiFi, Auto Clean", sale: 52280, regular: 61290, image: `${IMG}/air-conditioner/gree/gs-12xzna3v/gs-12xzna3v-official-01-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Shimo-Split Inverter AC", specs: "12000 BTU, WiFi, Auto Clean, Auto Restart", sale: 51790, regular: 61290, image: `${IMG}/air-conditioner/gree/gs-18xsma4vba/gs-18xsma4vba-04-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Cosmo-Split Inverter AC", specs: "Dual DC Inverter, 12000 BTU, WiFi, Cold Plasma Filter", sale: 53000, regular: 61790, image: `${IMG}/air-conditioner/gree/gs-12xcoa1v/gs-12xcoa1v-official-01-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Inverter AC", specs: "Dual DC Inverter, 12000 BTU, WiFi, Self-Cleaning", sale: 56000, regular: 61790, image: `${IMG}/air-conditioner/gree/gs-12xcoa3v/gs-12xcoa3v-official-02-228x228.webp` },
    { brand: "Gree", name: "Gree 1 Ton Shimo-Split Non-Inverter AC", specs: "12000 BTU, Intelligent Auto Restart, I FEEL", sale: 50000, regular: 62000, image: `${IMG}/air-conditioner/gree/gs-12xsma1/gs-12xsma1-228x228.webp` },
    { brand: "Hisense", name: "Hisense 1.5 Ton Non-Inverter AC", specs: "18000 Btu/h, R32, Copper Condenser, Golden Hydrophilic Fin", sale: 48500, regular: 63900, image: `${IMG}/air-conditioner/hisense/as-18cw4rxskf00au/as-18cw4rxskf00au-official-02-228x228.webp` },
    { brand: "Haier", name: "Haier 1.5 Ton AquaCool Non-Inverter AC", specs: "18000 BTU, Air Circulation 800 m3/h, EER 2.96", sale: 50000, regular: 63990, image: `${IMG}/air-conditioner/haier/hsu-18aquacool/hsu-18aquacool-official-01-228x228.webp` },
    { brand: "Smart", name: "Smart 1 Ton Inverter AC", specs: "12000 BTU, Cooling Area 90-120 sqft, LED Digit", sale: 43886, regular: 66900, image: `${IMG}/air-conditioner/smart/sea-212sis/sea-212sis-official-03-228x228.webp` },
    { brand: "TCL", name: "TCL 1 Ton Inverter AC", specs: "Full DC Inverter, 1 Ton, 6-Layer Protection, Vitamin C Air", sale: 57497, regular: 66900, image: `${IMG}/air-conditioner/tcl/tac-12csd-tph21/tac-12csd-tph21-228x228.webp` },
    { brand: "Haier", name: "Haier 1.6 Ton AntirustCool Inverter Pro AC", specs: "19000 BTU, HaiSmart App, Voice Control, iFeel", sale: 55964, regular: 68000, image: `${IMG}/air-conditioner/haier/hsu-19antirustcool/hsu-19antirustcool-official-01-228x228.webp` },
    { brand: "Haier", name: "Haier 1.6 Ton CleanCool Inverter AC", specs: "19000 BTU, Air Circulation 1100 m3/h, Hidden LED Display", sale: 52225, regular: 68990, image: `${IMG}/air-conditioner/haier/hsu-19cleancool/hsu-19cleancool-official-05-228x228.webp` },
    { brand: "Xiaomi", name: "Xiaomi Viomi A2 2 Ton Non-Inverter AC", specs: "24000 BTU/hr, Golden Fin, 3D Airflow, R410A", sale: 57807, regular: 69900, image: `${IMG}/air-conditioner/xiaomi/viomi-a2/viomi-a2-official-01-228x228.webp` },
    { brand: "TCL", name: "TCL 1 Ton WiFi Inverter AC", specs: "Full DC Inverter, WiFi Control, 6-Layer Protection", sale: 59954, regular: 69900, image: `${IMG}/air-conditioner/tcl/tac-12csd-tph21/tac-12csd-tph21-228x228.webp` },
  ],
  "air-fryer": [
    { brand: "Philips", name: "Philips 1000 Series 4.2 Liter Air Fryer (NA120/00)", specs: "4.2 L, 1500 W, Max 200°C, 12 cooking methods", sale: 7106, regular: 12990, image: `${IMG}/appliance/air-fryer/philips/na120-00/na120-00-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips NA110/00 1000 Series 3.2 Liter Air Fryer", specs: "3.2 L, 1300 W, 12 Cooking Modes, Rapid Air", sale: 6060, regular: 7500, image: `${IMG}/appliance/air-fryer/philips/na110-00/philips-na110-00-official-01-228x228.webp` },
    { brand: "Oraimo", name: "Oraimo NutriFry S1 1500W 6L Air Fryer (OAF-261A)", specs: "6 L, 1500W, Max 230°C, 7\" Window, Touch Control", sale: 8047, regular: 9181, image: `${IMG}/appliance/air-fryer/oraimo/nutrifry-s1/nutrifry-s1-01-228x228.webp` },
    { brand: "Oraimo", name: "Oraimo NutriFry S1 Ultra 1500W 6L Air Fryer (OAF-521A)", specs: "6 L, Lit Window, Full Touchscreen, App Recipes", sale: 8733, regular: 9972, image: `${IMG}/appliance/air-fryer/oraimo/nutrifry-s1-ultra/nutrifry-s1-ultra-official-01-228x228.webp` },
    { brand: "Pigeon", name: "Pigeon PG251/00 6L Air Fryer", specs: "6 L, 1700W, Digital Touch Panel, Removable Basket", sale: 7901, regular: 11500, image: `${IMG}/appliance/air-fryer/pigeon/pg251-00/pg251-00-03-228x228.webp` },
    { brand: "Xiaomi", name: "Xiaomi Air Fryer Essential 6L", specs: "6 L Flip-Free, 1550W, 12 Presets, Metal Interior", sale: 9250, regular: 12500, image: `${IMG}/appliance/air-fryer/xioami/air-fryer-essential-6l/air-fryer-essential-6l-01-228x228.webp` },
    { brand: "Pigeon", name: "Pigeon PG352/00 8L Air Fryer", specs: "8 L, 2000W, Digital Touch Panel, Removable Basket", sale: 9125, regular: 12500, image: `${IMG}/appliance/air-fryer/pigeon/pg352-00/pg352-00-03-228x228.webp` },
    { brand: "Oraimo", name: "Oraimo Intellifry 1600W 9L Air Fryer (OAF-502A)", specs: "9 L, Dual Heating, No Flipping, Touch Control", sale: 11220, regular: 12968, image: `${IMG}/appliance/air-fryer/oraimo/intellifry/intellifry-01-228x228.webp` },
    { brand: "Philips", name: "Philips Essential HD9252 4.1 Liter Air Fryer", specs: "4.1 L, 1400 W, 13-in-1, 7 Presets, HomeID App", sale: 10150, regular: 14500, image: `${IMG}/appliance/air-fryer/philips/essential-hd9252/essential-hd9252-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips NA231/00 2000 Series 6.2 Liter Air Fryer", specs: "6.2 L, 1700 W, 13 cooking methods", sale: 12000, regular: 15000, image: `${IMG}/appliance/air-fryer/philips/na231-09/philips-na231-09-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips NA221 4.2 Liter 1500 Watt Air Fryer", specs: "4.2 L, 1500 W, Max 240°C, Fry/Bake/Grill/Roast", sale: 11193, regular: 15990, image: `${IMG}/appliance/air-fryer/philips/na221/na-221-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips 3000 Series 6.2L Air Fryer (HD9270/91)", specs: "6.2 L, 2000 W, Low-fat Multi Cooker, LED Display", sale: 12837, regular: 16500, image: `${IMG}/appliance/air-fryer/philips/hd9270-90/philips-hd9270-90-official-01-228x228.webp` },
    { brand: "Sharp", name: "Sharp KF-AF70M-BK 7L 1600W Air Fryer", specs: "7 L, 80-200°C, Max Timer 60 min, 1600W", sale: 12852, regular: 18900, image: `${IMG}/appliance/air-fryer/sharp/kf-af70m-bk/kf-af70m-bk-01-228x228.webp` },
    { brand: "Philips", name: "Philips NA150/09 7.1 Liter Dual Basket Air Fryer", specs: "7.1 L Dual Basket, 2450 W, 6 Presets, Rapid Air", sale: 15500, regular: 20000, image: `${IMG}/appliance/air-fryer/philips/na150-09/na150-09-official-01-228x228.webp` },
    { brand: "Delonghi", name: "Delonghi FS6067 1.5 Liter Deep Air Fryer", specs: "1.5 kg food / 2.4 L oil, 1800 W, Odor Filter", sale: 19000, regular: 23000, image: `${IMG}/appliance/air-fryer/delonghi/fs6067/fs6067-11-01-228x228.webp` },
    { brand: "Philips", name: "Philips 5000 Series 7.2L Air Fryer (HD9285/91)", specs: "7.2 L, 2000 W, 16-in-1, Rapid Air, Low-fat", sale: 19012, regular: 23500, image: `${IMG}/appliance/air-fryer/philips/hd9285-93/philips-hd9285-93-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips 3000 Series 7.2 Liter Air Fryer (NA342/09)", specs: "7.2 L, 2000 W, 12 cooking methods", sale: 18000, regular: 24000, image: `${IMG}/appliance/air-fryer/philips/na342-09/philips-na342-09-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips NA352/00 9 Liter Dual Basket Air Fryer", specs: "9 L Dual Basket, 2750 W, Fry/Bake/Grill/Roast", sale: 22230, regular: 28500, image: `${IMG}/appliance/air-fryer/philips/na35200/na35200-01-228x228.webp` },
    { brand: "Delonghi", name: "Delonghi FH2394.BK 1.5L Multi Cooker Air Fryer", specs: "1.5 L, 5 Presets, 1700 W, Ceramic-coated Bowl", sale: 32500, regular: 38500, image: `${IMG}/appliance/air-fryer/delonghi/fh2394-bk/fh2394-bk-11-01-228x228.webp` },
  ],
  "blender-mixer": [
    { brand: "Philips", name: "Philips HL1680/00 300W Hand Blender", specs: "300W, Stainless Steel Blade, SmartFlow Technology", sale: 4193, regular: 5990, image: `${IMG}/appliance/blender/philips/hl168000/hl168000-01-228x228.webp` },
    { brand: "Philips", name: "Philips HL1682/00 300W Hand Blender", specs: "300W, Stainless Steel Blade, Dishwasher-safe", sale: 4810, regular: 5990, image: `${IMG}/appliance/blender/philips/hl168200/hl168200-01-228x228.webp` },
    { brand: "Philips", name: "Philips HR-2520/00 400W Hand Blender", specs: "400W, ProMix Technology, Dishwasher-safe", sale: 5490, regular: 6500, image: `${IMG}/appliance/blender/philips/hr2520-00/hr2520-00-228x228.webp` },
    { brand: "Philips", name: "Philips HR1351/90 250W Hand Blender With Chopper", specs: "250W, Detachable Bar, 1L Beaker with Lid", sale: 5070, regular: 6500, image: `${IMG}/appliance/blender/philips/hr1351-90/hr1351-90-01-228x228.webp` },
    { brand: "Philips", name: "Philips HR3705 300W Hand Mixer", specs: "300W, Non-slip Grip, 5 Speeds + Turbo", sale: 5452, regular: 6990, image: `${IMG}/appliance/blender/philips/hr3705/hr3705-01-228x228.webp` },
    { brand: "Philips", name: "Philips HL7757 750W 3 Jar Mixer Grinder", specs: "750W, 3 Jars, Rotary Switch, Overload Protection", sale: 5990, regular: 7500, image: `${IMG}/appliance/blender/philips/hl-7757/philips-hl7757-official-01-228x228.webp` },
    { brand: "Philips", name: "Philips HL7757/01 1.5L Mixer Grinder", specs: "750W, Jars 1.5L/1L/0.4L, Turbo Motor", sale: 5990, regular: 7500, image: `${IMG}/appliance/blender/philips/hl7757-01/hl775701-blue-01-228x228.webp` },
    { brand: "Kenwood", name: "Kenwood HandMix Lite HMP30.A0WH 450W Hand Mixer", specs: "450W, 5 Speeds + Turbo, Whisk/Mix/Knead", sale: 6000, regular: 7500, image: `${IMG}/appliance/blender/kenwood/hmp30-a0wh/hmp30-a0wh-11-01-228x228.webp` },
    { brand: "Philips", name: "Philips HL7505 500W Blender", specs: "500W, Jars 1.25L/0.75L/0.33L, RPM 20000, 3 Speeds", sale: 5990, regular: 7590, image: `${IMG}/appliance/blender/singer/hl7505-500w/hl7505-500w-official-02-228x228.webp` },
    { brand: "Panasonic", name: "Panasonic MX-SS1 3-in-1 Hand Blender", specs: "Variable Speed, 4 Blades, Blend/Chop/Whisk", sale: 7000, regular: 8500, image: `${IMG}/appliance/blender/panasonic/mx-ss1/mx-ss1-01-228x228.webp` },
    { brand: "Oraimo", name: "Oraimo OmniBlend OBL-581A 4-In-1 Multifunctional Blender", specs: "1500W Copper Motor, Jars 2.5L/2.0L/200mL", sale: 8940, regular: 9566, image: `${IMG}/appliance/blender/oraimo/obl-581a/obl-581a-01-228x228.webp` },
    { brand: "Philips", name: "Philips HL7773/01 800W Mixer Grinder", specs: "800W, Jars 1.5L/1L/0.33L, RPM 22000, Pulse", sale: 7500, regular: 10900, image: `${IMG}/appliance/blender/philips/hl7773-01/hl7773-01-01-228x228.webp` },
    { brand: "Philips", name: "Philips 5000 Series 2L Blender", specs: "350W, Jar 2L, Stainless Blade, ProMix Presets", sale: 8500, regular: 11000, image: `${IMG}/appliance/blender/philips/hr2221-00/hr2221-00-04-228x228.webp` },
    { brand: "Oraimo", name: "Oraimo OmniBlend 2 OBL-881A 5-In-1 Multifunctional Blender", specs: "1500W Copper Motor, Jars 2.5L/2.0L/200mL, Stepless Knob", sale: 10600, regular: 11342, image: `${IMG}/appliance/blender/oraimo/obl-881a/obl-881a-01-228x228.webp` },
    { brand: "Panasonic", name: "Panasonic MX-SS40 4-in-1 Hand Blender", specs: "Variable Speed, 4 Blades, Blend/Chop/Slice/Whisk", sale: 9000, regular: 11500, image: `${IMG}/appliance/blender/panasonic/mx-ss40/mx-ss40-01-228x228.webp` },
    { brand: "Tefal", name: "Tefal Grindmax HD 1000W Mixer Grinder", specs: "1000W Heavy-Duty, Copper Motor, 3 Stainless Jars", sale: 9282, regular: 11900, image: `${IMG}/appliance/blender/tefal/grindmax-hd/grindmax-hd-01-228x228.webp` },
    { brand: "Tefal", name: "Tefal Apexgrind Plus 800W Mixer Grinder", specs: "800W Hybrid Motor, Powelix Blades, 4 Heavy-Duty Jars", sale: 9675, regular: 12900, image: `${IMG}/appliance/blender/tefal/apexgrind-plus/apexgrind-plus-01-228x228.webp` },
    { brand: "Panasonic", name: "Panasonic MX-AC300 3 Jar Mixer Grinder", specs: "Cooling Fan Motor, Double Safety Lock, 9-in-1", sale: 11500, regular: 13500, image: `${IMG}/appliance/blender/panasonic/mx-ac300/mx-ac300/mx-ac300-01-228x228.webp` },
    { brand: "Panasonic", name: "Panasonic MX-AE375 Super Mixer Grinder", specs: "750W, 9-in-1, Durable Build", sale: 12000, regular: 14500, image: `${IMG}/appliance/blender/mx-ae375/mx-ae375-001-228x228.webp` },
    { brand: "Panasonic", name: "Panasonic MX-AC460 Mixer Grinder", specs: "3 Stainless Jars + Juice Extractor, Circuit Breaker", sale: 12500, regular: 14900, image: `${IMG}/appliance/blender/panasonic/mx-ac460/mx-ac460-01-228x228.webp` },
  ],
  "mobile-phone": [
    { brand: "ZTE", name: "ZTE nubia A36", specs: "6.75\" HD+ 90Hz, Unisoc T7200, Dual 13MP, 5000mAh", sale: 13300, regular: 14499, image: `${IMG}/mobile/zte/blade-a36/nubia-a36-green-official-02-228x228.webp` },
    { brand: "Realme", name: "Realme Note 60x", specs: "6.74\" HD+ 90Hz, Unisoc T612, IP54, 5000mAh", sale: 15999, image: `${IMG}/mobile/realme/note-60x/note-60x-wilderness-green-001-228x228.webp` },
    { brand: "Tecno", name: "Tecno Spark Go 3", specs: "6.75\" HD+ 120Hz, Unisoc T7250, Side Fingerprint, IP64", sale: 15800, regular: 16999, image: `${IMG}/mobile/tecno/spark-go-3/spark-go-3-ink-black-official-02-228x228.webp` },
    { brand: "Vivo", name: "Vivo Y05e", specs: "6.74\" HD+ 90Hz, Unisoc T7225, IP64, 5150mAh", sale: 16500, regular: 16999, image: `${IMG}/mobile/vivo/y05e/y05e-crest-teal-official-01-228x228.webp` },
    { brand: "ZTE", name: "ZTE nubia A57", specs: "6.75\" HD+ 120Hz, Unisoc T7250, 22.5W Charger", sale: 15800, regular: 16999, image: `${IMG}/mobile/zte/nubia-a57/nubia-a57-orange-official-01-228x228.webp` },
    { brand: "Realme", name: "Realme C100i", specs: "6.8\" HD 120Hz, Unisoc T7250, IP64, 7000mAh", sale: 17000, regular: 17999, image: `${IMG}/mobile/realme/c100i/realme-c100i-dawn-purple-official-01-228x228.webp` },
    { brand: "Helio", name: "Helio 47", specs: "6.67\" HD+ 120Hz, MediaTek G81, 50MP, 6000mAh", sale: 17000, regular: 17999, image: `${IMG}/mobile/helio/helio-47/helio-47-navy-blue-official-01-228x228.webp` },
    { brand: "HONOR", name: "HONOR X5c Plus", specs: "6.74\" TFT 90Hz, Helio G81, 50MP, 5260mAh, 15W", sale: 18499, image: `${IMG}/mobile/honor/x5c-plus/x5c-plus-ocean-cyan-228x228.webp` },
    { brand: "HONOR", name: "HONOR X5c", specs: "6.74\" TFT LCD, Helio G81, MagicOS 9, 5260mAh", sale: 18499, regular: 18999, image: `${IMG}/mobile/honor/x5c/x5c-midnight-black-228x228.webp` },
    { brand: "Vivo", name: "Vivo Y05", specs: "6.74\" HD+ 120Hz, Unisoc T7225, IP65, 6500mAh", sale: 19100, regular: 18999, image: `${IMG}/mobile/vivo/y05/y05-voyage-black-official-03-228x228.webp` },
    { brand: "OPPO", name: "OPPO A6x", specs: "6.75\" HD+ 120Hz 1000nits, Snapdragon 685, 6000mAh", sale: 19999, image: `${IMG}/mobile/oppo/oppo-a6x/oppo-a6x-ice-blue-official-02-228x228.webp` },
    { brand: "ZTE", name: "ZTE nubia V80 Design", specs: "6.75\" HD+ 120Hz 1000nits, Unisoc T7280, IP64", sale: 19600, regular: 20999, image: `${IMG}/mobile/zte/nubia-v80-design/nubia-v80-design-peach-official-02-228x228.webp` },
    { brand: "HTC", name: "HTC Wildfire E5 Elite", specs: "7.2\" HD+ 120Hz, MediaTek G81, 7000mAh, 18W", sale: 19500, regular: 20999, image: `${IMG}/mobile/htc/wildfire-e5-elite/wildfire-e5-elite-black-official-01-228x228.webp` },
    { brand: "ZTE", name: "ZTE nubia V80 Pro", specs: "6.75\" HD+ 120Hz 1000nits, Dual 108MP, IP64", sale: 20600, regular: 21999, image: `${IMG}/mobile/zte/nubia-v80-pro/nubia-v80-pro-petal-gold-official-01-228x228.webp` },
    { brand: "Tecno", name: "Tecno SPARK 50C", specs: "6.78\" HD+ 120Hz, Helio G81, IP68 & IP69", sale: 20500, regular: 21999, image: `${IMG}/mobile/tecno/spark-50c/spark-50c-burgundy-red-official-02-228x228.webp` },
    { brand: "Samsung", name: "Samsung Galaxy A07", specs: "6.7\" HD+, 25W Fast Charging, Side Fingerprint", sale: 21500, regular: 22199, image: `${IMG}/mobile/samsung/galaxy-a07/galaxy-a07-green-official-03-228x228.webp` },
    { brand: "Realme", name: "Realme C100x", specs: "6.8\" IPS 120Hz HD+, Unisoc T7250, IP64, 8000mAh, 45W", sale: 22700, regular: 23999, image: `${IMG}/mobile/realme/c100x/c100x-deepblue-tides-01-228x228.webp` },
    { brand: "HONOR", name: "HONOR X6e", specs: "6.61\" TFT LCD 120Hz, Helio G81 Ultra, 45W, IP64", sale: 23000, regular: 23999, image: `${IMG}/mobile/honor/x6e/x6e-midnight-black-01-228x228.webp` },
    { brand: "Infinix", name: "Infinix Hot 70", specs: "6.78\" HD+ 120Hz, Helio G100 Ultimate, 6000mAh, 45W", sale: 20500, regular: 24999, image: `${IMG}/mobile/infinix/hot-70/hot-70-thermo-orange-official-01-228x228.webp` },
    { brand: "Tecno", name: "Tecno SPARK 50 Pro", specs: "6.78\" HD+ 120Hz, Helio G100 Ultimate, IP68/IP69, 60W", sale: 23800, regular: 24999, image: `${IMG}/mobile/tecno/spark-50-pro/spark-50-pro-dynamic-orange-01-228x228.webp` },
    { brand: "Apple", name: "iPhone 17", specs: "6.3\" LTPO OLED 120Hz, A19 chip, Dual 48MP, Face ID, IP68", sale: 150000, regular: 179999, image: `${IMG}/mobile/apple/iphone-17/iphone-17-mist-blue-official-03-228x228.webp` },
    { brand: "Samsung", name: "Samsung Galaxy S26 Ultra", specs: "6.9\" LTPO AMOLED 120Hz, Snapdragon 8 Elite Gen 5, 200MP", sale: 199999, image: `${IMG}/mobile/samsung/galaxy-s26-ultra/galaxy-s26-ultra-black-official-04-228x228.webp` },
    { brand: "Apple", name: "iPhone Air", specs: "6.9\" LTPO OLED 120Hz, A19 Pro chip, 48MP, Face ID, IP68", sale: 169500, regular: 209999, image: `${IMG}/mobile/apple/iphone-air/iphone-air-sky-blue-official-04-228x228.webp` },
    { brand: "Apple", name: "iPhone 17 Pro", specs: "6.3\" LTPO OLED 120Hz, A19 Pro chip, Triple 48MP, Face ID", sale: 194500, regular: 229999, image: `${IMG}/mobile/apple/iphone-17-pro/iphone-17-pro-silver-official-01-228x228.webp` },
    { brand: "Apple", name: "iPhone 17 Pro Max", specs: "6.9\" LTPO OLED 120Hz, A19 Pro chip, Triple 48MP, Face ID", sale: 209900, regular: 249999, image: `${IMG}/mobile/apple/iphone-17-pro-max/iphone-17-pro-max-cosmic-orange-official-03-228x228.webp` },
    { brand: "Apple", name: "iPhone 15 Pro Max", specs: "6.7\" Super Retina XDR Always-On, A17 Pro, USB-C 3.0, eSIM", sale: 206500, regular: 279999, image: `${IMG}/mobile/apple/iphone-15-pro-max/iphone-15-pro-max-natural-titanium-official-01-228x228.webp` },
  ],
  speaker: [
    { brand: "JBL", name: "JBL GO 4", specs: "45mm Transducer, Auracast, IP67, 850mAh, up to 7 hrs", sale: 4250, regular: 4599, image: `${IMG}/speaker/jbl/go-4/go-4-01-228x228.webp` },
    { brand: "JBL", name: "JBL CLIP 5", specs: "95Hz-20kHz, Up to 15 hrs, Multi-Point, IP67", sale: 5500, regular: 5999, image: `${IMG}/speaker/jbl/clip-5/clip-5-01-228x228.webp` },
    { brand: "JBL", name: "JBL GO 5", specs: "4.8W RMS, 45mm Transducer, Bluetooth 6.0, IP68", sale: 5790, regular: 6299, image: `${IMG}/speaker/jbl/go-5/jbl-go-5-black-228x228.webp` },
    { brand: "JBL", name: "JBL Flip 7 Portable Bluetooth Speaker", specs: "30W 2-Way System, 65Hz-20kHz, IP68, 12 hrs", sale: 11550, regular: 12499, image: `${IMG}/speaker/jbl/flip-7/flip-7-black-01-228x228.webp` },
    { brand: "JBL", name: "JBL Charge 6 Portable Bluetooth Speaker", specs: "Auracast Multi-speaker, IP68, 28 hrs, AI Sound Boost", sale: 15290, regular: 16499, image: `${IMG}/speaker/jbl/charge-6/charge-6-black-01-228x228.webp` },
    { brand: "JBL", name: "JBL Xtreme 4 Portable Bluetooth Speaker", specs: "44Hz-20kHz, 2x70mm Woofer, IP67, Up to 24 hrs", sale: 28450, regular: 30999, image: `${IMG}/speaker/jbl/xtreme-4/xtreme-4-01-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox Club 120 Portable Bluetooth Speaker", specs: "2x5.25\" Woofer, Up to 12 hrs, IPX4, Light Show", sale: 42000, regular: 50000, image: `${IMG}/speaker/jbl/partybox-club-120/partybox-club-120-01-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox Encore 2 100W with Dual Wireless Mic", specs: "100W RMS, IPX4, Bluetooth 5.4, Light Show, 4722mAh", sale: 43000, regular: 50000, image: `${IMG}/speaker/jbl/partybox-encore-2/partybox-encore-2-01-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox On-The-Go 2 with Mic", specs: "JBL Pro Sound, Wireless Mic Included, IPX4, 6 hrs", sale: 38000, regular: 45000, image: `${IMG}/speaker/jbl/partybox-on-the-go-2/partybox-on-the-go-2-01-228x228.webp` },
    { brand: "JBL", name: "JBL Boombox 4 Portable Bluetooth Speaker", specs: "37Hz-20kHz, Up to 2x65W RMS Woofer, IP68", sale: 50000, regular: 53999, image: `${IMG}/speaker/jbl/boombox-4/boombox-4-camouflage-03-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox 310 Portable Party Speaker", specs: "45Hz-20kHz, Mic & Guitar Inputs, Bluetooth, IPX4", sale: 53460, regular: 66000, image: `${IMG}/speaker/jbl/partybox-310/partybox-310-01-228x228.jpg` },
    { brand: "JBL", name: "JBL PartyBox Stage 320 Party Speaker", specs: "45Hz-20kHz, Mic & Guitar Inputs, Bluetooth 5.4, IPX4", sale: 56500, regular: 69000, image: `${IMG}/speaker/jbl/partybox-stage-320/partybox-stage-320-01-228x228.webp` },
    { brand: "JBL", name: "JBL Partybox 520 Portable Bluetooth Speaker", specs: "99.02Wh Li-ion Battery, 40Hz-20kHz, Up to 15 hrs", sale: 71340, regular: 82000, image: `${IMG}/speaker/jbl/partybox-520/partybox-520-03-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox 710 800W Party Speaker", specs: "800W RMS Pro Sound, Customizable Light Show, IPX4", sale: 73800, regular: 90000, image: `${IMG}/speaker/jbl/partybox-710/partybox-710-01-228x228.webp` },
    { brand: "JBL", name: "JBL PartyBox 1000 Party Speaker", specs: "Full Panel Light Effects, Air Gesture, Mic & Guitar, TWS", sale: 93500, regular: 110000, image: `${IMG}/speaker/jbl/partybox-1000/partybox-1000-01-228x228.jpg` },
    { brand: "JBL", name: "JBL Partybox 720 800W Party Speaker", specs: "800W RMS, 2x9\" Woofers, Bluetooth, USB-C, Dual XLR", sale: 103000, regular: 125000, image: `${IMG}/speaker/jbl/partybox-720/partybox-720-01-228x228.webp` },
    { brand: "JBL", name: "JBL Xtreme 5", specs: "Up to 130W, AI Sound Boost, Multi-Speaker Pairing, IP68, 28 hrs", sale: 38500, regular: 41999, image: `${IMG}/speaker/jbl/xtreme-5/xtreme-5-black-01-228x228.webp` },
  ],
  "ceiling-fan": [
    { brand: "Pakhtun", name: "Pakhtun Sultan 52\" Ceiling Fan", specs: "52\", Corded Electric, Regulator Speed Control", sale: 12500, regular: 15500 },
    { brand: "Qulik", name: "Qulik Aero-X 54\" Decorative BLDC Ceiling Fan With Remote", specs: "54\" (1370mm), Air Delivery 260 CMM, BLDC, Remote", sale: 19845, regular: 27950 },
    { brand: "Atomberg", name: "Atomberg Aris Starlight 56\" Ceiling Fan with Light and Remote", specs: "56\", 43W BLDC Motor, Light + Remote, Silent", sale: 20090, regular: 24500 },
    { brand: "Pakhtun", name: "Pakhtun Khalifa 52\" BLDC Inverter Ceiling Fan With Remote", specs: "52\", BLDC Inverter, Remote Control", sale: 13500, regular: 17750 },
    { brand: "Qulik", name: "Qulik Alpha Edge 4B 53\" Decorative Ceiling Fan With Remote", specs: "53\" (1330mm), 250 RPM, Air Delivery 260 CMM, Remote", sale: 18167, regular: 27950 },
    { brand: "Orient", name: "Orient Quasar Ornamental Chocolate 24\" Ceiling Fan", specs: "24\", Power 68W, Ornamental Finish", sale: 6499, regular: 7999 },
    { brand: "Qulik", name: "Qulik Aerovane 52\" Decorative Silent Ceiling Fan With Remote", specs: "52\", Silent, Remote Control", sale: 17050, regular: 27500 },
    { brand: "Qulik", name: "Qulik Silex 54\" Decorative Silent Ceiling Fan With Light and Remote", specs: "54\", Metal Plate, Copper Motor, Light + Remote", sale: 23500, regular: 25000 },
    { brand: "Pakhtun", name: "Pakhtun PK-127 16\" High Speed Ceiling Mount Fan", specs: "16\", 1350 RPM, 5 Speeds, No Remote", sale: 6500, regular: 7500 },
    { brand: "Breezelux", name: "Breezelux BL-2502 52\" Decorative Silent Ceiling Fan With Light and Remote", specs: "52\", 5 ABS Blades, DC Motor <40W, Multi-color LED + Remote", sale: 19900, regular: 39800 },
    { brand: "Havells", name: "Havells Enticer 56\" Ceiling Fan", specs: "56\", Induction Motor 290 RPM, Air Delivery 250 CMM, Remote", sale: 10500, regular: 10500 },
    { brand: "Orient", name: "Orient Jazz Art 56\" Ceiling Fan", specs: "56\", Copper Motor 320 RPM, Power 75W", sale: 9500 },
    { brand: "Walton", name: "Walton Ceiling Fan WCF5601 EM (56\")", specs: "1400mm (56\"), 310 RPM, 75W, Air Delivery 250 m³/min", sale: 4408 },
    { brand: "Walton", name: "Walton Safe Premium Ceiling Fan SCF56A (56\")", specs: "1400mm (56\"), 310 RPM, 75W, Air Delivery 240 m³/min", sale: 4959 },
    { brand: "Vision", name: "Vision Elegant Ceiling Fan 56\"", specs: "56\", 3 Aluminium Blades, 320 RPM, 80W, 7-year Warranty", sale: 3999 },
    { brand: "Vision", name: "Vision Super Ceiling Fan Ivory 56\"", specs: "56\", Colour Ivory, Regulator Included", sale: 3895 },
    { brand: "Walton", name: "Walton WCF5605 56\" Popular Ceiling Fan", specs: "56\", 3 Blades, 310 RPM, 80W, Copper Coil", sale: 3300 },
    { brand: "Orient", name: "Orient 56\" Gratia Ceiling Fan Bronze Copper", specs: "56\", 320 RPM, Remote Control, 12-month Warranty", sale: 5859 },
    { brand: "Orient", name: "Orient 56\" Quadro Ornamental Ceiling Fan Ivory", specs: "56\", 4 Blades, Dust Resistant, Button Control", sale: 6799 },
    { brand: "Akij", name: "Akij Ceiling Fan 56\" Model Classy", specs: "56\", 3 Blades, 310 RPM, 7-year Warranty", sale: 5000 },
  ],
  "deep-freezer": [
    { brand: "Haier", name: "Haier HCF-230SGE 200L Deep Freezer", specs: "200L, 10-yr Compressor, 2-yr Parts Warranty", sale: 44500, regular: 51400, image: `${IMG}/appliance/refrigerator/haier/hcf-230ge/hcf-230ge-official-01-228x228.webp` },
    { brand: "Hisense", name: "Hisense BD240 240L Deep Freezer", specs: "240L, ST Climate Class, 12-yr Inverter Compressor Warranty", sale: 40500, regular: 45900 },
    { brand: "Hisense", name: "Hisense BD189BLU 189L Deep Freezer", specs: "189L, ST Climate Class, Interior Glass Door, 12-yr Warranty", sale: 34000, regular: 40900 },
    { brand: "Hisense", name: "Hisense BD189BLK 189L Deep Freezer", specs: "189L, ST Climate Class, 12-yr Compressor Warranty", sale: 34000, regular: 37900 },
    { brand: "Rangs", name: "Rangs RCF-335DFV 335L Deep Freezer", specs: "335L Chest, Rapid Freezing, LED Light, 10-yr Compressor", sale: 46170, regular: 48600 },
    { brand: "Rangs", name: "Rangs RCF-175GD 175L Glass Door Deep Freezer Yellow", specs: "175L, Glass Door, Copper Condenser, 10-yr Compressor", sale: 33535, regular: 35300 },
    { brand: "Rangs", name: "Rangs RCF-275GD 275L Glass Door Deep Freezer", specs: "275L, Glass Door, Direct Cool, 10-yr Compressor", sale: 43985, regular: 46300 },
    { brand: "LG", name: "LG 291L Deep Freezer (GCFB305BQCF.ADVQRIL)", specs: "Gross 291L / Net 273L Chest, R600a, Hidden Hinges", sale: 64000, regular: 72900 },
    { brand: "LG", name: "LG 243L Deep Freezer (GCFB255BQCF.ADVQRIL)", specs: "Capacity 243L Chest", sale: 56000 },
    { brand: "LG", name: "LG 194L Deep Freezer (GCFB205BQCF.ADVQRIL)", specs: "Capacity 194L Chest", sale: 50000 },
    { brand: "Haier", name: "Haier HCF-340SM 301L Deep Freezer", specs: "301L, 10-yr Compressor, 2-yr Parts Warranty", sale: 48708, regular: 59400 },
    { brand: "Haier", name: "Haier HCF-420SME 369L Deep Freezer", specs: "Capacity 369L", sale: 63291 },
    { brand: "Samsung", name: "Samsung RI70F29V1G/AGH 287L Deep Freezer", specs: "Capacity 287L", sale: 48433 },
    { brand: "Sharp", name: "Sharp SJC-328-GY 310 Liters Deep Freezer", specs: "Capacity 310L", sale: 72000 },
    { brand: "SMART", name: "SMART SEF-250CS 250L Glass Door Deep Freezer", specs: "250L, Glass Door", sale: 40500 },
    { brand: "SMART", name: "SMART SEF-150CS 150L Glass Door Deep Freezer", specs: "150L, Glass Door", sale: 29000 },
  ],
  "cctv-smart-home": [
    { brand: "Dahua", name: "Dahua DH-IPC-HFW1230S1-A 2MP 30M IR Bullet Network Camera", specs: "2MP, 3.6mm lens, 30m IR, PoE, IP67, smart detection", sale: 3250, regular: 3500, image: `${IMG}/ip-camera/dahua/dh-ipc-hfw1230s1-a/dh-ipc-hfw1230s1-a-228x228.webp` },
    { brand: "Jovision", name: "Jovision JVS-N936-MDL 3MP Full-Color Audio PoE Dome IP Camera", specs: "3MP, 2.8mm lens, 30m IR full-color, mic & speaker", sale: 3500, image: `${IMG}/ip-camera/jovision/jvs-n936-mdl/jvs-n936-mdl-01-228x228.webp` },
    { brand: "Dahua", name: "Dahua DH-IPC-T1E29-A-IL 2MP Dual Light Fixed-focal Eyeball IP Camera", specs: "2MP, 30m IR dual light, PoE, IP67, mic", sale: 3500, image: `${IMG}/ip-camera/dahua/dh-ipc-t1e29-a-il/dh-ipc-t1e29-a-il-01-228x228.webp` },
    { brand: "Dahua", name: "Dahua DH-IPC-B1E29-A-IL 2MP Smart Dual Light Bullet IP Camera", specs: "2MP, 3.6mm lens, 30m IR dual light, IP67", sale: 3500, image: `${IMG}/ip-camera/dahua/dh-ipc-b1e29-a-il-2mp/dh-ipc-b1e29-a-il-2mp-01-228x228.webp` },
    { brand: "Jovision", name: "Jovision JVS-N916-MDL 3MP Full-Color Bullet IP Camera", specs: "3MP, up to 50m IR warm light, mic, IP67", sale: 3500, image: `${IMG}/ip-camera/jovision/jvs-n916-mdl/jvs-n916-mdl-01-228x228.webp` },
    { brand: "TP-Link", name: "TP-Link VIGI C330I 3MP 4mm Lens IR Bullet IP Camera", specs: "3MP, 4mm lens, 30m IR, PoE, IP67, smart detection", sale: 2750, regular: 3600, image: `${IMG}/ip-camera/tp-link/vigi-c320i/vigi-c320i-01-228x228.webp` },
    { brand: "TP-Link", name: "TP-Link VIGI C230I 3MP 4mm Lens IR Dome IP Camera", specs: "3MP, 4mm lens, 45m IR, PoE, IP67, IK10", sale: 3600, image: `${IMG}/ip-camera/tp-link/vigi-c220i/vigi-c220i-01-228x228.webp` },
    { brand: "Uniview", name: "Uniview IPC3613LB-AF28K-G 3MP HD IR Fixed Eyeball IP Camera", specs: "3MP, 2.8mm/4mm lens, 30m IR, PoE, mic", sale: 3050, regular: 3650, image: `${IMG}/ip-camera/uniview/ipc3613lb-af28k-g/ipc3613lb-af28k-g-01-228x228.webp` },
    { brand: "Hikvision", name: "Hikvision DS-2CE70KF0T-LMFS 5MP 3K ColorVu Audio Fixed Turret Camera", specs: "5MP 3K 24/7 color, 20m IR, audio", sale: 3650, image: `${IMG}/cc-camera/hikvision/ds-2ce70kf0t-lmfs/ds-2ce70kf0t-lmfs-01-228x228.webp` },
    { brand: "Imou", name: "Imou Bullet 2E 3MP Outdoor WiFi IP Camera", specs: "3MP, Wi-Fi, 30m night vision, IP67, 8x digital zoom", sale: 3690, image: `${IMG}/ip-camera/dahua/ipc-k3dp-3h0wf/ipc-k3dp-3h0wf-01-228x228.webp` },
    { brand: "IMILAB", name: "IMILAB C21 2.5K Pan & Tilt Portable WiFi Camera", specs: "2.5K, 6x zoom, Pan & tilt, person tracking, two-way audio", sale: 3100, regular: 3699, image: `${IMG}/ip-camera/imilab/c21/c21-01-228x228.webp` },
    { brand: "Dahua", name: "Dahua DH-IPC-HFW1230V-A-I4-B 2MP IR Bullet IP Camera", specs: "2MP, 3.6mm lens, 50m IR, PoE, IP67", sale: 3700, image: `${IMG}/ip-camera/dahua/dh-ipc-hfw1230v-a-i4-b/dh-ipc-hfw1230v-a-i4-b-01-228x228.webp` },
    { brand: "Uniview", name: "Uniview IPC2122LB-SF40-A 2MP IR Mini IP Bullet Camera", specs: "2MP, 4mm lens, 30m IR, PoE, IP67", sale: 2900, regular: 3790, image: `${IMG}/ip-camera/uniview/ipc2122lb-sf40-a/ipc2122lb-sf40-a-01-228x228.webp` },
    { brand: "Tenda", name: "Tenda TC3T24C 4MP Smart Full-Color Turret IP Camera", specs: "4MP, 30m IR full-color, PoE, Human/vehicle detection", sale: 3800, image: `${IMG}/ip-camera/tenda/tc3t24c/tc3t24c-01-228x228.webp` },
    { brand: "Dahua", name: "Dahua HAC-HFW1500TLMP-IL-A 5MP Smart Dual Light HDCVI Bullet CC Camera", specs: "5MP HDCVI, 40m IR dual light, IP67, mic", sale: 3850, image: `${IMG}/cc-camera/dahua/hac-hfw1500tlmp-il-a/hac-hfw1500tlmp-il-a-01-228x228.webp` },
    { brand: "Hikvision", name: "Hikvision DS-2CD1323G2-LIU 2MP Smart Hybrid Light Fixed Turret Network Camera", specs: "2MP, 2.8mm lens, 30m IR hybrid light, mic", sale: 3938, image: `${IMG}/ip-camera/hikvision/ds-2cd1323g2-liu/ds-2cd1323g2-liu-01-228x228.webp` },
    { brand: "Uniview", name: "Uniview XVR301-04F 4 Chanel 1 SATA XVR", specs: "4-channel XVR, 1 SATA up to 6TB, HDMI & VGA out", sale: 2900, regular: 4000, image: `${IMG}/xvr/uniview/xvr301/xvr301-228x228.webp` },
    { brand: "ZKTeco", name: "ZKTeco D0BPA Smart WiFi Video Door Bell", specs: "2MP, Wi-Fi, Two-way audio, Human detection, weatherproof", sale: 7100, regular: 7500, image: `${IMG}/door-bell/zkteco/d0bpa/d0bpa-01-228x228.webp` },
    { brand: "Meari", name: "Meari B1 Smart Video Doorbell", specs: "2K, 33ft night vision, Two-way audio, Google/Alexa, IP65", sale: 7575, image: `${IMG}/door-bell/meari/b1-/b1-01-228x228.webp` },
    { brand: "Hikvision", name: "Hikvision DS-KIS204T Video Smart Door Bell", specs: "7\" color TFT indoor screen, 1080p camera, Night vision", sale: 9800, regular: 10000, image: `${IMG}/access-control-/hikvision/ds-kis204t/ds-kis204t-0001-228x228.webp` },
  ],
  earbuds: [
    { brand: "Jiayou", name: "Jiayou Tune 6", specs: "13mm dynamic driver, Bluetooth 6.0, Up to 8 hrs use", sale: 585, regular: 640, image: `${IMG}/earbuds/jiayou/tune-6/tune-6-01-228x228.webp` },
    { brand: "Hoco", name: "Hoco EQ33", specs: "13mm driver, Bluetooth 5.4, Up to 7 hrs playback", sale: 850, regular: 930, image: `${IMG}/earbuds/hoco/eq33/eq33-01-228x228.webp` },
    { brand: "Haylou", name: "Haylou HQ5", specs: "-28dB ANC, 4-mic ENC, Bluetooth 6.0, IPX4", sale: 860, regular: 940, image: `${IMG}/earbuds/haylou/hq5/haylou-hq5-white-01-228x228.webp` },
    { brand: "FONENG", name: "FONENG BL135 Wireless Earbuds", specs: "Bluetooth 5.3, Up to 12 hrs music, Half-in-ear design", sale: 900, regular: 980, image: `${IMG}/earbuds/foneng/bl135/bl135-01-228x228.webp` },
    { brand: "Awei", name: "Awei T28 Pro TWS Gaming Earbuds", specs: "7-color RGB, Game mode, IPX6, Up to 7 hrs, Type-C", sale: 940, regular: 1020, image: `${IMG}/earbuds/awei/t28-pro/t28-pro-01-228x228.webp` },
    { brand: "Hoco", name: "Hoco EQ34 Plus", specs: "ANC + ENC, Bluetooth 5.4, custom EQ app support", sale: 940, regular: 1030, image: `${IMG}/earbuds/hoco/eq34-plus/eq34-plus-02-228x228.webp` },
    { brand: "CHARG", name: "CHARG Pods Pro 3 Earbuds", specs: "13mm dynamic drivers, Bluetooth 6.0, Touch control, fast charging", sale: 990, regular: 1050, image: `${IMG}/earbuds/charg/pods-pro-3/pods-pro-3-228x228.webp` },
    { brand: "XO", name: "XO G28", specs: "13mm dynamic driver, Bluetooth 5.4, ~4 hrs use", sale: 975, regular: 1050, image: `${IMG}/earbuds/xo-/g28/g28-04-228x228.webp` },
    { brand: "WiWU", name: "WiWU Airbuds 5", specs: "Bluetooth 5.4, ~4.5 hrs use, Auto in-ear detection", sale: 1000, regular: 1099, image: `${IMG}/earbuds/wiwu/airbuds-5/airbuds-5-white-01-228x228.webp` },
    { brand: "Choetech", name: "Choetech BH-T24 TWS Wireless Earbuds", specs: "Bluetooth 5.3, 13mm 32ohm speaker, 4 hrs playtime", sale: 1030, regular: 1120, image: `${IMG}/earbuds/choetech/bh-t24/bh-t24-0001-228x228.webp` },
    { brand: "Awei", name: "Awei T50", specs: "10mm driver, Bluetooth 5.3 ENC, Up to 6 hrs, IPX6, Type-C", sale: 1040, regular: 1140, image: `${IMG}/earbuds/awei/t50/t50-01-228x228.webp` },
    { brand: "Havit", name: "Havit H633BT Bluetooth Foldable Headphone", specs: "Over-ear, 40mm drivers, Foldable, Up to 22 hrs", sale: 1600, image: `${IMG}/headphone/havit/h633bt/havit-h633bt-bluetooth-headphone-01-228x228.webp` },
    { brand: "Hoco", name: "Hoco W114 Magic 4 Mode Gaming Headphone", specs: "4 sound modes, Bluetooth/USB-A/USB-C/3.5mm, mic", sale: 2700, image: `${IMG}/headphone/hoco/w114-magic/w114-magic-01-228x228.webp` },
    { brand: "Fantech", name: "Fantech WH01 Mint Edition Stereo Bluetooth Wireless Gaming Headphone", specs: "40mm drivers, Dual-mode low latency, Up to 60 hrs", sale: 4599, regular: 4800, image: `${IMG}/headphone/fantech/wh01/wh01-mint-edition-101-228x228.jpg` },
    { brand: "Hoco", name: "Hoco W55 Ultra Max Wireless Headphone", specs: "Bluetooth 5.4, 1200mAh, Up to 120 hrs, Built-in mic", sale: 1649, regular: 1900, image: `${IMG}/headphone/hoco/w55-ultra-max/w55-ultra-max-002-228x228.webp` },
    { brand: "Logitech", name: "Logitech G435 LIGHTSPEED Wireless & Bluetooth Gaming Headset", specs: "40mm drivers, LIGHTSPEED + Bluetooth, dual beamforming mics", sale: 7800, image: `${IMG}/headset/logitech/g435/g435-black-01-228x228.jpg` },
    { brand: "Awei", name: "Awei AT6 Stereo Wireless Bluetooth Headphone", specs: "Bluetooth 5.3 ANC, 500mAh, Up to 46 hrs", sale: 1099, regular: 1200, image: `${IMG}/headphone/awei/at6/at6-01-228x228.webp` },
    { brand: "ACEFAST", name: "ACEFAST H13 Wireless Bluetooth Headphone", specs: "40mm Hi-Fi driver, Bluetooth 6.0, Up to 60 hrs", sale: 1499, regular: 1600, image: `${IMG}/headphone/acefast/h13/h13-01-228x228.webp` },
    { brand: "Havit", name: "Havit H2590BT PRO Multi-Function Wireless Headphone", specs: "40mm speakers, 200mAh battery, ~14 hrs playtime", sale: 1200, image: `${IMG}/headphone/havit/h2590bt-pro/h2590bt-pro-01-228x228.webp` },
    { brand: "Havit", name: "Havit i62 Bluetooth 90 Degree Ergonomic Design Headphone", specs: "Dual 40mm drivers, 90° swiveling ear cups, Up to 8 hrs", sale: 1600, image: `${IMG}/headphone/havit/i62/i62-228x228.jpg` },
  ],
  "gaming-console": [
    { brand: "X6 (Generic)", name: "X6 Retro Handheld Gaming Console", specs: "3.5\" display, Quad-core, 2000mAh, 32GB, 11 emulator types", sale: 3600, image: `${IMG}/gaming-console/x6-retro/x6-retro-black-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M17 Handheld Gaming Console", specs: "4.3\" IPS, Quad-core Cortex-A7, 64/128GB microSD", sale: 5150, regular: 6500, image: `${IMG}/gaming-console/sjgam/m17/m17-01-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M31 Handheld Gaming Console", specs: "5.1\" IPS, Quad-core Cortex-A55, Mali G52, 3000mAh", sale: 6420, regular: 7500, image: `${IMG}/gaming-console/sjgam/m31/m31-02-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M18 Handheld Gaming Console", specs: "4.3\" IPS, RK3566 quad-core, 1GB, 4000mAh", sale: 6999, regular: 8000, image: `${IMG}/gaming-console/sjgam/m18/m18-grey-01-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M5 Gaming Console", specs: "TV stick, up to 4K output, Quad-core, 25+ emulators", sale: 6999, regular: 8500, image: `${IMG}/gaming-console/sjgam/m5-/sjgam-m5-01-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M27 Handheld Gaming Console", specs: "7\" IPS, RK3566 quad-core, 3000mAh", sale: 11490, regular: 13000, image: `${IMG}/gaming-console/sjgam/m27/m27-01-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M88 Stick Gaming Console", specs: "TV stick, up to 4K, Octa-core, Mali-G52, 30+ emulators", sale: 12499, regular: 14000, image: `${IMG}/gaming-console/sjgam/m88/m88-01-228x228.webp` },
    { brand: "SJGAM", name: "SJGAM M28 Handheld Gaming Console", specs: "7\" IPS, Octa-core, Mali-G52, 4000mAh", sale: 14490, regular: 16000, image: `${IMG}/gaming-console/sjgam/m28/m28-01-228x228.webp` },
    { brand: "Nintendo", name: "Nintendo Switch OLED Gaming Console", specs: "7\" OLED screen, 64GB storage, Enhanced audio, LAN port", sale: 44000, regular: 45000, image: `${IMG}/gaming-console/nintendo/nintendo-switch-oled-model-white-set/nintendo-switch-228x228.webp` },
    { brand: "Microsoft", name: "Microsoft Xbox One X Gaming Console", specs: "8-core Jaguar, 12GB GDDR5, 1TB, 4K@60Hz HDR10", sale: 65000, image: `${IMG}/gadget/gaming-console/xbox/microsoft/xbox-one-x/xbox-one-x-01-228x228.webp` },
    { brand: "Microsoft", name: "Microsoft Xbox Series S Gaming Console", specs: "Custom 8-core Zen 2, 10GB GDDR6, 512GB SSD, 1440p HDR", sale: 63490, regular: 68300, image: `${IMG}/gaming-console/microsoft/xbox-series-s/xbox-series-s-01-228x228.webp` },
    { brand: "Sony", name: "Sony PlayStation 5 Digital Edition Gaming Console", specs: "8-core Zen 2, GPU 10.28 TFLOPS, 4K gaming, Digital only", sale: 91000, regular: 96000, image: `${IMG}/gaming-console/playstation/playstation-5-digital-edition/ps5-digital-edition-01-228x228.webp` },
    { brand: "Sony", name: "Sony PlayStation 5 Slim Gaming Console", specs: "1TB SSD, Disc drive, Up to 120fps, ray tracing, 4K", sale: 101500, regular: 105000, image: `${IMG}/gaming-console/playstation/playstation-5-analog-console-slim-edition/playstation-01-228x228.webp` },
    { brand: "ASUS", name: "ASUS ROG Xbox Ally X Gaming Console", specs: "Ryzen AI Z2 Extreme, 24GB LPDDR5X, 1TB SSD, 7\" FHD touch", sale: 144900, regular: 149900, image: `${IMG}/gaming-console/asus/rog-xbox-ally-x/rog-xbox-ally-x-04-228x228.webp` },
    { brand: "Sony", name: "Sony PlayStation 5 Pro", specs: "2TB SSD, Advanced ray tracing PSSR, Up to 120fps, Wi-Fi 7", sale: 169900, image: `${IMG}/gaming-console/playstation/playstation-5-pro/playstation-5-pro-228x228.webp` },
    { brand: "Lenovo", name: "Lenovo Legion Go Gen 2", specs: "Ryzen Z2 Extreme, Radeon 890M, 32GB, 8.8\" OLED 144Hz", sale: 224500, regular: 180000, image: `${IMG}/gaming-console/lenovo/legion-go-gen-2/legion-go-gen-2-01-228x228.webp` },
    { brand: "Nintendo", name: "Nintendo Switch 2 Gaming Console", specs: "7.9\" LCD touch screen, 256GB, 4K HDR docked, 120fps", sale: 66790, regular: 250000, image: `${IMG}/gaming-console/nintendo/switch-2/nintendo-switch-2-1-228x228.webp` },
  ],
  geyser: [
    { brand: "Shameem", name: "Shameem Tropica 30 Litre Geyser (7 Gallon Standard)", specs: "30L, Glass-lined tank, magnesium anode, Fully automatic", sale: 9400, regular: 12000, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
    { brand: "Shameem", name: "Shameem Tropica 10 Gallon Standard Geyser (45 Litre)", specs: "45L, Glass-lined tank, magnesium anode, Fully automatic", sale: 10700, regular: 13500, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
    { brand: "Haier", name: "Haier 30 Litre Vertical Water Heater Geyser", specs: "30L, Vertical mount, 2200W, IPX4, shockproof", sale: 11500, regular: 13800, image: `${IMG}/appliance/geyser/haier/es30v-c2ug-bd/es30v-c2ug-bd-01-228x228.webp` },
    { brand: "Singer", name: "Singer SRWH-FGSSRED45L 45L Water Heater", specs: "45 L/hr output, 26L tank, 1500W, Heats in 10-12 min", sale: 11900, regular: 13900, image: `${IMG}/appliance/geyser/singer/srwh-fgssred45l/srwh-fgssred45l-official-01-228x228.webp` },
    { brand: "Singer", name: "Singer SRWH-FGSSBLK45L 45L Water Heater", specs: "45 L/hr output, 26L tank, 1500W, Heats in 10-12 min", sale: 11900, regular: 13900, image: `${IMG}/appliance/geyser/singer/srwh-fgssblk45l/srwh-fgssblk45l-official-01-228x228.webp` },
    { brand: "Shameem", name: "Shameem Tropica 30 Litre Geyser (7 Gallon Special)", specs: "30L, Silver-coated immersion element, Fully automatic", sale: 10500, regular: 14000, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
    { brand: "Haier", name: "Haier 40 Litre Water Heater Geyser", specs: "40L, Horizontal mount, 2200W, IPX4, shockproof", sale: 12000, regular: 14300, image: `${IMG}/appliance/geyser/haier/es40h-ck3-bd/es40h-ck3-bd-official-01-228x228.webp` },
    { brand: "Shameem", name: "Shameem Tropica 10 Gallon Special Geyser (45 Litre)", specs: "45L, Silver-coated immersion element, Fully automatic", sale: 12000, regular: 14500, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
    { brand: "Haier", name: "Haier 30 Litre Water Heater Geyser", specs: "30L, Horizontal mount, 2200W, IPX4, shockproof", sale: 10200, regular: 14500, image: `${IMG}/appliance/geyser/haier/es30h-ck3-bd/es30h-ck3-bd-official-01-228x228.webp` },
    { brand: "Rangs", name: "Rangs REG-35GL 35 Liter Geyser", specs: "35L, 2000W, Working pressure up to 8 bar, Auto stop", sale: 10900, regular: 14600, image: `${IMG}/appliance/geyser/rangs/reg-35gl/reg-35gl-official-02-228x228.webp` },
    { brand: "TESY", name: "TESY Compact Above Sink 10L Water Heater", specs: "10L, Above-sink mount, 1500W, ~20 min heat-up", sale: 13390, regular: 15000, image: `${IMG}/appliance/geyser/tesy/compact-above-sink-10l/compact-above-sink-10l-official-01-228x228.webp` },
    { brand: "TESY", name: "TESY Compact Under Sink 10L Water Heater", specs: "10L, Under-sink mount, 1500W, ~20 min heat-up", sale: 13390, regular: 15000, image: `${IMG}/appliance/geyser/tesy/compact-under-sink-10l/compact-under-sink-10l-official-01-228x228.webp` },
    { brand: "Shameem", name: "Shameem Tropica 15 Gallon Standard Geyser (67.5 Litre)", specs: "67.5L, Glass-lined tank, magnesium anode, Fully automatic", sale: 12500, regular: 15500, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
    { brand: "TESY", name: "TESY Compact Above Sink 15L Water Heater", specs: "15L, Above-sink mount, 1500W, ~31 min heat-up", sale: 13790, regular: 15500, image: `${IMG}/appliance/geyser/tesy/compact-above-sink-15l/compact-above-sink-15l-official-01-228x228.webp` },
    { brand: "TESY", name: "TESY Compact Under Sink 15L Water Heater", specs: "15L, Under-sink mount, 1500W, ~31 min heat-up", sale: 13790, regular: 15500, image: `${IMG}/appliance/geyser/tesy/compact-under-sink-15l/compact-under-sink-15l-official-01-228x228.webp` },
    { brand: "Haier", name: "Haier 50 Litre Water Heater Geyser", specs: "50L, Horizontal mount, 2200W, IPX4, shockproof", sale: 12990, regular: 15800, image: `${IMG}/appliance/geyser/haier/es50h-ck3-bd/es50h-ck3-bd-official-01-228x228.webp` },
    { brand: "Midea", name: "Midea 30 Liter Geyser (D30-15A6)", specs: "30L, Large copper heating element, Energy-saving design", sale: 11300, regular: 16000, image: `${IMG}/appliance/geyser/midea/d30-15a6/d30-15a6-official-01-228x228.webp` },
    { brand: "Rangs", name: "Rangs REG-45GL 45 Liter Geyser", specs: "45L, 2000W, Working pressure up to 8 bar, Auto stop", sale: 11900, regular: 16700, image: `${IMG}/appliance/geyser/rangs/reg-45gl/reg-45gl-official-02-228x228.webp` },
    { brand: "Midea", name: "Midea 40 Liter Geyser (D40-20A6)", specs: "40L, Large copper heating element, Energy-saving design", sale: 12490, regular: 17000, image: `${IMG}/appliance/geyser/midea/d40-20a6/d40-20a6-official-01-228x228.webp` },
    { brand: "Shameem", name: "Shameem Tropica 15 Gallon Special Geyser (67.5 Litre)", specs: "67.5L, Silver-coated immersion element, Fully automatic", sale: 14300, regular: 17000, image: `${IMG}/appliance/geyser/tropica/tropica/tropica-gallon-228x228.webp` },
  ],
  refrigerator: [
    { brand: "Singer", name: "Singer 157L Top Mount Refrigerator (FTDS155NSL)", specs: "157L top mount, R600a, tempered glass shelves", sale: 29000, regular: 35990, image: `${IMG}/appliance/refrigerator/singer/srref-ss300-ftds155nsl-bg/srref-ss300-ftds155nsl-bg-228x228.webp` },
    { brand: "Singer", name: "Singer 157L Top Mount Refrigerator Red (FTDS155NSL)", specs: "157L top mount red, R600a, tempered glass shelves", sale: 29000, regular: 35990, image: `${IMG}/appliance/refrigerator/singer/srref-ss300-ftds155nsl-rg/srref-ss300-ftds155nsl-rg-228x228.webp` },
    { brand: "Singer", name: "Singer 157L Top Mount Refrigerator (FTDS157)", specs: "157L top mount, R600a, ergonomic handle", sale: 29000, regular: 35990, image: `${IMG}/appliance/refrigerator/singer/srref-ss300-ftds157-werg/srref-ss300-ftds157-werg-228x228.webp` },
    { brand: "SMART", name: "SMART SER-150TS 150 Ltr Top Mount Refrigerator", specs: "150L top mount glass door, Direct cool, R600a", sale: 27000, regular: 40900, image: `${IMG}/appliance/refrigerator/smart/ser-150ts/ser-150ts-official-01-228x228.webp` },
    { brand: "Singer", name: "Singer 200L Top Mount Refrigerator Blue (FTDS200)", specs: "200L top mount blue, R600a, tempered glass shelves", sale: 34000, regular: 40990, image: `${IMG}/appliance/refrigerator/singer/ftds200/ftds200-blue-01-228x228.webp` },
    { brand: "Singer", name: "Singer 180L Top Mount Refrigerator (FTDS185NS)", specs: "180L top mount, R600a, low-voltage compressor", sale: 33000, regular: 40990, image: `${IMG}/appliance/refrigerator/singer/ftds185ns/ftds185ns-01-228x228.webp` },
    { brand: "Hisense", name: "Hisense RTDG236NADP/BD3 238L Glass Door Refrigerator", specs: "238L top mount, Glass door Dreamy Purple, 3 door racks", sale: 35900, regular: 42900, image: `${IMG}/appliance/refrigerator/hisense/rtdg236nadp-bd3/rtdg236nadp-bd3-official-05-228x228.webp` },
    { brand: "Whirlpool", name: "Whirlpool Fresh Magic Pro 236L GD Florina Red Refrigerator", specs: "236L direct cool, Glass exterior, Microblock & Active Deo", sale: 34500, regular: 44990, image: `${IMG}/appliance/refrigerator/whirlpool/fresh-magic-pro-236l-gd-florina-red/fresh-magic-228x228.webp` },
    { brand: "Whirlpool", name: "Whirlpool Fresh Magic Pro 236L Chromium Steel Refrigerator", specs: "236L direct cool, Steel exterior, Microblock & Active Deo", sale: 36500, regular: 45490, image: `${IMG}/appliance/refrigerator/whirlpool/fresh-magic-pro-236l-chromium-steel/fresh-magic-228x228.webp` },
    { brand: "SMART", name: "SMART SER-196BS 196 Ltr Glass Door Refrigerator", specs: "196L bottom mount glass door, Direct cool, R600a", sale: 34000, regular: 48900, image: `${IMG}/appliance/refrigerator/smart/ser-196bs/ser-196bs-official-01-228x228.webp` },
    { brand: "Whirlpool", name: "Whirlpool Fresh Magic Pro 236L GD Inv Mirror Refrigerator", specs: "236L direct cool, Mirror glass exterior, Microblock & Active Deo", sale: 44000, regular: 51990, image: `${IMG}/appliance/refrigerator/whirlpool/fresh-magic-pro-236l-gd-inv-mirror/fresh-magic-228x228.webp` },
    { brand: "Whirlpool", name: "Whirlpool Fresh Magic Pro 257L GD Florina Red Refrigerator", specs: "257L direct cool, Glass exterior, anti-fungal gasket", sale: 42000, regular: 50490, image: `${IMG}/appliance/refrigerator/whirlpool/fresh-magic-pro-257l-gd-florina-red/fresh-magic-228x228.webp` },
    { brand: "Hisense", name: "Hisense RTDG236NASR/BD3 238L Glass Door Refrigerator", specs: "238L top mount, Glass door Starry Red, 3 door racks", sale: 42000, regular: 50900, image: `${IMG}/appliance/refrigerator/hisense/rtdg236nasr-bd3/rtdg236nasr-bd3-official-06-228x228.webp` },
    { brand: "Singer", name: "Singer 252L Top Mount Refrigerator (FTDS257)", specs: "252L top mount, R600a, low-voltage compressor", sale: 42500, regular: 50990, image: `${IMG}/appliance/refrigerator/singer/ftds257/ftds257-01-228x228.webp` },
    { brand: "SMART", name: "SMART SER-216BS 216 Ltr Bottom Mount Refrigerator", specs: "216L bottom mount, Direct cool, R600a", sale: 36000, regular: 51900, image: `${IMG}/appliance/refrigerator/smart/ser-216bs/ser-216bs-official-01-228x228.webp` },
    { brand: "Kelvinator", name: "Kelvinator KRF-268T0G1AX 268 Liter Top Mount Refrigerator", specs: "268L top mount, Tempered glass door, No frost", sale: 41500, regular: 52000, image: `${IMG}/appliance/refrigerator/kelvinator/krf-268t0g1ax/krf-268t0g1ax-official-01-228x228.webp` },
    { brand: "Whirlpool", name: "Whirlpool Fresh Magic Pro 278L GD Florina Blue Refrigerator", specs: "278L direct cool, Glass exterior, Microblock & Active Deo", sale: 43000, regular: 52990, image: `${IMG}/appliance/refrigerator/whirlpool/fresh-magic-pro-236l-gd-florina-blue/fresh-magic-228x228.webp` },
    { brand: "Beko", name: "Beko BOREF-B500FTDS257ABG 252L Refrigerator", specs: "252L top mount, 5-star BSTI energy rating", sale: 44000, regular: 54990, image: `${IMG}/appliance/refrigerator/beko/boref-b500ftds257abg/boref-b500ftds257abg-01-228x228.webp` },
    { brand: "Singer", name: "Singer 272L Top Mount Refrigerator (FTDS277)", specs: "272L top mount red, R600a, low-voltage compressor", sale: 46000, regular: 54990, image: `${IMG}/appliance/refrigerator/singer/ftds277/ftds277-red-01-228x228.webp` },
    { brand: "SMART", name: "SMART SER-240TS 240 Ltr Top Mount Refrigerator", specs: "240L top mount, Direct cool, R600a, Copper condenser", sale: 43900, regular: 55900, image: `${IMG}/appliance/refrigerator/smart/ser-240ts/ser-240ts-official-01-228x228.webp` },
    { brand: "Haier", name: "Haier HRF-488IFFB 488L No Frost Refrigerator", specs: "488L no frost, Twin inverter, Double Magic Zone", sale: 95000, regular: 107900, image: `${IMG}/appliance/refrigerator/haier/hrf-488iffb/hrf-488iffb-01-228x228.webp` },
    { brand: "Haier", name: "Haier HRF-475VMB 488L No Frost Refrigerator", specs: "488L no frost, Twin inverter, humidity zone", sale: 88000, regular: 110000, image: `${IMG}/appliance/refrigerator/haier/hrf-475vmb/hrf-475vmb-01-228x228.webp` },
    { brand: "Haier", name: "Haier HRF-518IFFB 518L No Frost Refrigerator", specs: "522L listed, no frost, Twin inverter, Double Magic Zone", sale: 100000, regular: 114900, image: `${IMG}/appliance/refrigerator/haier/hrf-518iffb/hrf-518iffb-01-228x228.webp` },
    { brand: "Haier", name: "Haier HRF-500VMB 518L No Frost Refrigerator", specs: "518L no frost, Twin inverter, humidity zone", sale: 93000, regular: 120000, image: `${IMG}/appliance/refrigerator/haier/hrf-500vmb/hrf-500vmb-01-228x228.webp` },
    { brand: "Haier", name: "Haier HRF-622ICG 600L Side-by-Side Refrigerator", specs: "600L side-by-side, No frost, Twin inverter, Digital display", sale: 129500, regular: 144900, image: `${IMG}/appliance/refrigerator/haier/hrf-622icg/product-01-228x228.webp` },
  ],
  laptop: [
    { brand: "Apple", name: "MacBook Air M5 Chip 13-inch", specs: "Apple M5, 16GB unified memory, 512GB SSD, 13.6\" Liquid Retina", sale: 161500, regular: 175000, image: `${IMG}/laptop/apple/macbook-air-13-m4/sky-blue/macbook-air-13-m4-sky-blue-01-228x228.webp` },
    { brand: "MSI", name: "MSI Raider 18 HX AI A2XWJG Gaming Laptop", specs: "Core Ultra 9 285HX, RTX 5090 24GB, 32GB DDR5, 2TB SSD, 18\" MiniLED 120Hz", sale: 630000, regular: 650000, image: `${IMG}/laptop/msi/raider-18-hx-ai-a2xwig/raider-18-hx-ai-a2xwig-08-228x228.webp` },
    { brand: "Walton", name: "Walton Prelude N41 Pro Celeron N4120 14\" FHD Laptop", specs: "Celeron N4120, 8GB DDR4, 256GB SSD, 14\" FHD, Bangla keyboard", sale: 28500, regular: 33900, image: `${IMG}/laptop/walton/prelude-n41-pro/prelude-n41-pro-01-228x228.webp` },
    { brand: "Walton", name: "Walton Prelude N50 Pro Pentium Silver N5030 14\" FHD Laptop", specs: "Pentium Silver N5030, 8GB DDR4, 256GB SSD, 14\" FHD", sale: 31000, regular: 34500, image: `${IMG}/laptop/walton/prelude-n41-pro/prelude-n41-pro-01-228x228.webp` },
    { brand: "Chuwi", name: "Chuwi HeroBook Pro 14.1\" Full HD Laptop with Windows 11", specs: "Celeron N4020, 8GB LPDDR4, 256GB SSD, 14.1\" FHD IPS", sale: 35000, image: `${IMG}/laptop/chuwi/herobook/herobook-pro/herobook-pro-1-228x228.jpg` },
    { brand: "Chuwi", name: "Chuwi HeroBook Plus 15.6\" Inch FHD Laptop", specs: "Celeron N4020, 8GB LPDDR4, 256GB SSD, 15.6\" FHD IPS anti-glare", sale: 38000, image: `${IMG}/laptop/chuwi/herobook-plus/herobook-plus-002-228x228.webp` },
    { brand: "Chuwi", name: "Chuwi GemiBook XPro Intel Celeron N100 14.1\" FHD Laptop", specs: "Intel N100, 8GB DDR4, 256GB SSD, 14.1\" FHD IPS, Wi-Fi 6", sale: 39500, image: `${IMG}/laptop/chuwi/gemibook-xpro/gemibook-xpro-01-228x228.webp` },
    { brand: "Chuwi", name: "Chuwi CoreBook Core i3 10th Gen 14\" FHD Laptop", specs: "Core i3-10100Y, 8GB RAM, 256GB NVMe SSD, 14\" FHD IPS, Wi-Fi 6", sale: 42000, image: `${IMG}/laptop/chuwi/corebook-i3/corebook-i3-01-228x228.webp` },
    { brand: "Walton", name: "Walton Passion BX710U Core i7 10th Gen 15.6\" FHD Laptop", specs: "Core i7-10510U, 8GB RAM, 512GB SSD, 15.6\" FHD", sale: 59500, image: `${IMG}/laptop/walton/passion-bx310u/passion-bx310u-01-228x228.jpg` },
    { brand: "Acer", name: "Acer Aspire 3 A325-42-V2 Ryzen 3 5300U 15.6\" FHD Laptop", specs: "Ryzen 3 5300U, 8GB DDR4, 256GB NVMe SSD, 15.6\" FHD IPS, Wi-Fi 6", sale: 57000, image: `${IMG}/laptop/acer/a325-42-v2/a325-42-v2-01-228x228.webp` },
    { brand: "Smart", name: "Smart Flairedge Core i5 13th Gen 15.6\" FHD Laptop", specs: "Core i5-1335U, 8GB DDR4, 512GB NVMe SSD, 15.6\" FHD anti-glare, Backlit keyboard", sale: 60000, regular: 62500, image: `${IMG}/laptop/smart/flairedge/flairedge-grey-01-228x228.webp` },
    { brand: "Walton", name: "Walton TAMARIND EX3US1 Core 3 100U 14\" FHD Laptop", specs: "Core 3 100U, 8GB DDR4, 512GB NVMe SSD, 14\" FHD matte, Wi-Fi 6", sale: 61000, regular: 63500, image: `${IMG}/laptop/walton/tamarind-ex3us1-core/tamarind-ex3us1-core-01-228x228.webp` },
    { brand: "Acer", name: "Acer Aspire 3 A324-53-C3 Core 3 100U 14\" FHD Laptop", specs: "Core 3 100U, 8GB DDR4, 256GB NVMe SSD, 14\" FHD IPS, Wi-Fi 6", sale: 67900, image: `${IMG}/laptop/acer/a324-53-c3/a324-53-c3-01-228x228.webp` },
    { brand: "Acer", name: "Acer Aspire 3 A325-53-i3 Core i3 13th Gen 15.6\" FHD Laptop", specs: "Core i3-1305U, 8GB DDR4, 512GB NVMe SSD, 15.6\" FHD IPS, Wi-Fi 6", sale: 71900, image: `${IMG}/laptop/acer/a325-53-i3/a325-53-i3-05-228x228.webp` },
    { brand: "Lenovo", name: "Lenovo IdeaPad 1 15AMN7 Ryzen 3 7320U 15.6\" FHD IPS Laptop", specs: "Ryzen 3 7320U, 16GB LPDDR5, 512GB NVMe SSD, 15.6\" FHD IPS, Privacy shutter", sale: 72500, image: `${IMG}/laptop/lenovo/ideapad-1-15amn7/ideapad-1-15amn7-001-228x228.webp` },
    { brand: "Dell", name: "Dell Pro 15 Essential PV15250 Core 3 100U 15.6\" FHD Laptop", specs: "Core 3 100U, 8GB DDR5, 512GB NVMe SSD, 15.6\" FHD 120Hz IPS, Wi-Fi 6", sale: 81000, image: `${IMG}/laptop/dell/pro-15-essential-pv15250/pro-15-essential-pv15250-01-228x228.webp` },
    { brand: "Acer", name: "Acer Aspire Lite AL15-41 AMD Ryzen 5 5625U 15.6\" FHD Laptop", specs: "Ryzen 5 5625U, 16GB DDR4, 512GB NVMe SSD, 15.6\" FHD, Metal body, RJ45", sale: 74490, image: `${IMG}/laptop/acer/aspire-lite-al15-41-0/aspire-lite-al15-41-1-228x228.webp` },
  ],
};

function slugFor(brand: string, name: string): string {
  return slugify(`${brand} ${name}`).slice(0, 180);
}

async function wipeCatalog() {
  console.log("Wiping existing catalogue (cascades reviews/problems/solutions/service/Q&A/saved/follows/price data)…");
  await db.delete(comments);
  await db.delete(votes);
  await db.delete(contentReports);
  await db.delete(contentTranslations);
  await db.delete(products); // cascades everything product-scoped
  await db.delete(categories);
  await db.delete(brands);
  console.log("Catalogue wiped.");
}

async function ensureCategory(c: CategorySeed): Promise<string> {
  const [row] = await db
    .insert(categories)
    .values({ slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, icon: c.slug })
    .returning({ id: categories.id });
  console.log(`  + category ${c.slug}`);
  return row!.id;
}

async function ensureBrand(name: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const slug = slugify(name);
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug)).limit(1);
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }
  const [row] = await db.insert(brands).values({ slug, name }).returning({ id: brands.id });
  cache.set(name, row!.id);
  console.log(`  + brand ${name}`);
  return row!.id;
}

async function main() {
  await wipeCatalog();

  console.log("Seeding real catalogue (Star Tech + others, collected 2026-10-11)…");
  const brandCache = new Map<string, string>();
  let tintIdx = 0;

  for (const c of CATEGORIES) {
    const categoryId = await ensureCategory(c);
    const color = TINTS[tintIdx++ % TINTS.length]!;
    const items = PRODUCTS[c.slug] ?? [];
    for (const p of items) {
      const brandId = await ensureBrand(p.brand, brandCache);
      const slug = slugFor(p.brand, p.name);
      const priceMin = p.sale;
      const priceMax = p.regular && p.regular > p.sale ? p.regular : p.sale;

      const [prod] = await db
        .insert(products)
        .values({
          slug,
          categoryId,
          brandId,
          name: p.name,
          modelNo: null,
          status: "active",
          priceMin,
          priceMax,
          warrantyText: null,
          spec: { "Key Specs": p.specs },
          primaryImage: p.image ?? null,
        })
        .returning({ id: products.id });

      if (p.image) {
        await db.insert(productImages).values({ productId: prod!.id, url: p.image, sort: 0 });
      }
      console.log(`  + ${c.slug}: ${p.name}`);
    }
  }

  console.log("Done.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
