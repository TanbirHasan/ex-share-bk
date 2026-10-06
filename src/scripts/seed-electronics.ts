import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../db/client";
import { brands, categories, productImages, products } from "../db/schema";
import { slugify } from "../lib/slug";

/**
 * Seed a second batch of catalogue data: consumer-electronics categories not
 * covered by seed-catalog.ts (laptops, TVs, earbuds, smartwatches, power
 * banks, speakers). Idempotent — re-running skips anything already present
 * by slug. Placeholder images from placehold.co.
 *
 *   cd backend && yarn tsx src/scripts/seed-electronics.ts
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

const CATEGORIES: CategorySeed[] = [
  { slug: "laptop", nameEn: "Laptop", nameBn: "ল্যাপটপ", icon: "laptop", color: "eef2f7" },
  { slug: "television", nameEn: "Television", nameBn: "টেলিভিশন", icon: "television", color: "f0edf7" },
  { slug: "earbuds", nameEn: "Earbuds & Headphones", nameBn: "ইয়ারবাড ও হেডফোন", icon: "headphones", color: "eaf0f6" },
  { slug: "smartwatch", nameEn: "Smartwatch", nameBn: "স্মার্টওয়াচ", icon: "smartwatch", color: "f6f0e8" },
  { slug: "power-bank", nameEn: "Power Bank", nameBn: "পাওয়ার ব্যাংক", icon: "power-bank", color: "eef2f7" },
  { slug: "speaker", nameEn: "Bluetooth Speaker", nameBn: "ব্লুটুথ স্পিকার", icon: "speaker", color: "f0edf7" },
];

// Brands already seeded by seed-catalog.ts (Samsung, Xiaomi, Walton, LG,
// Vision) are referenced by the same name here — ensureBrand is idempotent
// by slug, so this reuses them instead of duplicating.
const BRANDS: { name: string; aboutEn?: string; aboutBn?: string }[] = [
  { name: "Samsung" }, { name: "Xiaomi" }, { name: "Walton" }, { name: "LG" }, { name: "Vision" },
  { name: "Dell", aboutEn: "US laptop brand with wide Bangladesh service coverage.", aboutBn: "বাংলাদেশে ব্যাপক সার্ভিস কাভারেজসহ মার্কিন ল্যাপটপ ব্র্যান্ড।" },
  { name: "HP", aboutEn: "Long-established laptop and printer brand.", aboutBn: "দীর্ঘদিনের প্রতিষ্ঠিত ল্যাপটপ ও প্রিন্টার ব্র্যান্ড।" },
  { name: "Lenovo", aboutEn: "Popular budget-to-midrange laptop brand.", aboutBn: "জনপ্রিয় বাজেট থেকে মিডরেঞ্জ ল্যাপটপ ব্র্যান্ড।" },
  { name: "Asus", aboutEn: "Taiwanese brand known for build quality and gaming laptops.", aboutBn: "বিল্ড কোয়ালিটি ও গেমিং ল্যাপটপের জন্য পরিচিত তাইওয়ানিজ ব্র্যান্ড।" },
  { name: "Apple", aboutEn: "Premium laptops, tablets and audio gear.", aboutBn: "প্রিমিয়াম ল্যাপটপ, ট্যাবলেট ও অডিও পণ্য।" },
  { name: "Sony", aboutEn: "Japanese brand strong in TVs and audio.", aboutBn: "টিভি ও অডিওতে শক্তিশালী জাপানি ব্র্যান্ড।" },
  { name: "boAt", aboutEn: "India-origin budget audio brand popular with younger buyers.", aboutBn: "তরুণ ক্রেতাদের কাছে জনপ্রিয় ভারত-উৎসের বাজেট অডিও ব্র্যান্ড।" },
  { name: "JBL", aboutEn: "Harman-owned audio brand, widely trusted for speakers and earbuds.", aboutBn: "স্পিকার ও ইয়ারবাডের জন্য ব্যাপকভাবে বিশ্বস্ত Harman-মালিকানাধীন অডিও ব্র্যান্ড।" },
  { name: "OnePlus", aboutEn: "Smartphone brand that also makes earbuds and watches.", aboutBn: "স্মার্টফোন ব্র্যান্ড যারা ইয়ারবাড ও ওয়াচও তৈরি করে।" },
  { name: "Amazfit", aboutEn: "Fitness-focused smartwatch brand.", aboutBn: "ফিটনেস-কেন্দ্রিক স্মার্টওয়াচ ব্র্যান্ড।" },
  { name: "Noise", aboutEn: "Budget smartwatch and audio brand.", aboutBn: "বাজেট স্মার্টওয়াচ ও অডিও ব্র্যান্ড।" },
  { name: "Anker", aboutEn: "Charging and power-bank specialist brand.", aboutBn: "চার্জিং ও পাওয়ার ব্যাংক বিশেষজ্ঞ ব্র্যান্ড।" },
  { name: "Ultra Prolink", aboutEn: "Affordable power accessories brand.", aboutBn: "সাশ্রয়ী পাওয়ার অ্যাক্সেসরিজ ব্র্যান্ড।" },
  { name: "Marshall", aboutEn: "Premium audio brand known for retro-styled speakers.", aboutBn: "রেট্রো-স্টাইলের স্পিকারের জন্য পরিচিত প্রিমিয়াম অডিও ব্র্যান্ড।" },
];

const PRODUCTS: Record<string, ProductSeed[]> = {
  laptop: [
    { brand: "Dell", name: "Dell Vostro 3510", model: "3510", priceMin: 62000, priceMax: 68000,
      warranty: "1 year international warranty",
      spec: { CPU: "Core i5-1135G7", RAM: "8 GB", Storage: "512 GB SSD", Display: '15.6" FHD', Graphics: "Intel Iris Xe", OS: "Windows 11" } },
    { brand: "HP", name: "HP 15s-fq5xxx", model: "15s-fq5xxx", priceMin: 48000, priceMax: 52000,
      warranty: "1 year official warranty",
      spec: { CPU: "Core i3-1215U", RAM: "8 GB", Storage: "256 GB SSD", Display: '15.6" FHD', Graphics: "Intel UHD", OS: "Windows 11" } },
    { brand: "Lenovo", name: "Lenovo IdeaPad Slim 3", model: "15ABR8", priceMin: 55000, priceMax: 60000,
      warranty: "1 year official warranty",
      spec: { CPU: "Ryzen 5 7520U", RAM: "8 GB", Storage: "512 GB SSD", Display: '15.6" FHD', Graphics: "AMD Radeon", OS: "Windows 11" } },
    { brand: "Asus", name: "Asus Vivobook 15", model: "X1504ZA", priceMin: 68000, priceMax: 74000, status: "new",
      warranty: "2 year official warranty",
      spec: { CPU: "Core i5-1235U", RAM: "16 GB", Storage: "512 GB SSD", Display: '15.6" FHD', Graphics: "Intel Iris Xe", OS: "Windows 11" } },
    { brand: "Apple", name: "Apple MacBook Air M1", model: "MGND3", priceMin: 98000, priceMax: 105000,
      warranty: "1 year Apple limited warranty",
      spec: { CPU: "Apple M1", RAM: "8 GB", Storage: "256 GB SSD", Display: '13.3" Retina', Graphics: "7-core GPU", OS: "macOS" } },
  ],
  television: [
    { brand: "Walton", name: "Walton 43\" Smart LED TV", model: "WD43", priceMin: 28000, priceMax: 32000,
      warranty: "2 year service warranty",
      spec: { Size: "43 inch", Resolution: "Full HD", Panel: "LED", Smart: "Android TV", Ports: "3x HDMI, 2x USB", Sound: "20W" } },
    { brand: "Samsung", name: "Samsung 43\" Crystal UHD 4K", model: "UA43AU7700", priceMin: 45000, priceMax: 50000,
      warranty: "1 year official warranty (Samsung Bangladesh)",
      spec: { Size: "43 inch", Resolution: "4K UHD", Panel: "Crystal Display", Smart: "Tizen OS", Ports: "3x HDMI, 1x USB", Sound: "20W" } },
    { brand: "LG", name: "LG 32\" HD Smart TV", model: "32LQ63", priceMin: 20000, priceMax: 23000,
      warranty: "2 year official warranty",
      spec: { Size: "32 inch", Resolution: "HD", Panel: "LED", Smart: "webOS", Ports: "2x HDMI, 1x USB", Sound: "10W" } },
    { brand: "Vision", name: "Vision 55\" 4K Android TV", model: "VIS-55AT", priceMin: 52000, priceMax: 58000, status: "new",
      warranty: "2 year service warranty",
      spec: { Size: "55 inch", Resolution: "4K UHD", Panel: "LED", Smart: "Android TV", Ports: "3x HDMI, 2x USB", Sound: "24W" } },
    { brand: "Sony", name: "Sony Bravia 43\" X75K", model: "KD-43X75K", priceMin: 62000, priceMax: 68000,
      warranty: "1 year official warranty",
      spec: { Size: "43 inch", Resolution: "4K UHD", Panel: "LED", Smart: "Google TV", Ports: "3x HDMI, 2x USB", Sound: "20W" } },
  ],
  earbuds: [
    { brand: "boAt", name: "boAt Airdopes 141", model: "Airdopes 141", priceMin: 1500, priceMax: 1800,
      warranty: "1 year official warranty",
      spec: { Type: "True wireless (TWS)", Battery: "42h total playback", Driver: "8mm", "Water resistance": "IPX4", Charging: "Type-C", Feature: "ENx tech, low latency" } },
    { brand: "JBL", name: "JBL Tune 230NC TWS", model: "T230NC", priceMin: 6500, priceMax: 7500,
      warranty: "1 year official warranty",
      spec: { Type: "True wireless (TWS)", Battery: "40h with case", Driver: "6.8mm", "Water resistance": "None", Charging: "Type-C", Feature: "Active Noise Cancelling" } },
    { brand: "Xiaomi", name: "Redmi Buds 4 Active", model: "Buds 4 Active", priceMin: 1800, priceMax: 2200,
      warranty: "6 month warranty",
      spec: { Type: "True wireless (TWS)", Battery: "20h total playback", Driver: "12mm", "Water resistance": "IPX4", Charging: "Type-C", Feature: "Low latency game mode" } },
    { brand: "OnePlus", name: "OnePlus Nord Buds 2", model: "Nord Buds 2", priceMin: 3200, priceMax: 3800, status: "new",
      warranty: "1 year official warranty",
      spec: { Type: "True wireless (TWS)", Battery: "36h with case", Driver: "12.4mm", "Water resistance": "IP55", Charging: "Type-C", Feature: "30dB ANC" } },
  ],
  smartwatch: [
    { brand: "Amazfit", name: "Amazfit Bip 5", model: "Bip 5", priceMin: 5500, priceMax: 6500,
      warranty: "1 year official warranty",
      spec: { Display: '1.91" HD', Battery: "Up to 10 days", GPS: "Built-in", "Water resistance": "5 ATM", "Health sensors": "SpO2, heart rate, sleep", Compatibility: "Android & iOS" } },
    { brand: "Noise", name: "Noise ColorFit Pulse Go Buzz", model: "Pulse Go Buzz", priceMin: 2200, priceMax: 2600,
      warranty: "1 year warranty",
      spec: { Display: '1.69" HD', Battery: "Up to 5 days", GPS: "Connected (phone)", "Water resistance": "IP68", "Health sensors": "SpO2, heart rate", Compatibility: "Android & iOS" } },
    { brand: "Samsung", name: "Samsung Galaxy Watch 6", model: "SM-R930", priceMin: 24000, priceMax: 27000, status: "new",
      warranty: "1 year official warranty (Samsung Bangladesh)",
      spec: { Display: '1.3" Super AMOLED', Battery: "Up to 40 hours", GPS: "Built-in", "Water resistance": "5 ATM + IP68", "Health sensors": "ECG, SpO2, body comp", Compatibility: "Android" } },
    { brand: "Xiaomi", name: "Redmi Watch 4", model: "Watch 4", priceMin: 6000, priceMax: 7000,
      warranty: "6 month warranty",
      spec: { Display: '1.97" AMOLED', Battery: "Up to 20 days", GPS: "Built-in", "Water resistance": "5 ATM", "Health sensors": "SpO2, heart rate, sleep", Compatibility: "Android & iOS" } },
  ],
  "power-bank": [
    { brand: "Xiaomi", name: "Mi Power Bank 3i 20000mAh", model: "PB2050DZM", priceMin: 2200, priceMax: 2600,
      warranty: "6 month warranty",
      spec: { Capacity: "20000 mAh", Output: "18W fast charge (two-way)", Ports: "2x USB-A, 1x USB-C", Weight: "~400g", Feature: "Low-current mode for earbuds" } },
    { brand: "Anker", name: "Anker PowerCore 10000", model: "A1263", priceMin: 3200, priceMax: 3800,
      warranty: "1.5 year official warranty",
      spec: { Capacity: "10000 mAh", Output: "12W", Ports: "1x USB-A, 1x USB-C input", Weight: "~180g", Feature: "PowerIQ, compact size" } },
    { brand: "Ultra Prolink", name: "Ultra Prolink 10000mAh Power Bank", model: "UP1005", priceMin: 1500, priceMax: 1800,
      warranty: "1 year warranty",
      spec: { Capacity: "10000 mAh", Output: "10W", Ports: "2x USB-A", Weight: "~220g", Feature: "LED charge indicator" } },
    { brand: "Walton", name: "Walton Power Bank WPB10Q", model: "WPB10Q", priceMin: 1200, priceMax: 1500,
      warranty: "1 year service warranty",
      spec: { Capacity: "10000 mAh", Output: "10W", Ports: "2x USB-A, 1x USB-C input", Weight: "~210g", Feature: "Digital charge display" } },
  ],
  speaker: [
    { brand: "JBL", name: "JBL Go 3", model: "Go 3", priceMin: 2800, priceMax: 3200,
      warranty: "1 year official warranty",
      spec: { Type: "Portable Bluetooth", Battery: "5 hours", Output: "4.2W", "Water resistance": "IP67", Connectivity: "Bluetooth 5.1", Weight: "~209g" } },
    { brand: "Walton", name: "Walton Speaker WBS-S20", model: "WBS-S20", priceMin: 1800, priceMax: 2200,
      warranty: "1 year service warranty",
      spec: { Type: "Portable Bluetooth", Battery: "6 hours", Output: "10W", "Water resistance": "Splash resistant", Connectivity: "Bluetooth 5.0", Weight: "~320g" } },
    { brand: "Sony", name: "Sony SRS-XB13", model: "SRS-XB13", priceMin: 4500, priceMax: 5200,
      warranty: "1 year official warranty",
      spec: { Type: "Portable Bluetooth", Battery: "16 hours", Output: "Extra Bass", "Water resistance": "IP67", Connectivity: "Bluetooth 5.0", Weight: "~267g" } },
    { brand: "Marshall", name: "Marshall Emberton II", model: "Emberton II", priceMin: 15000, priceMax: 17000, status: "new",
      warranty: "1 year official warranty",
      spec: { Type: "Portable Bluetooth", Battery: "30 hours", Output: "360° sound", "Water resistance": "IP67", Connectivity: "Bluetooth 5.1", Weight: "~700g" } },
  ],
};

function imageUrl(bg: string, label: string): string {
  const text = encodeURIComponent(label).replace(/%20/g, "+");
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
  console.log("Seeding electronics catalogue…");

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
