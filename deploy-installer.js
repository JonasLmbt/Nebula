import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const releaseDir = "./release";
const serverPath = "root@188.245.182.162:/var/www/nebula-site/downloads/";

// 1. Find newest .exe file in release/
const files = fs.readdirSync(releaseDir)
  .filter(f => f.toLowerCase().endsWith(".exe"))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(releaseDir, f)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time);

if (files.length === 0) {
  console.error("No .exe files found in release/");
  process.exit(1);
}

const newestFile = files[0].name;
const sourcePath = path.join(releaseDir, newestFile);

const localLatest = path.join(releaseDir, "Nebula-Setup-latest.exe");

// 2. Copy newest file → Nebula-Setup-latest.exe
fs.copyFileSync(sourcePath, localLatest);
console.log(`Copied newest installer: ${newestFile}`);
console.log("Created Nebula-Setup-latest.exe");

// 3. Upload via SCP
const command = `scp "${localLatest}" "${serverPath}"`;
console.log("Uploading Nebula-Setup-latest.exe to server...");
execSync(command, { stdio: "inherit" });

console.log("Deployment complete!");