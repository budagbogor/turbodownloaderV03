import fs from "fs";
import path from "path";

const iconsDir = path.join(process.cwd(), "extension", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1x1 solid indigo PNG base64
const pngBase64 = "iVBORw0KGgoAAAANSU5EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const buffer = Buffer.from(pngBase64, "base64");

fs.writeFileSync(path.join(iconsDir, "icon16.png"), buffer);
fs.writeFileSync(path.join(iconsDir, "icon48.png"), buffer);
fs.writeFileSync(path.join(iconsDir, "icon128.png"), buffer);

console.log("Icons created successfully!");
