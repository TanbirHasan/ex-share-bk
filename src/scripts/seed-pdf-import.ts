import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../db/client";
import { brands, categories, productImages, products } from "../db/schema";
import { slugify } from "../lib/slug";

/**
 * Bulk-imports the "400 Popular Electrical Products" list (household +
 * industrial) supplied by the user as a reference PDF (Oct 2026). Source has
 * no pricing ("prices change often, check the seller") — priceMin/priceMax
 * are intentionally left null rather than invented; the existing crowd
 * price-reporting feature can fill these in organically. "Key specs" is one
 * free-text cell per row in the source, stored as a single spec field rather
 * than guessed-at structured fields. Industrial rows also get a "Type" spec
 * field since brand+model alone doesn't say what the equipment is.
 *
 * Idempotent — re-running skips anything already present by slug.
 *   cd backend && yarn tsx src/scripts/seed-pdf-import.ts
 */

type CategorySeed = { slug: string; nameEn: string; nameBn: string; icon: string };
type Row = { brandModel: string; specs: string; type?: string };

const TINTS = ["eef2f7", "f0edf7", "eaf0f6", "f6f0e8"];

const CATEGORIES: CategorySeed[] = [
  // Already exist in the catalogue (seeded earlier) — nameEn/nameBn/icon
  // here are unused placeholders since EXISTING_CATEGORY_SLUGS makes
  // runGroup() look the category up by slug instead of creating it.
  { slug: "mobile-phone", nameEn: "Mobile Phone", nameBn: "মোবাইল ফোন", icon: "mobile-phone" },
  { slug: "smartwatch", nameEn: "Smartwatch", nameBn: "স্মার্টওয়াচ", icon: "smartwatch" },
  { slug: "earbuds", nameEn: "Earbuds & Headphones", nameBn: "ইয়ারবাড ও হেডফোন", icon: "earbuds" },
  { slug: "power-bank", nameEn: "Power Bank", nameBn: "পাওয়ার ব্যাংক", icon: "power-bank" },
  { slug: "speaker", nameEn: "Bluetooth Speaker", nameBn: "ব্লুটুথ স্পিকার", icon: "speaker" },
  { slug: "laptop", nameEn: "Laptop", nameBn: "ল্যাপটপ", icon: "laptop" },
  { slug: "television", nameEn: "Television", nameBn: "টেলিভিশন", icon: "television" },
  { slug: "washing-machine", nameEn: "Washing Machine", nameBn: "ওয়াশিং মেশিন", icon: "washing-machine" },
  { slug: "air-fryer", nameEn: "Air Fryer", nameBn: "এয়ার ফ্রায়ার", icon: "air-fryer" },
  { slug: "sewing-machine", nameEn: "Sewing Machine", nameBn: "সেলাই মেশিন", icon: "sewing-machine" },
  { slug: "tablet", nameEn: "Tablet", nameBn: "ট্যাবলেট", icon: "tablet" },
  { slug: "monitor", nameEn: "Monitor", nameBn: "মনিটর", icon: "monitor" },
  { slug: "printer", nameEn: "Printer", nameBn: "প্রিন্টার", icon: "printer" },
  { slug: "wifi-router", nameEn: "Wi-Fi Router", nameBn: "ওয়াই-ফাই রাউটার", icon: "wifi-router" },
  { slug: "gaming-console", nameEn: "Gaming Console", nameBn: "গেমিং কনসোল", icon: "gaming-console" },
  { slug: "refrigerator", nameEn: "Refrigerator", nameBn: "রেফ্রিজারেটর", icon: "refrigerator" },
  { slug: "deep-freezer", nameEn: "Deep Freezer", nameBn: "ডিপ ফ্রিজার", icon: "deep-freezer" },
  { slug: "air-conditioner", nameEn: "Air Conditioner", nameBn: "এয়ার কন্ডিশনার", icon: "air-conditioner" },
  { slug: "microwave-oven", nameEn: "Microwave Oven", nameBn: "মাইক্রোওয়েভ ওভেন", icon: "microwave" },
  { slug: "rice-cooker", nameEn: "Rice Cooker", nameBn: "রাইস কুকার", icon: "rice-cooker" },
  { slug: "blender-mixer", nameEn: "Blender & Mixer Grinder", nameBn: "ব্লেন্ডার ও মিক্সার গ্রাইন্ডার", icon: "blender-mixer" },
  { slug: "induction-cooker", nameEn: "Induction Cooker", nameBn: "ইন্ডাকশন কুকার", icon: "induction-cooker" },
  { slug: "kettle-toaster-coffee", nameEn: "Kettle, Toaster & Coffee Maker", nameBn: "কেটলি, টোস্টার ও কফি মেকার", icon: "kettle-toaster-coffee" },
  { slug: "water-purifier", nameEn: "Water Purifier", nameBn: "ওয়াটার পিউরিফায়ার", icon: "water-purifier" },
  { slug: "ceiling-fan", nameEn: "Ceiling Fan", nameBn: "সিলিং ফ্যান", icon: "fan" },
  { slug: "rechargeable-fan", nameEn: "Rechargeable Fan", nameBn: "রিচার্জেবল ফ্যান", icon: "fan" },
  { slug: "geyser", nameEn: "Geyser", nameBn: "গিজার", icon: "geyser" },
  { slug: "iron-steamer", nameEn: "Iron & Garment Steamer", nameBn: "ইস্ত্রি ও গার্মেন্টস স্টিমার", icon: "iron-steamer" },
  { slug: "vacuum-cleaner", nameEn: "Vacuum Cleaner", nameBn: "ভ্যাকুয়াম ক্লিনার", icon: "vacuum-cleaner" },
  { slug: "hair-dryer-straightener", nameEn: "Hair Dryer & Straightener", nameBn: "হেয়ার ড্রায়ার ও স্ট্রেইটনার", icon: "hair-dryer-straightener" },
  { slug: "trimmer-shaver", nameEn: "Trimmer & Shaver", nameBn: "ট্রিমার ও শেভার", icon: "trimmer-shaver" },
  { slug: "health-devices", nameEn: "Health Devices", nameBn: "স্বাস্থ্য যন্ত্র", icon: "health-devices" },
  { slug: "led-light", nameEn: "LED Light", nameBn: "এলইডি লাইট", icon: "led-light" },
  { slug: "ips-ups", nameEn: "IPS & UPS", nameBn: "আইপিএস ও ইউপিএস", icon: "power-bank" },
  { slug: "cctv-smart-home", nameEn: "CCTV & Smart Home", nameBn: "সিসিটিভি ও স্মার্ট হোম", icon: "cctv-smart-home" },
  // Industrial (Part B)
  { slug: "motors-drives-pumps", nameEn: "Motors, Drives & Pumps", nameBn: "মোটর, ড্রাইভ ও পাম্প", icon: "motors-drives-pumps" },
  { slug: "switchgear-protection", nameEn: "Switchgear & Protection", nameBn: "সুইচগিয়ার ও প্রোটেকশন", icon: "switchgear-protection" },
  { slug: "cables-installation", nameEn: "Cables & Installation Materials", nameBn: "কেবল ও ইনস্টলেশন সামগ্রী", icon: "cables-installation" },
  { slug: "power-generation-distribution", nameEn: "Power Generation & Distribution", nameBn: "পাওয়ার জেনারেশন ও ডিস্ট্রিবিউশন", icon: "power-generation-distribution" },
  { slug: "automation-control", nameEn: "Automation & Control", nameBn: "অটোমেশন ও কন্ট্রোল", icon: "automation-control" },
  { slug: "test-measurement", nameEn: "Test & Measurement", nameBn: "টেস্ট ও মেজারমেন্ট", icon: "test-measurement" },
  { slug: "industrial-lighting", nameEn: "Industrial Lighting", nameBn: "ইন্ডাস্ট্রিয়াল লাইটিং", icon: "led-light" },
  { slug: "heating-welding-process", nameEn: "Heating, Welding & Process", nameBn: "হিটিং, ওয়েল্ডিং ও প্রসেস", icon: "heating-welding-process" },
  { slug: "power-tools-workshop", nameEn: "Power Tools & Workshop", nameBn: "পাওয়ার টুলস ও ওয়ার্কশপ", icon: "power-tools-workshop" },
];

// Categories from this list that already exist in the catalogue (seeded
// earlier) — new products get added into them, no new category row.
const EXISTING_CATEGORY_SLUGS = new Set([
  "mobile-phone", "smartwatch", "earbuds", "power-bank", "speaker",
  "laptop", "television", "washing-machine", "air-fryer", "sewing-machine",
]);

// Brand names containing a space — checked before falling back to "first
// word only" so these aren't truncated (e.g. "Russell Hobbs" not "Russell").
const MULTI_WORD_BRANDS = [
  "Russell Hobbs", "Super Star", "Ultra Prolink", "LS Electric", "FG Wilson",
  "Lincoln Electric", "OBO Bettermann", "Mean Well", "Phoenix Contact",
  "TE Raychem", "Allen-Bradley",
];

function parseBrandModel(brandModel: string): { brand: string; model: string } {
  for (const b of MULTI_WORD_BRANDS) {
    if (brandModel.startsWith(b + " ") || brandModel === b) {
      return { brand: b, model: brandModel.slice(b.length).trim() || b };
    }
  }
  const sp = brandModel.indexOf(" ");
  if (sp === -1) return { brand: brandModel, model: brandModel };
  return { brand: brandModel.slice(0, sp), model: brandModel.slice(sp + 1).trim() };
}

// ---------------------------------------------------------------------------
// Household (Part A, items 1-200)
// ---------------------------------------------------------------------------
const HOUSEHOLD: Record<string, Row[]> = {
  "mobile-phone": [
    { brandModel: "Samsung Galaxy A07 4G", specs: '6.7" display, 5,000 mAh' },
    { brandModel: "Samsung Galaxy A17 5G", specs: '6.7" Super AMOLED FHD+, Exynos 1330, 50 MP, 5,000 mAh, 25 W, IP54' },
    { brandModel: "Samsung Galaxy A26 5G", specs: '6.7" Super AMOLED, 5G, 5,000 mAh' },
    { brandModel: "Samsung Galaxy A36 5G", specs: '6.7" Super AMOLED 120 Hz, 5,000 mAh, 45 W charging' },
    { brandModel: "Samsung Galaxy A56 5G", specs: '6.7" Super AMOLED 120 Hz, Exynos 1580, 50+12+5 MP, 5,000 mAh, 45 W' },
    { brandModel: "Samsung Galaxy S25 FE", specs: "8 GB RAM / 256 GB, flagship-lite" },
    { brandModel: "Samsung Galaxy S26", specs: '6.3", 4,300 mAh, 12 GB / 256 GB, 2026 flagship' },
    { brandModel: "Xiaomi Redmi Note 14 4G", specs: '6.67" AMOLED 120 Hz, 5,500 mAh, 33 W' },
    { brandModel: "Xiaomi Redmi 15C", specs: "Budget phone, big battery" },
    { brandModel: "Realme C75", specs: "8 GB / 128 GB, IP69 water resistance, rugged build" },
    { brandModel: "Symphony Helio 100", specs: '8 GB / 256 GB, 6.67" curved AMOLED 120 Hz' },
    { brandModel: "Walton XANON X20 5G", specs: "Bangladesh-made 5G phone" },
    { brandModel: "Walton NEXG N28", specs: "Bangladesh-made budget phone" },
    { brandModel: "Apple iPhone 17", specs: '6.3" 120 Hz OLED, A19 chip, 48 MP dual camera' },
    { brandModel: "Apple iPhone 17 Pro Max", specs: '6.9" 120 Hz OLED, A19 Pro, 48 MP triple camera' },
  ],
  smartwatch: [
    { brandModel: "Haylou RS5", specs: "AMOLED, supports Bangla text" },
    { brandModel: "Kieslect K11 AMOLED", specs: "AMOLED, budget" },
    { brandModel: "Xiaomi Redmi Watch 5 Active", specs: "Bluetooth calling" },
    { brandModel: "Amazfit Pop 3S", specs: "Bluetooth calling, AMOLED" },
    { brandModel: "Xiaomi Watch 2", specs: "Wear OS, AMOLED" },
    { brandModel: "Samsung Galaxy Watch7", specs: "Wear OS, 40/44 mm" },
    { brandModel: "Apple Watch SE 3", specs: "Entry Apple Watch, pairs with iPhone only" },
    { brandModel: "Apple Watch Series 11", specs: "Flagship Apple Watch" },
  ],
  earbuds: [
    { brandModel: "Anker Soundcore R50i", specs: "True wireless, budget" },
    { brandModel: "QCY T13 ANC 2", specs: "True wireless, ANC + ENC call mics" },
    { brandModel: "Realme Buds T200", specs: "True wireless, clear calls, low-latency mode" },
    { brandModel: "Realme Buds Air 5 Pro", specs: "True wireless, strong ANC" },
    { brandModel: "Anker Soundcore Liberty 5 NC", specs: "True wireless, ANC, premium" },
    { brandModel: "JBL Tune 230NC TWS", specs: "ANC, up to 40 h with case, water resistant" },
    { brandModel: "Apple AirPods Pro 2 (USB-C)", specs: "ANC, transparency mode" },
    { brandModel: "Sony WH-1000XM5", specs: "Over-ear headphones, ANC, about 30 h battery" },
  ],
  "power-bank": [
    { brandModel: "Havit PB90", specs: "10,000 mAh, budget" },
    { brandModel: "Oraimo Powernova L11 (OPB-7103C)", specs: "10,000 mAh, 22.5 W" },
    { brandModel: "Hoco J101A", specs: "20,000 mAh" },
    { brandModel: "Oraimo Traveler OPB-7204Q", specs: "20,000 mAh, 22.5 W, LED charge display" },
    { brandModel: "Baseus Adaman PPADM20S", specs: "20,000 mAh, 22.5 W, metal body" },
    { brandModel: "Anker Zolo A110M", specs: "20,000 mAh, 45 W, two built-in USB-C cables" },
  ],
  speaker: [
    { brandModel: "JBL Go 4", specs: "Pocket size, IP67" },
    { brandModel: "Sony SRS-XB100", specs: "IP67, about 16 h battery" },
    { brandModel: "Anker Soundcore 2", specs: "12 W, IPX7, about 24 h battery" },
    { brandModel: "JBL Flip 6", specs: "IP67, about 12 h battery" },
    { brandModel: "JBL Charge 5", specs: "IP67, about 20 h, charges your phone" },
    { brandModel: "JBL PartyBox 110", specs: "160 W party speaker, light show" },
  ],
  laptop: [
    { brandModel: "HP 250 G10", specs: "15.6\", Intel 13th-gen Core, budget business" },
    { brandModel: "Dell Inspiron 15 3530", specs: '15.6" FHD, Intel 13th-gen Core' },
    { brandModel: "ASUS Vivobook 15 (X1504VA)", specs: '15.6" FHD, Intel Core i3/i5' },
    { brandModel: "Lenovo IdeaPad Slim 3", specs: '15.6" FHD, Intel Core i5 / Ryzen 5' },
    { brandModel: "Lenovo LOQ 15", specs: 'Gaming, 15.6" 144 Hz, GeForce RTX 4050/4060' },
    { brandModel: "HP Victus 15", specs: 'Gaming, 15.6" 144 Hz, GeForce RTX' },
    { brandModel: "Apple MacBook Air 13\" (M4)", specs: "13.6\" Retina, 16 GB unified memory, up to 18 h battery" },
    { brandModel: "Apple MacBook Air 15\" (M4)", specs: "15.3\" Retina, larger screen, fanless" },
  ],
  tablet: [
    { brandModel: "Xiaomi Redmi Pad SE", specs: '11" 90 Hz, 8,000 mAh' },
    { brandModel: "Samsung Galaxy Tab A9+", specs: '11" 90 Hz, 7,040 mAh' },
    { brandModel: "Xiaomi Pad 7", specs: '11.2" 144 Hz, Snapdragon 7+ Gen 3, 8,850 mAh' },
    { brandModel: "Apple iPad (A16)", specs: '11", A16 chip' },
  ],
  monitor: [
    { brandModel: "Xiaomi Monitor A24i", specs: '23.8" IPS, Full HD, 100 Hz' },
    { brandModel: "Philips 241V8", specs: '24" IPS, Full HD, 100 Hz' },
    { brandModel: "Philips 27E1N1200A", specs: '27" IPS, Full HD, 120 Hz, 1 ms' },
  ],
  printer: [
    { brandModel: "Epson EcoTank L3250", specs: "Ink tank, print/scan/copy, Wi-Fi" },
    { brandModel: "Canon PIXMA G3010", specs: "Ink tank, print/scan/copy, Wi-Fi" },
    { brandModel: "Canon imageCLASS LBP6030", specs: "Mono laser, A4, 18 ppm" },
  ],
  "wifi-router": [
    { brandModel: "TP-Link TL-WR840N", specs: "300 Mbps, 2.4 GHz" },
    { brandModel: "Tenda AC10", specs: "AC1200 dual band, gigabit ports" },
    { brandModel: "TP-Link Archer C6", specs: "AC1200 dual band, MU-MIMO, gigabit ports" },
    { brandModel: "Xiaomi Router AX3000T", specs: "Wi-Fi 6, AX3000 dual band" },
    { brandModel: "TP-Link Deco M4", specs: "AC1200 whole-home mesh, 2–3 units" },
  ],
  television: [
    { brandModel: "Walton WD32R", specs: '32", HD, basic LED' },
    { brandModel: "Samsung UA32T4700AK", specs: '32", HD Ready, smart' },
    { brandModel: "Xiaomi Mi L43M5-5ASP", specs: '43", 4K, Android TV' },
    { brandModel: "Sony Bravia KD-43X80L", specs: '43", 4K UHD, Google TV' },
    { brandModel: "Samsung Q60C (43\")", specs: '43", 4K QLED, HDR' },
    { brandModel: "Samsung 43U8000F", specs: '43", Crystal UHD 4K' },
    { brandModel: "Hisense 43U6F3", specs: '43", ULED, Google TV' },
    { brandModel: "Sony Bravia 3 S30 (55\")", specs: '55", 4K HDR, Google TV' },
    { brandModel: "Samsung 55CU7700", specs: '55", Crystal 4K UHD' },
    { brandModel: "TCL 55C6KS", specs: '55", 4K, Google TV' },
    { brandModel: "Xiaomi TV A Pro 55 (2025)", specs: '55", 4K QLED, Google TV' },
    { brandModel: "Sony Bravia 5 K-75XR50", specs: '75", 4K Mini LED, 120 Hz' },
  ],
  "gaming-console": [
    { brandModel: "Microsoft Xbox Series S", specs: "512 GB SSD, 1440p up to 120 fps" },
    { brandModel: "Nintendo Switch 2", specs: '7.9" 1080p 120 Hz screen, 256 GB' },
    { brandModel: "Sony PlayStation 5 Slim", specs: "1 TB SSD, 4K output up to 120 Hz" },
  ],
  refrigerator: [
    { brandModel: "Walton WFS-TN3-C2SR-VB", specs: "Mini fridge, 93 L gross (90 L net), 57 W, R600a" },
    { brandModel: "Haier HRF-275EPDA", specs: "255 L gross, direct cool, works at 150–260 V" },
    { brandModel: "Walton WFE-2H2-GDEN-DD", specs: "282 L gross / 265 L net, direct cool, inverter" },
    { brandModel: "Walton WFE-3A2-GDXX-XX", specs: "312 L gross / 290 L net, 145.7 W, 635 × 740 × 1,690 mm" },
    { brandModel: "Walton WFC-3F5-GDEL-DD", specs: "380 L, direct cool, inverter" },
    { brandModel: "Walton WNH-3H6-GDEL-XX", specs: "386 L gross / 328 L usable, MSO inverter" },
    { brandModel: "Walton WNI-5F3-GDEL-II", specs: "Side-by-side, 563 L gross / 501 L net, BLDC inverter" },
    { brandModel: "Walton WNR-6D6-GDFS-DD", specs: "Side-by-side, 646 L gross / 598 L net, MSO Plus inverter" },
    { brandModel: "Walton WNR-6D6-GSRE-MW", specs: "Side-by-side, 646 L, MSO Plus inverter" },
  ],
  "deep-freezer": [
    { brandModel: "Haier HCF-175SG", specs: "142 L, chest, glass top" },
    { brandModel: "Walton WCF-1D5-GDEL-LX", specs: "145 L, chest, 118–140 W, below -18 °C" },
    { brandModel: "Walton WCF-2T5", specs: "205 L, chest, aluminium interior" },
    { brandModel: "Sharp SCFK250XLWH2", specs: "250 L, chest, tropical compressor" },
  ],
  "air-conditioner": [
    { brandModel: "Walton WSI-INVERNA SUPERSAVER-12M PLASMA", specs: "1 ton (12,000 BTU), inverter, plasma ionizer" },
    { brandModel: "Gree GS-12XCOA3V (Cosmo)", specs: "1 ton, inverter" },
    { brandModel: "Midea MSI-12CRN1-AF5S", specs: "1 ton, inverter, Wi-Fi" },
    { brandModel: "Samsung AR12TVHYDWKUFE", specs: "1 ton, Digital Inverter Boost" },
    { brandModel: "General ASGG-12CPTA-V", specs: "1 ton, Hyper Tropical inverter" },
    { brandModel: "Walton WSI-DIAMOND-18M FROST CLEAN", specs: "1.5 ton, inverter, 1,670 W, R-32, self-cleaning" },
    { brandModel: "Gree GS-18XCOA3V (Cosmo)", specs: "1.5 ton, inverter" },
    { brandModel: "Samsung AR18CVFAMWKUFE", specs: "1.5 ton, inverter, WindFree" },
    { brandModel: "Haier HSU-18CleanCool", specs: "1.5 ton, inverter, self-clean" },
    { brandModel: "General ASGA18SEFT", specs: "1.5 ton, non-inverter, built for high heat and humidity" },
    { brandModel: "Gree GS-24XCOA3V (Cosmo)", specs: "2 ton, inverter" },
  ],
  "washing-machine": [
    { brandModel: "Whirlpool Superb Atom 70S", specs: "7 kg, semi-automatic twin tub" },
    { brandModel: "Walton WWM-STP80", specs: "8 kg, semi-automatic twin tub" },
    { brandModel: "Samsung WA70M4300HP/IM", specs: "7 kg, top load, fully automatic" },
    { brandModel: "Haier HWM100-316S6", specs: "10 kg, top load, fully automatic" },
    { brandModel: "LG T2310VSAB", specs: "10 kg, top load, fully automatic" },
    { brandModel: "Walton WWM-TQP130J", specs: "13 kg, top load, fully automatic" },
    { brandModel: "Hitachi BD-802HVOS", specs: "8 kg, front load, inverter" },
    { brandModel: "Samsung WW90T734DBXOTL", specs: "9 kg, front load" },
    { brandModel: "LG F4R5VYGSL", specs: "9 kg, front load" },
    { brandModel: "Hisense WF3S1043BT", specs: "10.5 kg, front load" },
    { brandModel: "Xiaomi Mijia WD105MJA10MY", specs: "10.5 kg washer-dryer" },
  ],
  "microwave-oven": [
    { brandModel: "Samsung MW73AD-B/D2", specs: "20 L, solo, auto cook" },
    { brandModel: "Walton WMWO-X20MXP", specs: "20 L" },
    { brandModel: "Sharp R-20A0(K)V", specs: "20 L, solo" },
    { brandModel: "Samsung MS23K3513AK/D2", specs: "23 L, solo, quick defrost" },
    { brandModel: "Panasonic NN-SM32HM", specs: "25 L" },
    { brandModel: "Samsung MC28H5023AK/D2", specs: "28 L, convection + grill" },
    { brandModel: "Walton WMWO-G30SCT", specs: "30 L, convection, 10 auto-cook menus" },
  ],
  "air-fryer": [
    { brandModel: "Philips NA110/00 (1000 Series)", specs: "3.2 L, 1,300 W" },
    { brandModel: "Philips HD9252 (Essential)", specs: "4.1 L, digital display" },
    { brandModel: "Philips HD9200/91 (3000 Series)", specs: "4.1 L, 1,400 W" },
    { brandModel: "Philips NA120/00 (1000 Series)", specs: "4.2 L, 1,500 W" },
    { brandModel: "Philips HD9270/90 (3000 Series XL)", specs: "6.2 L, 2,000 W" },
    { brandModel: "Philips NA350 (3000 Series)", specs: "9 L dual basket, 2,750 W" },
  ],
  "rice-cooker": [
    { brandModel: "Philips HD3119", specs: "2 L" },
    { brandModel: "Miyako ASL-300-KND", specs: "3 L double pot, 1,000 W, steamer" },
    { brandModel: "Miyako MRC-300-JPN", specs: "3 L, 1,000 W" },
    { brandModel: "Panasonic SR-GA321", specs: "3.2 L, 1,025 W" },
  ],
  "blender-mixer": [
    { brandModel: "Panasonic MX-M200", specs: "1 L blender, 450 W" },
    { brandModel: "Philips HL7757", specs: "750 W, 3 jars" },
    { brandModel: "Philips HL7704", specs: "1,000 W, 4 jars" },
    { brandModel: "Panasonic MX-AC380", specs: "1,000 W, 3 stainless jars" },
    { brandModel: "Panasonic MX-GE3750", specs: "1,200 W, 19,000 rpm, 3 jars" },
    { brandModel: "Panasonic MX-AE475", specs: "2,000 W, 23,000 rpm, 3 jars + juicer" },
  ],
  "induction-cooker": [
    { brandModel: "Philips HD4920", specs: "1,500 W, 5 power modes" },
    { brandModel: "Philips HD4911/00", specs: "2,100 W, touch panel, 1–120 min timer" },
    { brandModel: "Philips HD4929", specs: "2,100 W" },
    { brandModel: "Panasonic KY-A112AKFD", specs: "2,100 W" },
  ],
  "kettle-toaster-coffee": [
    { brandModel: "Russell Hobbs 23600", specs: "Electric kettle, 1.7 L" },
    { brandModel: "Philips HD2582/00", specs: "Pop-up toaster, 800 W, 2 slots" },
    { brandModel: "Philips HD2288/00", specs: "Sandwich maker, 700 W" },
    { brandModel: "Philips HD7430 (1000 Series)", specs: "Drip coffee maker, 1,000 W" },
  ],
  "water-purifier": [
    { brandModel: "Heron CT-40", specs: "5-stage RO" },
    { brandModel: "Vision 5-Stage RO", specs: "5-stage RO, 75 GPD" },
    { brandModel: "Pureit Marvella RO+UV+MF", specs: "RO + UV, about 20 L/h" },
  ],
  "ceiling-fan": [
    { brandModel: "Vision Super 56\"", specs: "1,400 mm, 80 W, 320 rpm, 225 m³/min" },
    { brandModel: "Walton WCF5605", specs: "56\" (1,400 mm)" },
    { brandModel: "Kashmir Gold 56\"", specs: "56\" (1,400 mm)" },
    { brandModel: "Atomberg Renesa+ 56\"", specs: "BLDC, 35 W, 360 rpm, 235 m³/min, remote" },
    { brandModel: "Havells Libeccio BLDC 56\"", specs: "BLDC, 40 W, 270 rpm, 245 m³/min, remote" },
    { brandModel: "Qulik Quantom 56\"", specs: "BLDC, 7–80 W, 260 m³/min, 5 blades, remote" },
  ],
  "rechargeable-fan": [
    { brandModel: "Defender KTH-2912", specs: "12\", 6 V 4.5 Ah battery, 3 speeds, oscillating" },
    { brandModel: "Defender TS-2926", specs: "16\", 24 W, 5 blades, remote, 3–6 h backup, LED light" },
    { brandModel: "Walton W170A-EM", specs: "17\", 30 W, 3 h (high) to 6 h (low) backup, LED light" },
  ],
  geyser: [
    { brandModel: "Walton WG-C30L", specs: "30 L, stainless steel tank" },
    { brandModel: "RFL Roland 30L Digital TG", specs: "30 L, digital display" },
    { brandModel: "Haier ES40H-CK3", specs: "40 L, horizontal mounting" },
    { brandModel: "Gazi 45Y2B", specs: "45 L" },
  ],
  "iron-steamer": [
    { brandModel: "Philips GC181/80", specs: "Dry iron, 1,000 W" },
    { brandModel: "Philips DST3020 (3000 Series)", specs: "Steam iron, 2,200 W" },
    { brandModel: "Philips STH3010 (3000 Series)", specs: "Handheld garment steamer, 1,000 W" },
  ],
  "vacuum-cleaner": [
    { brandModel: "Panasonic MC-CG520", specs: "Canister, 1,400 W, variable suction" },
    { brandModel: "Panasonic MC-CL605", specs: "Bagless canister, 2.2 L, 2,000 W" },
    { brandModel: "Panasonic MC-YL633", specs: "Drum, 18 L, 2,000 W, wet & dry" },
    { brandModel: "Hitachi CV-960F", specs: "Drum, 21 L, 2,200 W" },
    { brandModel: "Xiaomi W30 Pro (E303HW)", specs: "Cordless wet & dry, vacuums and mops" },
    { brandModel: "Xiaomi Robot Vacuum S40", specs: "Robot vacuum + mop" },
  ],
  "sewing-machine": [
    { brandModel: "Butterfly JA2-1", specs: "Manual (hand/foot) straight-stitch, household" },
    { brandModel: "Singer SM024", specs: "Electric, household" },
    { brandModel: "Singer Heavy Duty 4423", specs: "Electric, 23 built-in stitches, about 1,100 stitches/min" },
    { brandModel: "Juki DDL-8700", specs: "Industrial single-needle lockstitch, high speed" },
    { brandModel: "Jack A3", specs: "Industrial computerized lockstitch, auto thread trimmer" },
  ],
  "hair-dryer-straightener": [
    { brandModel: "Philips HP8120", specs: "Hair dryer, 1,200 W" },
    { brandModel: "Philips BHD308", specs: "Hair dryer, 1,600 W, ThermoProtect" },
    { brandModel: "Philips StyleCare BHH811", specs: "Hair straightener, ceramic plates" },
  ],
  "trimmer-shaver": [
    { brandModel: "Philips BT1232", specs: "Beard trimmer, cordless, USB charging" },
    { brandModel: "Panasonic ER-GB42", specs: "Beard trimmer, rechargeable, washable" },
    { brandModel: "Philips Multigroom 3000 MG3710/65", specs: "Face + hair kit, cordless" },
    { brandModel: "Philips OneBlade QP2520", specs: "Trim, edge and shave, wet & dry" },
  ],
  "health-devices": [
    { brandModel: "Omron HEM-7120", specs: "Blood pressure monitor, upper arm, automatic" },
    { brandModel: "Accu-Chek Instant", specs: "Glucometer" },
    { brandModel: "Omron NE-C101", specs: "Compressor nebulizer" },
  ],
  "led-light": [
    { brandModel: "Philips Ace Saver 2.7 W", specs: "LED bulb, B22 pin" },
    { brandModel: "Super Star LED Lux Eye Safe 15 W", specs: "LED bulb, daylight, E27, up to 30,000 h" },
    { brandModel: "Transtec Bright CDL 18 W", specs: "LED bulb, cool daylight, B22" },
    { brandModel: "Super Star Emergency LED Smart Bulb 18 W", specs: "Rechargeable LED bulb, battery backup, B22" },
  ],
  "ips-ups": [
    { brandModel: "Exide Star 700VA", specs: "Pure sine wave IPS, 1 × 130 Ah battery" },
    { brandModel: "Rahimafrooz Power Pack 900VA", specs: "IPS, battery up to 200 Ah" },
    { brandModel: "Luminous Eco Volt Neo 1050", specs: "IPS, single battery, 17 A max charging" },
    { brandModel: "APC Back-UPS BX650LI-MS", specs: "UPS for PC, 650 VA / 325 W, AVR" },
  ],
  "cctv-smart-home": [
    { brandModel: "Hikvision DS-2CD1023G0E-I", specs: "IP bullet camera, 2 MP, IR up to 30 m, PoE" },
    { brandModel: "Hikvision DS-7104NI-Q1/4P", specs: "4-channel NVR, 4 PoE ports" },
    { brandModel: "TP-Link Tapo C200", specs: "Wi-Fi camera, 1080p, pan/tilt, night vision" },
    { brandModel: "Imou Ranger 2", specs: "Wi-Fi camera, 1080p, pan/tilt, human detection" },
    { brandModel: "TP-Link Tapo P100", specs: "Wi-Fi smart plug, schedules and remote on/off" },
  ],
};

// ---------------------------------------------------------------------------
// Industrial (Part B, items 201-400) — includes a "type" per row
// ---------------------------------------------------------------------------
const INDUSTRIAL: Record<string, Row[]> = {
  "motors-drives-pumps": [
    { type: "Three-phase induction motor", brandModel: "Siemens SIMOTICS GP 1LE1", specs: "Low-voltage, IE2/IE3 efficiency, aluminium frame" },
    { type: "Three-phase induction motor", brandModel: "ABB M2BAX", specs: "Cast iron, general purpose, IE2" },
    { type: "Three-phase induction motor", brandModel: "WEG W22", specs: "IE2 to IE4 efficiency, cast iron" },
    { type: "Flameproof motor", brandModel: "ABB M3JP", specs: "Ex db, for hazardous areas" },
    { type: "Helical gearmotor", brandModel: "SEW-EURODRIVE R series", specs: "Helical gear unit + AC motor, wide ratio range" },
    { type: "Helical in-line gearmotor", brandModel: "Bonfiglioli C series", specs: "Helical in-line, for conveyors and mixers" },
    { type: "Servo motor", brandModel: "Siemens SIMOTICS S-1FK2", specs: "Used with SINAMICS S210 servo drive" },
    { type: "Servo system", brandModel: "Delta ASDA-B3 drive + ECMA motor", specs: "100 W–7.5 kW class, pulse/EtherCAT options" },
    { type: "Servo system", brandModel: "Mitsubishi MELSERVO-J5 (MR-J5)", specs: "Servo amplifier + HK series motors" },
    { type: "Variable frequency drive", brandModel: "ABB ACS580", specs: "0.75–500 kW, general-purpose" },
    { type: "Variable frequency drive", brandModel: "Schneider Altivar ATV320", specs: "0.18–15 kW, machine drive" },
    { type: "Variable frequency drive", brandModel: "Danfoss VLT HVAC Drive FC 102", specs: "For fans and pumps, 1.1 kW and up" },
    { type: "Variable frequency drive", brandModel: "Siemens SINAMICS G120C", specs: "0.55–132 kW, compact" },
    { type: "Micro drive", brandModel: "Delta VFD-EL", specs: "0.2–3.7 kW, compact" },
    { type: "Micro drive", brandModel: "Yaskawa GA500", specs: "Compact AC microdrive" },
    { type: "Soft starter", brandModel: "ABB PSTX", specs: "30–1,250 A" },
    { type: "Soft starter", brandModel: "Schneider Altistart ATS22", specs: "For pumps and fans, built-in bypass" },
    { type: "Vertical multistage pump", brandModel: "Grundfos CR", specs: "Water supply, boosting, boiler feed" },
    { type: "Submersible borewell pump", brandModel: "Grundfos SP", specs: '4" and larger bores, stainless steel' },
    { type: "Centrifugal pump", brandModel: "Pedrollo CPm", specs: "0.37–1.1 kW, single phase, domestic/light industrial" },
    { type: "End-suction pump", brandModel: "KSB Etanorm", specs: "Standardized end-suction, water and HVAC" },
    { type: "Vertical multistage pump", brandModel: "Lowara e-SV", specs: "Stainless steel, boosting" },
    { type: "Screw air compressor", brandModel: "Atlas Copco GA (incl. VSD+)", specs: "Oil-injected, fixed or variable speed" },
    { type: "Screw air compressor", brandModel: "Kaeser SK series", specs: "Oil-injected, compact" },
    { type: "Screw air compressor", brandModel: "ELGi EG series", specs: "Oil-lubricated, industrial" },
  ],
  "switchgear-protection": [
    { type: "Air circuit breaker (ACB)", brandModel: "ABB SACE Emax 2", specs: "Up to 6,300 A, electronic trip units" },
    { type: "Air circuit breaker (ACB)", brandModel: "Schneider MasterPact MTZ", specs: "Up to 6,300 A, MicroLogic X trip unit" },
    { type: "Air circuit breaker (ACB)", brandModel: "Siemens SENTRON 3WA", specs: "Up to 6,300 A" },
    { type: "Moulded case circuit breaker", brandModel: "Schneider ComPacT NSX", specs: "16–630 A" },
    { type: "Moulded case circuit breaker", brandModel: "ABB Tmax XT", specs: "XT1–XT7 frames, up to 1,600 A" },
    { type: "Moulded case circuit breaker", brandModel: "Siemens SENTRON 3VA", specs: "Up to 1,600 A" },
    { type: "Moulded case circuit breaker", brandModel: "LS Electric Metasol (ABN/ABS)", specs: "Economy and standard frames" },
    { type: "Miniature circuit breaker", brandModel: "Schneider Acti9 iC60N", specs: "0.5–63 A, B/C/D curves, 6 kA (IEC 60898)" },
    { type: "Miniature circuit breaker", brandModel: "ABB S200", specs: "0.5–63 A, B/C/D/K/Z curves" },
    { type: "Miniature circuit breaker", brandModel: "Siemens 5SL", specs: "0.3–63 A, 6 kA" },
    { type: "Motor protection breaker (MPCB)", brandModel: "Schneider TeSys GV2ME", specs: "0.1–32 A, push-button" },
    { type: "Motor protection breaker (MPCB)", brandModel: "Siemens SIRIUS 3RV2", specs: "Up to 100 A, rotary handle" },
    { type: "Contactor", brandModel: "Schneider TeSys D (LC1D)", specs: "9–150 A AC-3, AC/DC coils" },
    { type: "Contactor", brandModel: "Siemens SIRIUS 3RT2", specs: "S00–S3 frame sizes" },
    { type: "Contactor", brandModel: "ABB AF range", specs: "9–2,650 A, wide-range coil" },
    { type: "Contactor", brandModel: "LS Electric Metasol MC", specs: "Compact, AC-3 rated" },
    { type: "Thermal overload relay", brandModel: "Schneider TeSys LRD", specs: "0.1–150 A, class 10A/20" },
    { type: "Vacuum circuit breaker (MV)", brandModel: "ABB VD4", specs: "12–40.5 kV" },
    { type: "Vacuum circuit breaker (MV)", brandModel: "Schneider Evolis", specs: "12–24 kV" },
    { type: "Ring main unit (RMU)", brandModel: "Schneider RM6", specs: "Up to 24 kV, SF6 insulated" },
    { type: "Ring main unit (RMU)", brandModel: "ABB SafeRing", specs: "12–40.5 kV" },
    { type: "Protection relay", brandModel: "Schneider Easergy P3", specs: "Feeder, motor and transformer protection" },
    { type: "Protection relay", brandModel: "Siemens SIPROTEC 5", specs: "IEC 61850, modular" },
    { type: "Feeder protection relay", brandModel: "ABB Relion REF615", specs: "Overcurrent and earth-fault, IEC 61850" },
    { type: "Automatic transfer switch", brandModel: "Socomec ATyS", specs: "Motorized grid–generator changeover" },
    { type: "Load-break switch disconnector", brandModel: "Socomec SIRCO", specs: "125–5,000 A" },
    { type: "Surge protection device", brandModel: "Schneider Acti9 iPRD", specs: "Type 2, 8–65 kA" },
    { type: "APFC capacitor bank", brandModel: "Schneider VarSet", specs: "Automatic power factor correction panel" },
    { type: "Power capacitor", brandModel: "TDK EPCOS PhaseCap", specs: "Low-voltage PFC capacitor" },
    { type: "Push buttons & pilot lights", brandModel: "Schneider Harmony XB5", specs: "22 mm, plastic bezel" },
  ],
  "cables-installation": [
    { type: "LT power cable", brandModel: "BRB XLPE LT cable", specs: "0.6/1 kV, copper or aluminium, armoured or unarmoured" },
    { type: "HT power cable", brandModel: "BRB XLPE HT cable", specs: "11 kV and 33 kV classes" },
    { type: "Control cable", brandModel: "BRB PVC multi-core control cable", specs: "1.5 rm, 5 to 19+ cores, sold per 100 m" },
    { type: "Fire-retardant wire", brandModel: "BRB FR PVC single-core cable", specs: "Fire-retardant PVC insulation" },
    { type: "Overhead conductor", brandModel: "BRB ACSR / AAC conductor", specs: "Aluminium overhead line conductors" },
    { type: "Power & wiring cable", brandModel: "Paradise Cable", specs: "PVC and XLPE cables, Bangladeshi brand" },
    { type: "Armoured power cable", brandModel: "Polycab XLPE armoured cable", specs: "LT and HT, copper or aluminium" },
    { type: "Flexible control cable", brandModel: "Lapp ÖLFLEX CLASSIC 110", specs: "PVC, numbered cores, 300/500 V" },
    { type: "Screened data/instrument cable", brandModel: "Lapp UNITRONIC LiYCY", specs: "Copper braid screen" },
    { type: "Fire-resistant cable", brandModel: "Prysmian FP200 Gold", specs: "For fire alarm and emergency circuits" },
    { type: "Solar DC cable", brandModel: "Prysmian Tecsun H1Z2Z2-K", specs: "1.5 kV DC, UV and weather resistant" },
    { type: "HT cable termination", brandModel: "TE Raychem heat-shrink kit", specs: "11 kV / 33 kV indoor and outdoor" },
    { type: "HT cable termination", brandModel: "3M QT-III cold-shrink kit", specs: "No heat needed during install" },
    { type: "Terminal block", brandModel: "Phoenix Contact UT 2.5", specs: "Screw clamp, DIN rail" },
    { type: "Terminal block", brandModel: "Weidmüller A2C 2.5 PUSH IN", specs: "Push-in, DIN rail" },
    { type: "Cable gland", brandModel: "Hummel HSK-K", specs: "Nylon, IP68" },
    { type: "Cable lug", brandModel: "Klauke tinned copper", specs: "For crimping, wide size range" },
    { type: "Electrical enclosure", brandModel: "Rittal AX compact enclosure", specs: "Steel or stainless, IP55–IP66" },
    { type: "Earthing rod", brandModel: "nVent ERICO copper-bonded ground rod", specs: "Copper bonded steel core" },
    { type: "Cable tray", brandModel: "OBO Bettermann RKS cable tray", specs: "Perforated steel, hot-dip galvanized" },
  ],
  "power-generation-distribution": [
    { type: "Diesel generator set", brandModel: "Cummins C500D5", specs: "About 500 kVA standby, 400 V, 50 Hz" },
    { type: "Diesel generator set", brandModel: "FG Wilson P range", specs: "Perkins engines, small to large kVA ratings" },
    { type: "Diesel generator set", brandModel: "Caterpillar C15 genset", specs: "Mid-size standby and prime power" },
    { type: "Gas engine generator", brandModel: "INNIO Jenbacher J420", specs: "About 1.4–1.5 MW, natural gas" },
    { type: "Gas generator set", brandModel: "Caterpillar G3520", specs: "About 2 MW class, natural gas" },
    { type: "Alternator", brandModel: "Stamford S-series", specs: "Brushless, AVR controlled" },
    { type: "Alternator", brandModel: "Leroy-Somer LSA", specs: "Brushless, industrial" },
    { type: "Distribution transformer", brandModel: "Energypac (Bangladesh)", specs: "11/0.415 kV, oil-immersed" },
    { type: "Dry-type transformer", brandModel: "Schneider Trihal", specs: "Cast resin, indoor" },
    { type: "Dry-type transformer", brandModel: "Siemens GEAFOL", specs: "Cast resin, indoor" },
    { type: "Power meter", brandModel: "Schneider PowerLogic PM5000", specs: "kWh, kW, PF, THD, Modbus" },
    { type: "Power quality meter", brandModel: "Schneider PowerLogic ION9000", specs: "High-accuracy PQ analysis" },
    { type: "Power meter", brandModel: "Siemens SENTRON PAC3200", specs: "Panel mount, Modbus/Profibus options" },
    { type: "Power analyser", brandModel: "Janitza UMG 96-PA", specs: "Panel mount, harmonics, Modbus" },
    { type: "Three-phase UPS", brandModel: "Schneider Galaxy VS", specs: "About 10–150 kW, online double conversion" },
    { type: "Online UPS", brandModel: "APC Smart-UPS SRT", specs: "5–10 kVA, double conversion" },
    { type: "Three-phase UPS", brandModel: "Eaton 93PM", specs: "Modular, large data centre/industrial loads" },
    { type: "Active harmonic filter", brandModel: "Schneider AccuSine PCS+", specs: "Cancels drive harmonics" },
    { type: "Solar string inverter", brandModel: "Huawei SUN2000-100KTL-M2", specs: "100 kW, multiple MPPTs" },
    { type: "Solar string inverter", brandModel: "SMA Sunny Tripower CORE1", specs: "50 kW class" },
    { type: "Solar string inverter", brandModel: "Sungrow SG110CX", specs: "110 kW" },
    { type: "Battery storage", brandModel: "BYD Battery-Box Premium HVS", specs: "Modular LiFePO4, high voltage" },
    { type: "DC fast EV charger", brandModel: "ABB Terra 54", specs: "50 kW, CCS/CHAdeMO" },
    { type: "Pole-mounted recloser", brandModel: "Schneider U-Series (ADVC)", specs: "15–38 kV, vacuum interrupter" },
    { type: "Surge arrester (MV/HV)", brandModel: "Siemens 3EL", specs: "Metal-oxide, polymer housing" },
  ],
  "automation-control": [
    { type: "Compact PLC", brandModel: "Siemens SIMATIC S7-1200 CPU 1214C", specs: "14 DI / 10 DO / 2 AI, PROFINET, 24 V DC" },
    { type: "Advanced PLC", brandModel: "Siemens SIMATIC S7-1500", specs: "Modular, high-speed, TIA Portal" },
    { type: "Compact PLC", brandModel: "Mitsubishi MELSEC iQ-F FX5U", specs: "Built-in Ethernet, analog I/O" },
    { type: "PLC / PAC", brandModel: "Allen-Bradley CompactLogix 5380", specs: "EtherNet/IP, Studio 5000" },
    { type: "Compact PLC", brandModel: "Schneider Modicon M221", specs: "Logic controller for small machines" },
    { type: "Compact PLC", brandModel: "Delta DVP-SS2", specs: "8 DI / 6 DO, slim" },
    { type: "Machine controller", brandModel: "Omron NX1P2", specs: "EtherCAT + EtherNet/IP" },
    { type: "HMI panel", brandModel: "Siemens SIMATIC KTP700 Basic", specs: '7" touch, PROFINET' },
    { type: "HMI panel", brandModel: "Weintek MT8071iE", specs: '7" touch, Ethernet' },
    { type: "HMI panel", brandModel: "Delta DOP-107BV", specs: '7" touch' },
    { type: "Industrial Ethernet switch", brandModel: "Siemens SCALANCE XB005", specs: "5 ports, unmanaged, DIN rail" },
    { type: "Industrial Ethernet switch", brandModel: "Moxa EDS-205", specs: "5 ports, unmanaged, DIN rail" },
    { type: "Inductive proximity sensor", brandModel: "Omron E2E", specs: "Cylindrical, M8–M30" },
    { type: "Inductive proximity sensor", brandModel: "Autonics PR series", specs: "M12–M30, PNP/NPN" },
    { type: "Photoelectric sensor", brandModel: "Omron E3Z", specs: "Compact, diffuse/retro/through-beam" },
    { type: "Photoelectric sensor", brandModel: "SICK W16", specs: "Rugged housing, IO-Link options" },
    { type: "Rotary encoder", brandModel: "Autonics E50S", specs: "Incremental, 50 mm body" },
    { type: "Limit switch", brandModel: "Omron WL", specs: "Roller lever, heavy duty" },
    { type: "Temperature controller", brandModel: "Autonics TK4S", specs: "48 × 48 mm, PID" },
    { type: "Temperature controller", brandModel: "Omron E5CC", specs: "48 × 48 mm, PID, universal input" },
    { type: "Pressure transmitter", brandModel: "Endress+Hauser Cerabar PMP51", specs: "4–20 mA / HART" },
    { type: "Pressure transmitter", brandModel: "WIKA S-20", specs: "Industrial, 4–20 mA" },
    { type: "Radar level transmitter", brandModel: "VEGA VEGAPULS 64", specs: "80 GHz, for liquids" },
    { type: "Electromagnetic flowmeter", brandModel: "Endress+Hauser Promag W 400", specs: "Water and wastewater" },
    { type: "Electromagnetic flowmeter", brandModel: "Siemens SITRANS F M MAG 5000", specs: "Transmitter for MAG sensors" },
    { type: "Solenoid valve", brandModel: "ASCO 8210", specs: "2-way, general service" },
    { type: "Solenoid valve", brandModel: "Danfoss EV220B", specs: "Servo-operated, 2/2-way" },
    { type: "DIN rail power supply", brandModel: "Mean Well NDR-120-24", specs: "24 V DC, 5 A, 120 W" },
    { type: "Plug-in relay", brandModel: "Omron MY2N", specs: "2 changeover contacts, LED indicator" },
    { type: "Industrial robot", brandModel: "FANUC LR Mate 200iD", specs: "6-axis, about 7 kg payload" },
  ],
  "test-measurement": [
    { type: "Digital multimeter", brandModel: "Fluke 117", specs: "True RMS, 600 V, built-in non-contact voltage" },
    { type: "Digital multimeter", brandModel: "Fluke 87V", specs: "True RMS, 1,000 V, CAT III / CAT IV" },
    { type: "Digital multimeter", brandModel: "UNI-T UT61E+", specs: "True RMS, budget bench/field meter" },
    { type: "Clamp meter", brandModel: "Fluke 376 FC", specs: "1,000 A AC/DC, iFlex up to 2,500 A" },
    { type: "Clamp meter", brandModel: "Kyoritsu KEW 2056R", specs: "1,000 A AC/DC" },
    { type: "Insulation tester", brandModel: "Megger MIT420/2", specs: "50–1,000 V test voltage" },
    { type: "Insulation tester (HV)", brandModel: "Kyoritsu KEW 3125A", specs: "Up to 5 kV test voltage" },
    { type: "Insulation multimeter", brandModel: "Fluke 1587 FC", specs: "Insulation test + True RMS multimeter" },
    { type: "Earth resistance tester", brandModel: "Kyoritsu KEW 4105A", specs: "2/3-wire earth testing" },
    { type: "Earth ground clamp", brandModel: "Fluke 1630-2 FC", specs: "Stakeless earth loop testing" },
    { type: "Power quality analyser", brandModel: "Fluke 435-II", specs: "3-phase, energy loss calculation" },
    { type: "Power quality analyser", brandModel: "Hioki PQ3100", specs: "3-phase, IEC 61000-4-30" },
    { type: "Oscilloscope", brandModel: "Rigol DS1054Z", specs: "50 MHz, 4 channels" },
    { type: "Oscilloscope", brandModel: "Siglent SDS1104X-E", specs: "100 MHz, 4 channels" },
    { type: "Function generator", brandModel: "Rigol DG1022Z", specs: "25 MHz, 2 channels" },
    { type: "Electrical tester", brandModel: "Fluke T6-1000", specs: "FieldSense voltage without test-lead contact" },
    { type: "Non-contact voltage detector", brandModel: "Fluke 1AC II", specs: "90–1,000 V AC" },
    { type: "Thermal imaging camera", brandModel: "FLIR E8-XT", specs: "320 × 240 IR resolution" },
    { type: "IR thermometer", brandModel: "Fluke 62 MAX+", specs: "-30 to 650 °C, dual laser" },
    { type: "Micro-ohmmeter", brandModel: "Megger DLRO10HD", specs: "10 A test current" },
    { type: "Transformer turns ratio tester", brandModel: "Megger TTR300 series", specs: "3-phase TTR testing" },
    { type: "Relay test set", brandModel: "OMICRON CMC 356", specs: "3-phase secondary injection" },
    { type: "Phase rotation indicator", brandModel: "Fluke 9040", specs: "40–700 V" },
    { type: "Lux meter", brandModel: "Testo 540", specs: "Pocket light meter" },
    { type: "Vibration meter", brandModel: "Fluke 805 FC", specs: "Bearing and overall vibration" },
  ],
  "industrial-lighting": [
    { type: "LED high bay", brandModel: "Philips GentleSpace gen3", specs: "High-ceiling factories and warehouses, high efficacy" },
    { type: "LED high bay (value)", brandModel: "Philips Ledinaire high bay", specs: "Low-cost LED replacement for HID" },
    { type: "LED high bay", brandModel: "LEDVANCE High Bay Compact", specs: "Round UFO style, IP65" },
    { type: "LED floodlight", brandModel: "Philips ClearFlood Large BVP650", specs: "Large-area and sports floodlighting" },
    { type: "LED floodlight", brandModel: "Philips Ledinaire BVP150", specs: "General floodlight, IP65" },
    { type: "LED floodlight", brandModel: "LEDVANCE Floodlight", specs: "Outdoor, IP65" },
    { type: "LED street light", brandModel: "Philips UniStreet", specs: "Roads and plant roads" },
    { type: "Waterproof batten", brandModel: "Philips Ledinaire Waterproof WT060C", specs: "Damp and dusty areas, IP65" },
    { type: "Damp-proof batten", brandModel: "LEDVANCE Damp Proof", specs: "IP65, linear" },
    { type: "Explosion-proof light", brandModel: "Eaton Crouse-Hinds Champ VMV LED", specs: "Hazardous locations" },
    { type: "Hazardous-area high bay", brandModel: "Dialight SafeSite LED", specs: "Hazardous industrial areas" },
    { type: "Trunking line system", brandModel: "Philips Maxos fusion", specs: "Continuous LED lines for plants and stores" },
    { type: "LED panel", brandModel: "Philips Ledinaire RC065B", specs: "600 × 600 mm recessed panel" },
    { type: "Emergency exit light", brandModel: "Schneider Exiway", specs: "Self-contained, battery backup" },
    { type: "Lighting control system", brandModel: "Philips Dynalite", specs: "Networked dimming, sensors, scheduling" },
  ],
  "heating-welding-process": [
    { type: "Multiprocess welder", brandModel: "Lincoln Electric Invertec V350-PRO", specs: "350 A, stick/TIG/MIG" },
    { type: "Multiprocess welder", brandModel: "ESAB Rebel EMP 215ic", specs: "MIG, stick and TIG in one unit" },
    { type: "AC/DC multiprocess welder", brandModel: "Miller Multimatic 220 AC/DC", specs: "MIG, stick, AC/DC TIG" },
    { type: "TIG welder", brandModel: "Jasic TIG 200 AC/DC", specs: "Inverter, aluminium capable" },
    { type: "Stick (MMA) welder", brandModel: "Kemppi Minarc Evo 180", specs: "Portable inverter, 180 A" },
    { type: "Plasma cutter", brandModel: "Hypertherm Powermax45 XP", specs: "Hand and machine cutting" },
    { type: "Induction melting furnace", brandModel: "Inductotherm VIP series", specs: "Steel and iron foundry melting" },
    { type: "Industrial furnace", brandModel: "Nabertherm chamber furnace", specs: "Heat treatment, up to about 1,300 °C" },
    { type: "Immersion heater", brandModel: "Watlow FIREBAR", specs: "Flat tubular element for liquids" },
    { type: "Cartridge heater", brandModel: "Watlow FIREROD", specs: "For dies, moulds and platens" },
    { type: "Air-cooled screw chiller", brandModel: "Carrier AquaForce 30XA", specs: "Process and HVAC cooling" },
    { type: "Centrifugal chiller", brandModel: "Trane CenTraVac", specs: "Large building and plant cooling" },
    { type: "VRF air-conditioning system", brandModel: "Daikin VRV", specs: "Multi-zone commercial cooling" },
    { type: "Air handling unit", brandModel: "Systemair Geniox", specs: "Modular AHU, EC fans" },
    { type: "Dust collector", brandModel: "Donaldson Torit Downflo Oval (DFO)", specs: "Cartridge type, pulse cleaning" },
  ],
  "power-tools-workshop": [
    { type: "Impact drill", brandModel: "Bosch GSB 550", specs: "550 W, 13 mm chuck" },
    { type: "Rotary hammer", brandModel: "Bosch GBH 2-26 DRE", specs: "800 W, SDS-plus, 2.7 J" },
    { type: "Rotary hammer", brandModel: "Makita HR2470", specs: "780 W, SDS-plus" },
    { type: "Cordless hammer drill", brandModel: "DeWalt DCD796", specs: "18 V brushless" },
    { type: "Angle grinder", brandModel: "Makita 9553NB", specs: "710 W, 100 mm disc" },
    { type: "Large angle grinder", brandModel: "Bosch GWS 22-230", specs: "2,200 W, 230 mm disc" },
    { type: "Circular saw", brandModel: "Makita 5806B", specs: "1,050 W, 185 mm blade" },
    { type: "Metal cut-off saw", brandModel: "Bosch GCO 220", specs: "2,200 W, 355 mm disc" },
    { type: "Jigsaw", brandModel: "Bosch GST 700", specs: "500 W" },
    { type: "Heat gun", brandModel: "Bosch GHG 20-63", specs: "2,000 W, 50–630 °C" },
    { type: "Bench grinder", brandModel: "Bosch GBG 35-15", specs: "350 W, 150 mm wheels" },
    { type: "Electric chain hoist", brandModel: "Kito ER2", specs: "Three-phase, pendant control" },
    { type: "Electric forklift", brandModel: "Linde E20", specs: "2 t electric counterbalance" },
    { type: "Electric pallet truck", brandModel: "Jungheinrich EJE 116", specs: "1.6 t" },
    { type: "CNC lathe", brandModel: "Haas ST-10", specs: "Compact turning centre" },
  ],
};

function imageUrl(bg: string, label: string): string {
  const text = encodeURIComponent(label).replace(/%20/g, "+");
  return `https://placehold.co/900x675/${bg}/64748b.png?font=source-sans-pro&text=${text}`;
}

async function ensureCategory(c: CategorySeed): Promise<string> {
  const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, c.slug)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(categories).values({ slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, icon: c.icon }).returning({ id: categories.id });
  console.log(`  + category ${c.slug}`);
  return row!.id;
}

async function ensureBrand(name: string): Promise<string> {
  const slug = slugify(name);
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(brands).values({ slug, name }).returning({ id: brands.id });
  console.log(`  + brand ${name}`);
  return row!.id;
}

async function ensureProduct(categoryId: string, color: string, row: Row): Promise<void> {
  const { brand, model } = parseBrandModel(row.brandModel);
  const brandId = await ensureBrand(brand);

  const slug = slugify(`${brand} ${model}`);
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
  if (existing) {
    console.log(`  = product ${slug} (exists)`);
    return;
  }

  const spec: Record<string, string> = {};
  if (row.type) spec.Type = row.type;
  if (row.specs) spec["Key specs"] = row.specs;

  const primary = imageUrl(color, row.brandModel);
  const [prod] = await db
    .insert(products)
    .values({
      slug,
      categoryId,
      brandId,
      name: row.brandModel,
      modelNo: model,
      status: "active",
      priceMin: null,
      priceMax: null,
      warrantyText: null,
      spec,
      primaryImage: primary,
    })
    .returning({ id: products.id });

  await db.insert(productImages).values([{ productId: prod!.id, url: primary, sort: 0 }]);
  console.log(`  + product ${slug}`);
}

async function runGroup(group: Record<string, Row[]>) {
  let tintIdx = 0;
  for (const c of CATEGORIES) {
    const rows = group[c.slug];
    if (!rows) continue;
    const categoryId = EXISTING_CATEGORY_SLUGS.has(c.slug)
      ? (await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, c.slug)).limit(1))[0]?.id
      : await ensureCategory(c);
    if (!categoryId) throw new Error(`category not found: ${c.slug} (expected to already exist)`);
    const color = TINTS[tintIdx++ % TINTS.length]!;
    for (const row of rows) {
      await ensureProduct(categoryId, color, row);
    }
  }
}

async function main() {
  console.log("Importing PDF product list (household)…");
  await runGroup(HOUSEHOLD);
  console.log("Importing PDF product list (industrial)…");
  await runGroup(INDUSTRIAL);
  console.log("Done.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
