import fs from "fs";
import path from "path";

// ---------- Helpers ----------

// Map population to city size
const sizeFromPopulation = (pop) =>
  pop < 500 ? 8 :
  pop < 2000 ? 10 :
  pop < 10000 ? 12 :
  pop < 50000 ? 14 :
  16;

// Build City URL
const cityUrl = (b, name, population, seed) =>
  `https://watabou.github.io/city-generator/` +
  `?size=${sizeFromPopulation(population)}` +
  `&seed=${seed}` +
  `&name=${encodeURIComponent(name)}` +
  `&population=${population}` +
  `&citadel=${b.citadel || 0}` +
  `&urban_castle=0` +
  `&plaza=${b.plaza || 0}` +
  `&temple=${b.temple || 0}` +
  `&walls=${b.walls || 0}` +
  `&shantytown=${b.shanty || 0}` +
  `&coast=${b.port ? 1 : 0}` +
  `&river=0` +
  `&greens=0` +
  `&hub=${b.capital ? 1 : 0}`;

// Build Village URL
const villageUrl = (name, population, seed) =>
  `https://watabou.github.io/village-generator/` +
  `?seed=${seed}` +
  `&tags=isolated` +
  `&name=${encodeURIComponent(name)}` +
  `&pop=${population}` +
  `&trees=${Math.floor(Math.random() * 1e10)}`;

// Create burg data object
const createBurgData = (b) => {
  const name = b.name || `Burg${b.i}`;
  const safeName = name.replace(/[^a-z0-9_-]/gi, "_");
  const population = Math.round(b.population || 0);
  const seed = b.i || Math.floor(Math.random() * 1e9);

  const isVillage = population < 2000;
  const watabouUrl = isVillage
    ? villageUrl(name, population, seed)
    : cityUrl(b, name, population, seed);

  return {
    fileName: `${safeName}.json`,
    data: {
      id: b.i,
      name,
      population,
      type: isVillage ? "village" : "city",
      coords: { x: b.x, y: b.y },
      watabouUrl,
      raw: b
    }
  };
};


// ---------- Main Script ----------

const azgaarFile = "./Shouboks Full.json";
const outDir = "./burgs";

const main = () => {
  const data = JSON.parse(fs.readFileSync(azgaarFile, "utf-8"));
  const burgs = data?.pack?.burgs || [];

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  burgs
    .map(createBurgData)
    .forEach(({ fileName, data }) => {
      fs.writeFileSync(
        path.join(outDir, fileName),
        JSON.stringify(data, null, 2),
        "utf-8"
      );
    });

  console.log(`✅ Generated ${burgs.length} burg files in ${outDir}/`);
};

main();
