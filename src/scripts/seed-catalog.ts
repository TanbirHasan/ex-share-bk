import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../db/client";
import { brands, categories, productImages, products } from "../db/schema";
import { slugify } from "../lib/slug";

/**
 * Seed a batch of catalogue data (categories, brands, products, images) so the
 * site looks populated. Idempotent — re-running skips anything already present
 * by slug. Placeholder images from placehold.co.
 *
 *   cd backend && yarn tsx src/scripts/seed-catalog.ts
 */

type CategorySeed = { slug: string; nameEn: string; nameBn: string; icon: string; color: string };
type ProductSeed = {
  brand: string;
  name: string;
  model: string;
  priceMin: number;
  priceMax: number;
  warranty: string;
  status?: "new" | "active" | "older";
  spec: Record<string, string>;
};

// Light, low-saturation tints so the grid has gentle variety without the
// images fighting the teal brand colour or looking like error banners.
const CATEGORIES: CategorySeed[] = [
  { slug: "mobile-phone", nameEn: "Mobile Phone", nameBn: "মোবাইল ফোন", icon: "smartphone", color: "eef2f7" },
  { slug: "air-fryer", nameEn: "Air Fryer", nameBn: "এয়ার ফ্রায়ার", icon: "air-fryer", color: "f6f0e8" },
  { slug: "washing-machine", nameEn: "Washing Machine", nameBn: "ওয়াশিং মেশিন", icon: "washing-machine", color: "eaf0f6" },
  { slug: "sewing-machine", nameEn: "Sewing Machine", nameBn: "সেলাই মেশিন", icon: "sewing-machine", color: "f0edf7" },
];

const BRANDS: { name: string; aboutEn?: string; aboutBn?: string }[] = [
  { name: "Samsung", aboutEn: "Korean electronics giant with wide after-sales coverage in Bangladesh.", aboutBn: "কোরিয়ান ইলেকট্রনিক্স জায়ান্ট, বাংলাদেশে বিস্তৃত বিক্রয়োত্তর সেবা।" },
  { name: "Xiaomi", aboutEn: "Value-focused phones and home appliances.", aboutBn: "সাশ্রয়ী দামের ফোন ও গৃহস্থালি যন্ত্র।" },
  { name: "Realme", aboutEn: "Fast-growing smartphone brand popular with younger buyers.", aboutBn: "তরুণ ক্রেতাদের কাছে জনপ্রিয় দ্রুত বর্ধনশীল স্মার্টফোন ব্র্যান্ড।" },
  { name: "Infinix", aboutEn: "Budget smartphones with big batteries.", aboutBn: "বড় ব্যাটারিসহ বাজেট স্মার্টফোন।" },
  { name: "Vivo", aboutEn: "Camera-centric smartphones with a strong retail network.", aboutBn: "শক্তিশালী রিটেইল নেটওয়ার্কসহ ক্যামেরা-কেন্দ্রিক স্মার্টফোন।" },
  { name: "Walton", aboutEn: "Bangladesh's largest local electronics manufacturer.", aboutBn: "বাংলাদেশের সবচেয়ে বড় দেশীয় ইলেকট্রনিক্স নির্মাতা।" },
  { name: "Vision", aboutEn: "Local appliance brand under the RFL group.", aboutBn: "RFL গ্রুপের দেশীয় অ্যাপ্লায়েন্স ব্র্যান্ড।" },
  { name: "Singer", aboutEn: "Long-established brand for sewing and home appliances.", aboutBn: "সেলাই ও গৃহস্থালি যন্ত্রের পুরনো প্রতিষ্ঠিত ব্র্যান্ড।" },
  { name: "Philips", aboutEn: "Dutch brand known for kitchen and personal-care appliances.", aboutBn: "রান্নাঘর ও ব্যক্তিগত পরিচর্যা যন্ত্রের জন্য পরিচিত ডাচ ব্র্যান্ড।" },
  { name: "Panasonic", aboutEn: "Japanese electronics brand with a reputation for durability.", aboutBn: "টেকসইতার জন্য পরিচিত জাপানি ইলেকট্রনিক্স ব্র্যান্ড।" },
  { name: "LG", aboutEn: "Korean brand strong in washing machines and TVs.", aboutBn: "ওয়াশিং মেশিন ও টিভিতে শক্তিশালী কোরিয়ান ব্র্যান্ড।" },
  { name: "Haier", aboutEn: "Global appliance maker with growing local presence.", aboutBn: "বাড়তে থাকা দেশীয় উপস্থিতিসহ বৈশ্বিক অ্যাপ্লায়েন্স নির্মাতা।" },
  { name: "Miyako", aboutEn: "Affordable kitchen and home appliances.", aboutBn: "সাশ্রয়ী রান্নাঘর ও গৃহস্থালি যন্ত্র।" },
  { name: "Brother", aboutEn: "Japanese brand specialising in sewing machines and printers.", aboutBn: "সেলাই মেশিন ও প্রিন্টারে বিশেষজ্ঞ জাপানি ব্র্যান্ড।" },
  { name: "Butterfly", aboutEn: "Widely-used entry-level sewing machines.", aboutBn: "ব্যাপকভাবে ব্যবহৃত এন্ট্রি-লেভেল সেলাই মেশিন।" },
  { name: "Jack", aboutEn: "Industrial sewing machine manufacturer.", aboutBn: "শিল্প-মানের সেলাই মেশিন নির্মাতা।" },
];

const PRODUCTS: Record<string, ProductSeed[]> = {
  "mobile-phone": [
    {
      brand: "Samsung", name: "Samsung Galaxy A15", model: "SM-A155F", priceMin: 19000, priceMax: 22000,
      warranty: "1 year official warranty (Samsung Bangladesh)",
      spec: { Display: '6.5" Super AMOLED, 90Hz', Chipset: "MediaTek Helio G99", RAM: "6 GB", Storage: "128 GB", Battery: "5000 mAh", "Rear camera": "50 MP + 5 MP + 2 MP", OS: "Android 14, One UI 6" },
    },
    {
      brand: "Xiaomi", name: "Redmi 13C", model: "23100RN82L", priceMin: 16500, priceMax: 18000,
      warranty: "1 year warranty",
      spec: { Display: '6.74" HD+, 90Hz', Chipset: "MediaTek Helio G85", RAM: "6 GB", Storage: "128 GB", Battery: "5000 mAh", "Rear camera": "50 MP + 2 MP", OS: "Android 13, MIUI 14" },
    },
    {
      brand: "Realme", name: "Realme C67", model: "RMX3890", priceMin: 21000, priceMax: 23500, status: "new",
      warranty: "1 year official warranty",
      spec: { Display: '6.72" FHD+, 90Hz', Chipset: "Snapdragon 685", RAM: "8 GB", Storage: "128 GB", Battery: "5000 mAh, 33W", "Rear camera": "108 MP + 2 MP", OS: "Android 13, Realme UI 4" },
    },
    {
      brand: "Infinix", name: "Infinix Hot 40i", model: "X6528", priceMin: 13500, priceMax: 15000,
      warranty: "1 year warranty",
      spec: { Display: '6.56" HD+, 90Hz', Chipset: "Unisoc T606", RAM: "8 GB", Storage: "128 GB", Battery: "5000 mAh, 18W", "Rear camera": "50 MP + AI lens", OS: "Android 13, XOS 13" },
    },
    {
      brand: "Vivo", name: "Vivo Y28", model: "V2314", priceMin: 20000, priceMax: 22500,
      warranty: "1 year official warranty (Vivo Bangladesh)",
      spec: { Display: '6.56" HD+, 90Hz', Chipset: "MediaTek Dimensity 6020", RAM: "6 GB", Storage: "128 GB", Battery: "5000 mAh, 44W", "Rear camera": "50 MP + 2 MP", OS: "Android 14, Funtouch OS 14" },
    },
    {
      brand: "Samsung", name: "Samsung Galaxy A25 5G", model: "SM-A256E", priceMin: 33000, priceMax: 36000, status: "new",
      warranty: "1 year official warranty (Samsung Bangladesh)",
      spec: { Display: '6.5" Super AMOLED, 120Hz', Chipset: "Exynos 1280", RAM: "8 GB", Storage: "128 GB", Battery: "5000 mAh, 25W", "Rear camera": "50 MP OIS + 8 MP + 2 MP", OS: "Android 14, One UI 6" },
    },
  ],
  "air-fryer": [
    {
      brand: "Walton", name: "Walton Air Fryer WAF-MC50", model: "WAF-MC50", priceMin: 6500, priceMax: 8000,
      warranty: "1 year service warranty",
      spec: { Capacity: "5 L", Power: "1500 W", "Temperature range": "80–200°C", Timer: "60 min", Basket: "Non-stick, dishwasher safe", Control: "Mechanical dial" },
    },
    {
      brand: "Vision", name: "Vision Air Fryer 3.5L", model: "VIS-AF-001", priceMin: 5000, priceMax: 6200,
      warranty: "1 year service warranty",
      spec: { Capacity: "3.5 L", Power: "1400 W", "Temperature range": "80–200°C", Timer: "30 min", Basket: "Non-stick", Control: "Mechanical dial" },
    },
    {
      brand: "Philips", name: "Philips Airfryer 3000 Series", model: "HD9243/90", priceMin: 13500, priceMax: 15500, status: "new",
      warranty: "2 year international warranty",
      spec: { Capacity: "4.1 L", Power: "1400 W", "Temperature range": "40–200°C", Timer: "60 min", Basket: "Rapid Air, QuickClean", Control: "Digital touch" },
    },
    {
      brand: "Miyako", name: "Miyako Air Fryer AF-500", model: "AF-500", priceMin: 4800, priceMax: 5500,
      warranty: "1 year warranty",
      spec: { Capacity: "5 L", Power: "1500 W", "Temperature range": "80–200°C", Timer: "60 min", Basket: "Non-stick", Control: "Mechanical dial" },
    },
    {
      brand: "Panasonic", name: "Panasonic Air Fryer NF-CC500", model: "NF-CC500", priceMin: 16000, priceMax: 18500,
      warranty: "1 year official warranty",
      spec: { Capacity: "4.5 L", Power: "1500 W", "Temperature range": "40–200°C", Timer: "30 min", Basket: "Non-stick, removable", Control: "Digital + presets" },
    },
  ],
  "washing-machine": [
    {
      brand: "Walton", name: "Walton Washing Machine WWM-Q70", model: "WWM-Q70", priceMin: 32000, priceMax: 36000,
      warranty: "2 year comprehensive + 10 year motor",
      spec: { Capacity: "7 kg", Type: "Fully automatic top load", "Spin speed": "700 rpm", Programs: "8", "Energy rating": "4 star", Body: "Plastic" },
    },
    {
      brand: "Samsung", name: "Samsung WW70T3020BS Front Load", model: "WW70T3020BS", priceMin: 45000, priceMax: 49000, status: "new",
      warranty: "1 year + 10 year Digital Inverter motor",
      spec: { Capacity: "7 kg", Type: "Fully automatic front load", "Spin speed": "1200 rpm", Programs: "12", "Energy rating": "5 star", Feature: "Digital Inverter, Diamond Drum" },
    },
    {
      brand: "Vision", name: "Vision Washing Machine 8kg Semi-Auto", model: "VIS-WM-8SA", priceMin: 18500, priceMax: 21000,
      warranty: "2 year service warranty",
      spec: { Capacity: "8 kg", Type: "Semi automatic twin tub", "Spin speed": "1350 rpm (spin tub)", Programs: "Wash / spin dials", "Energy rating": "3 star", Body: "Plastic" },
    },
    {
      brand: "Singer", name: "Singer Washing Machine SWM721", model: "SWM721", priceMin: 27000, priceMax: 30000,
      warranty: "1 year comprehensive",
      spec: { Capacity: "7.2 kg", Type: "Fully automatic top load", "Spin speed": "800 rpm", Programs: "10", "Energy rating": "4 star", Feature: "Child lock, fuzzy logic" },
    },
    {
      brand: "LG", name: "LG T7585NDDLG Top Load", model: "T7585NDDLG", priceMin: 38000, priceMax: 42000,
      warranty: "2 year + 10 year Smart Inverter motor",
      spec: { Capacity: "6.5 kg", Type: "Fully automatic top load", "Spin speed": "700 rpm", Programs: "8", "Energy rating": "5 star", Feature: "Smart Inverter, Turbo Drum" },
    },
    {
      brand: "Haier", name: "Haier HWM75-1789 Top Load", model: "HWM75-1789", priceMin: 31000, priceMax: 34000,
      warranty: "2 year comprehensive + 12 year motor",
      spec: { Capacity: "7.5 kg", Type: "Fully automatic top load", "Spin speed": "740 rpm", Programs: "8", "Energy rating": "4 star", Feature: "Oceanus wave drum" },
    },
  ],
  "sewing-machine": [
    {
      brand: "Singer", name: "Singer Promise 1408", model: "1408", priceMin: 14000, priceMax: 16000,
      warranty: "2 year warranty (25 year limited on head)",
      spec: { "Stitch patterns": "8 built-in", Speed: "750 stitches/min", Type: "Electric, domestic", Bobbin: "Front-loading", Motor: "70 W", Feature: "4-step buttonhole" },
    },
    {
      brand: "Brother", name: "Brother GS2700", model: "GS2700", priceMin: 22000, priceMax: 25000,
      warranty: "3 year warranty",
      spec: { "Stitch patterns": "27 built-in", Speed: "800 stitches/min", Type: "Electric, domestic", Bobbin: "Top drop-in, jam-resistant", Motor: "51 W", Feature: "1-step buttonhole, free arm" },
    },
    {
      brand: "Singer", name: "Singer Heavy Duty 4423", model: "4423", priceMin: 26000, priceMax: 29000, status: "new",
      warranty: "2 year warranty",
      spec: { "Stitch patterns": "23 built-in", Speed: "1100 stitches/min", Type: "Electric, heavy-duty domestic", Bobbin: "Front-loading", Motor: "Stronger 60% motor", Feature: "Metal frame, stainless bedplate" },
    },
    {
      brand: "Jack", name: "Jack F4 Industrial Straight Stitch", model: "JK-F4", priceMin: 48000, priceMax: 55000,
      warranty: "1 year warranty (head)",
      spec: { "Stitch type": "Single needle lockstitch", Speed: "5000 stitches/min", Type: "Industrial, direct drive", Bobbin: "Rotary hook", Motor: "Built-in servo motor", Feature: "Auto trimmer, energy saving" },
    },
    {
      brand: "Butterfly", name: "Butterfly JH8190", model: "JH8190", priceMin: 8500, priceMax: 10000,
      warranty: "1 year warranty",
      spec: { "Stitch patterns": "Straight + zigzag", Speed: "700 stitches/min", Type: "Electric, domestic", Bobbin: "Front-loading", Motor: "60 W", Feature: "Compact, light weight" },
    },
  ],
};

function imageUrl(bg: string, label: string): string {
  const text = encodeURIComponent(label).replace(/%20/g, "+");
  // Muted slate text on the light tint — reads as a tasteful placeholder.
  return `https://placehold.co/900x675/${bg}/64748b.png?font=source-sans-pro&text=${text}`;
}

async function ensureCategory(c: CategorySeed): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, c.slug))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(categories)
    .values({ slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, icon: c.icon })
    .returning({ id: categories.id });
  console.log(`  + category ${c.slug}`);
  return row!.id;
}

async function ensureBrand(name: string, aboutEn?: string, aboutBn?: string): Promise<string> {
  const slug = slugify(name);
  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(brands)
    .values({ slug, name, aboutEn: aboutEn ?? null, aboutBn: aboutBn ?? null })
    .returning({ id: brands.id });
  console.log(`  + brand ${name}`);
  return row!.id;
}

async function ensureProduct(
  categoryId: string,
  color: string,
  brandIds: Map<string, string>,
  p: ProductSeed,
): Promise<void> {
  const slug = slugify(`${p.brand} ${p.model}`);
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (existing) {
    console.log(`  = product ${slug} (exists)`);
    return;
  }

  const brandId = brandIds.get(p.brand);
  if (!brandId) throw new Error(`brand not seeded: ${p.brand}`);

  const primary = imageUrl(color, p.name);
  const [row] = await db
    .insert(products)
    .values({
      slug,
      categoryId,
      brandId,
      name: p.name,
      modelNo: p.model,
      status: p.status ?? "active",
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      warrantyText: p.warranty,
      spec: p.spec,
      primaryImage: primary,
    })
    .returning({ id: products.id });

  await db.insert(productImages).values([
    { productId: row!.id, url: primary, sort: 0 },
    { productId: row!.id, url: imageUrl(color, `${p.brand} — ${p.model}`), sort: 1 },
  ]);
  console.log(`  + product ${slug}`);
}

async function main() {
  console.log("Seeding catalogue…");

  const brandIds = new Map<string, string>();
  for (const b of BRANDS) {
    brandIds.set(b.name, await ensureBrand(b.name, b.aboutEn, b.aboutBn));
  }

  for (const c of CATEGORIES) {
    const categoryId = await ensureCategory(c);
    for (const p of PRODUCTS[c.slug] ?? []) {
      await ensureProduct(categoryId, c.color, brandIds, p);
    }
  }

  console.log("Done.");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
