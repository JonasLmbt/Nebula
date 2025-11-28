import fs from "fs";
import path from "path";

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  fs.copyFileSync(
    "./node_modules/chart.js/dist/chart.umd.js",
    path.join(dest, "chart.umd.js")
  );
}

copyRecursive("src/renderer", "dist/renderer");
