import fs from 'node:fs';
import path from 'node:path';

const cesiumBuildDir = path.resolve('node_modules/cesium/Build/Cesium');
const targetDir = path.resolve('public/cesium');

if (!fs.existsSync(cesiumBuildDir)) {
  console.warn('Cesium Build directory not found in node_modules, skipping asset copy.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

const folders = ['Workers', 'Assets', 'Widgets', 'ThirdParty'];

for (const folder of folders) {
  const src = path.join(cesiumBuildDir, folder);
  const dst = path.join(targetDir, folder);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
    console.log(`Copied ${folder} to public/cesium/${folder}`);
  }
}

console.log('Cesium static assets copied successfully.');
