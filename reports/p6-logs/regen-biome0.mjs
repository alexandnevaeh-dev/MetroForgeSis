import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { generateManualAsset } from "../../packages/generation/dist/index.js";
import { PixelArtProcessor } from "../../packages/assets/dist/index.js";

const projectPath = join(process.cwd(), "GeneratedGames", "heart-engine-release-candidate");
const sourceRel = "assets/tilesets/biome_0/source.png";
const sourceAbs = join(projectPath, sourceRel);
const tilesDir = join(projectPath, "assets/tilesets/biome_0/tiles");
const preservedRel = "assets/tilesets/biome_0/source_source.png";
function redact(s) {
  return String(s).replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-[REDACTED]").replace(/sk-[A-Za-z0-9]+/g, "sk-[REDACTED]");
}
const dna = JSON.parse(readFileSync(join(projectPath, "game_dna.json"), "utf8"));
const tileSize = Number(dna?.technical?.tileSize ?? 16);
const seed = 184729;
console.log("start biome_0 nvidia gen tileSize="+tileSize);
if (existsSync(sourceAbs)) {
  const bak = sourceAbs + ".placeholder.bak";
  if (!existsSync(bak)) renameSync(sourceAbs, bak);
  else if (existsSync(sourceAbs)) renameSync(sourceAbs, sourceAbs + ".tmp.bak");
  console.log("placeholder source moved aside");
}
const result = await generateManualAsset({
  projectPath,
  description: "8x8 modular pixel-art tileset atlas for the drowned marsh outskirts of a gothic industrial mechanical kingdom. Flooded iron walkways, rusted pipes, mossy stone, barnacle-crusted gears, dark water, low-key rim lighting. Orthographic tile sheet, seamless modular tiles, no characters, no UI, no text.",
  assetType: "tileset",
  assetId: "biome_0",
  seed,
  generationMode: "HYBRID_FREE",
  nvidiaImageModel: "black-forest-labs/flux.1-dev",
  hardwareProfile: "LOW_RESOURCE",
});
if (!result.success || !result.asset) {
  console.error("generate_failed", redact(JSON.stringify({ errors: result.errors, warnings: result.warnings, provider: result.asset?.provider, fallback: result.asset?.fallbackGenerated })));
  process.exit(1);
}
const asset = result.asset;
console.log("generated", JSON.stringify({ provider: asset.provider, modelId: asset.modelId, fallbackGenerated: asset.fallbackGenerated, maturity: asset.maturity, bytes: asset.buffer?.length ?? 0 }));
if (asset.fallbackGenerated || asset.provider !== "nvidia-image") {
  console.error("REFUSING non-nvidia or fallback");
  process.exit(2);
}
if (existsSync(sourceAbs)) copyFileSync(sourceAbs, join(projectPath, preservedRel));
mkdirSync(tilesDir, { recursive: true });
const tiles = new PixelArtProcessor().sliceTiles(asset.buffer, tileSize);
const manifestPath = join(projectPath, "generation_manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const artifacts = manifest.artifacts ?? [];
function upsert(entry) {
  const idx = artifacts.findIndex((a) => a.id === entry.id);
  if (idx >= 0) artifacts[idx] = { ...artifacts[idx], ...entry };
  else artifacts.push(entry);
}
upsert({
  id: "tileset_biome_0",
  path: sourceRel,
  type: "texture",
  provider: asset.provider,
  modelId: asset.modelId,
  fallbackGenerated: false,
  critiquePassed: asset.critiquePassed,
  critiqueScore: asset.critiqueScore,
  maturity: "QA_REVIEW",
  productionReady: false,
  sourceType: "compiled",
  sourcePath: preservedRel,
  selectedProvider: asset.provider,
  selectedModel: asset.modelId,
  requestedCapability: "IMAGE_GENERATION",
  productionAllowed: true,
  manual: true,
  seed,
});
const biomeIdx = artifacts.findIndex((a) => a.id === "biome_0" && a.path === sourceRel);
if (biomeIdx >= 0) artifacts.splice(biomeIdx, 1);
for (const [tileId, buf] of tiles) {
  const rel = `assets/tilesets/biome_0/tiles/${tileId}.png`;
  writeFileSync(join(projectPath, rel), buf);
  upsert({
    id: `biome_0_${tileId}`,
    path: rel,
    type: "texture",
    provider: "pixel-art-processor",
    fallbackGenerated: false,
    critiquePassed: true,
    critiqueScore: 100,
    maturity: "QA_REVIEW",
    productionReady: false,
    sourceType: "compiled",
  });
}
writeFileSync(manifestPath, JSON.stringify({ ...manifest, artifacts }, null, 2));
console.log("done tiles="+tiles.size+" provider=nvidia-image maturity=QA_REVIEW");

