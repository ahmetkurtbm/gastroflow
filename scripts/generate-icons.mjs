// public/icon.svg ve public/maskable.svg'den PWA ve iOS simgelerini üretir.
// Kullanım: node scripts/generate-icons.mjs
import sharp from "sharp";

const jobs = [
  ["public/icon.svg", "public/pwa-192x192.png", 192],
  ["public/icon.svg", "public/pwa-512x512.png", 512],
  ["public/maskable.svg", "public/maskable-icon-512x512.png", 512],
  ["public/maskable.svg", "public/apple-touch-icon.png", 180],
];

for (const [source, target, size] of jobs) {
  await sharp(source, { density: 384 }).resize(size, size).png().toFile(target);
  console.log(target);
}
