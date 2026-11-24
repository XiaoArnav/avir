import fs from 'node:fs';
import path from 'node:path';

const cesiumBuildDir = path.resolve('node_modules/cesium/Build/Cesium');
const targetDir = path.resolve('public/cesium');
const isProductionOrCI = Boolean(process.env.CI || process.env.NODE_ENV === 'production');

if (!fs.existsSync(cesiumBuildDir)) {
  const msg = 'Cesium build directory not found at node_modules/cesium/Build/Cesium.';
  if (isProductionOrCI) {
    console.error(`[ERROR] ${msg} Ensure the "cesium" package is installed before building.`);
    process.exit(1);
  } else {
    console.warn(`[WARN] ${msg} Skipping asset copy in non-production environment.`);
    process.exit(0);
  }
}

fs.mkdirSync(targetDir, { recursive: true });

const folders = ['Workers', 'Assets', 'Widgets', 'ThirdParty'];

for (const folder of folders) {
  const src = path.join(cesiumBuildDir, folder);
  const dst = path.join(targetDir, folder);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
    console.log(`[OK] Synchronized ${folder} -> public/cesium/${folder}`);
  } else if (isProductionOrCI) {
    console.error(`[ERROR] Essential Cesium asset directory missing: ${src}`);
    process.exit(1);
  }
}

console.log('Cesium static assets verified and copied successfully.');
