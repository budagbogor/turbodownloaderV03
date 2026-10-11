import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const pkgPath = path.join(rootDir, "package.json");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const cargoPath = path.join(rootDir, "src-tauri", "Cargo.toml");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const parts = pkg.version.split(".").map(Number);

const mode = process.argv[2] || "patch";
if (mode === "minor") {
  parts[1] += 1;
  parts[2] = 0;
} else if (mode === "major") {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else {
  parts[2] += 1;
}

const newVersion = parts.join(".");
console.log(`[Version Bump] ${pkg.version} -> ${newVersion}`);

// 1. Update package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 2. Update src-tauri/tauri.conf.json
if (fs.existsSync(tauriConfPath)) {
  const conf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
  conf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + "\n");
}

// 3. Update src-tauri/Cargo.toml
if (fs.existsSync(cargoPath)) {
  let cargo = fs.readFileSync(cargoPath, "utf-8");
  cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${newVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
}

console.log(`[Version Bump] Berhasil memperbarui seluruh file ke v${newVersion}!`);
