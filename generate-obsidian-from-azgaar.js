import fs from 'fs';
import path from 'path';

/** ===== CONFIG ===== */
const INPUT_FILE = './Shouboks Full.json';
const OUT_DIR = '../../Obsidian/Yet-Another-D-D-Party/World';
const CITY_FRAME_NAME = 'City Generator'; // must exist in Custom Frames plugin config
const CITY_FRAME_HEIGHT = '500px';

// Optional: If you want to nudge all geo: links uniformly
const GEO_OFFSET = { lat: 0, lon: 0 };

const extent = {
  lonW: -55.601047668,
  lonE: 55.70423321,
  latS: -26.562368918,
  latN: 29.801070265,
};
const width = 1280;
const height = 683;

/** ===== UTILS ===== */
const ensureDir = p => fs.existsSync(p) || fs.mkdirSync(p, { recursive: true });
const safe = s => String(s).trim();

const fmtNum = n => n.toLocaleString('en-US');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf-8'));

const writeNote = (folder, fileName, content) => {
  ensureDir(folder);
  fs.writeFileSync(path.join(folder, fileName), content, 'utf-8');
};

const frontmatter = obj => {
  const tags = obj.type
    ? [obj.type, ...(obj.tags ?? [])]
    : [...(obj.tags ?? [])];
  return (
    '---\n' +
    (tags.length ? `tags: [${[...new Set(tags)].join(', ')}]\n` : '') +
    Object.entries(obj)
      .filter(([k]) => k !== 'tags')
      .map(([k, v]) => `${k}: ${v ?? ''}`)
      .join('\n') +
    '\n---\n'
  );
};

const mdTable = rows => {
  const head = `| Property | Value |\n|---|---|\n`;
  const body = rows.map(([k, v]) => `| ${k} | ${v ?? ''} |`).join('\n');
  return head + body + '\n';
};

/** Resolve an indexed relation to a markdown wikilink using an array of entities */
const makeResolver = (arr, label) => idx => {
  if (idx == null || idx < 0 || idx >= arr.length) return '';
  const name = arr[idx]?.name ?? `${label}_${idx}`;
  return `[[${safe(name)}]]`;
};

// --- Base mapping: Azgaar pixel (x,y) -> WGS84 lat/lon using your QGIS extent ---
export const azgaarToLatLon = (
  x,
  y,
  width,
  height,
  { lonW, lonE, latS, latN },
) => {
  const lon = lonW + (x / width) * (lonE - lonW);
  const lat = latN - (y / height) * (latN - latS); // y grows downward
  return { lat, lon };
};

// --- Calibration from your samples (least-squares fit) ---
// moved ≈ a*generated + b
// Computed from your 4 pairs:
const A_LAT = 1.05846021887805;
const B_LAT = -1.773351652015122;
const A_LON = 1.0003934547513011;
const B_LON = -0.014260563992843832;

export const applyCalibration = ({ lat, lon }) => ({
  lat: A_LAT * lat + B_LAT,
  lon: A_LON * lon + B_LON,
});

// --- One-call helper: pixel -> calibrated WGS84 ---
export const azgaarToCalibratedLatLon = (x, y, width, height, extent) =>
  applyCalibration(azgaarToLatLon(x, y, width, height, extent));

/** City generator size from population (people, not thousands) */
const sizeFromPopulation = pop =>
  pop < 500 ? 8 : pop < 2000 ? 10 : pop < 10000 ? 12 : pop < 50000 ? 14 : 16;

/** Build Watabou City Generator URL for a burg */
const cityUrl = (b, name, population, seed) =>
  'https://watabou.github.io/city-generator/' +
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

const getReligionLinkForBurg = (b, cells, religions) => {
  if (b.cell == null) return '';
  const cell = cells?.[b.cell];
  if (cell == null) return '';
  return religions[cell.religion];
};

/** ===== MAIN ===== */
const main = () => {
  const data = readJson(INPUT_FILE);
  const pack = data?.pack ?? {};

  const cultures = pack.cultures ?? [];
  const states = pack.states ?? [];
  const provinces = pack.provinces ?? [];
  const religions = pack.religions ?? [];
  const zones = pack.zones ?? [];
  const burgs = pack.burgs ?? [];

  // Resolvers
  const cultureLink = makeResolver(cultures, 'Culture');
  const stateLink = makeResolver(states, 'State');
  const provLink = makeResolver(provinces, 'Province');
  const relLink = makeResolver(religions, 'Religion');
  const zoneLink = makeResolver(zones, 'Zone');

  // Output folders
  const F = {
    root: OUT_DIR,
    cultures: path.join(OUT_DIR, 'cultures'),
    states: path.join(OUT_DIR, 'states'),
    provinces: path.join(OUT_DIR, 'provinces'),
    religions: path.join(OUT_DIR, 'religions'),
    zones: path.join(OUT_DIR, 'zones'),
    burgs: path.join(OUT_DIR, 'burgs'),
  };
  Object.values(F).forEach(ensureDir);

  // Helper to make a generic entity note
  const makeEntityNote = ({ type, id, name, rows }) => {
    const fileName = `${safe(name)}.md`;
    const fm = frontmatter({ type });
    const title = `# ${name}\n\n`;
    const table = mdTable(rows);
    writeNote(F[type], fileName, fm + title + table);
  };

  // CULTURES
  cultures.forEach((c, i) => {
    makeEntityNote({
      type: 'cultures',
      id: i,
      name: c?.name ?? `Culture_${i}`,
      rows: [
        ['Type', 'Culture'],
        ['ID', String(i)],
        ['Color', c?.color ?? ''],
        ['Base', c?.base ?? ''],
        ['Origins', c?.origins ?? ''],
      ],
    });
  });

  // STATES
  states.forEach((s, i) => {
    makeEntityNote({
      type: 'states',
      id: i,
      name: s?.name ?? `State_${i}`,
      rows: [
        ['Type', 'State'],
        ['ID', String(i)],
        [
          'Capital',
          s?.capital != null
            ? burgs[s.capital]?.name ?? `Burg_${s.capital}`
            : '',
        ],
        ['Culture', cultureLink(s?.culture)],
        ['Type/Forms', s?.type ?? ''],
      ],
    });
  });

  // PROVINCES
  provinces.forEach((p, i) => {
    makeEntityNote({
      type: 'provinces',
      id: i,
      name: p?.name ?? `Province_${i}`,
      rows: [
        ['Type', 'Province'],
        ['ID', String(i)],
        ['State', stateLink(p?.state)],
        ['Culture', cultureLink(p?.culture)],
      ],
    });
  });

  // RELIGIONS
  religions.forEach((r, i) => {
    makeEntityNote({
      type: 'religions',
      id: i,
      name: r?.name ?? `Religion_${i}`,
      rows: [
        ['Type', 'Religion'],
        ['ID', String(i)],
        ['Form', r?.form ?? ''],
        ['Color', r?.color ?? ''],
        ['Deity', r?.deity ?? ''],
      ],
    });
  });

  // ZONES
  zones.forEach((z, i) => {
    makeEntityNote({
      type: 'zones',
      id: i,
      name: z?.name ?? `Zone_${i}`,
      rows: [
        ['Type', 'Zone'],
        ['ID', String(i)],
        ['Type/Kind', z?.type ?? ''],
        ['Population (approx)', z?.population ?? ''],
      ],
    });
  });

  // BURGS
  burgs.forEach(b => {
    const id = b?.i ?? -1;
    const name = b?.name ?? `Burg_${id}`;
    // population is in thousands → convert to persons
    const population = Math.round((b?.population ?? 0) * 1000);

    const culture = cultures[b?.culture]?.name || `Culture_${b?.culture}`;
    const state = states[b?.state]?.name || `State_${b?.state}`;
    const religion = getReligionLinkForBurg(b, pack.cells, religions).name;

    // Watabou URL
    const seed = id > -1 ? id : Math.floor(Math.random() * 1e9);
    const url = cityUrl(b, name, population, seed);

    const { lat, lon } = azgaarToCalibratedLatLon(
      b.x,
      b.y,
      width,
      height,
      extent,
    );

    // If you don’t have lat/lon in the file, leave this blank or inject your own mapping later:
    const geoLink =
      lat != null && lon != null ? `[${name}](geo:${lat},${lon})` : '';

    const fileName = `${safe(name)}.md`;

    const tags = ['burg'];
    if (b.capital) tags.push('capital');
    if (population > 10000) tags.push('city');
    else if (population > 2000) tags.push('town');
    else tags.push('village');
    if (b.port) tags.push('port');
    if (b.walls) tags.push('walled');
    if (b.temple) tags.push('temple');
    const fm = frontmatter({
      type: 'burg',
      locations: '',
      tags,
      culture,
      state,
      religion,
      population,
    });

    const table = mdTable([
      ['Type', 'Burg'],
      ['ID', String(id)],
      ['State', stateLink(b?.state)],
      ['Province', provLink(b?.province)],
      ['Culture', cultureLink(b?.culture)],
      ['Religion', '[[' + safe(religion) + ']]'],
      ['Zone', zoneLink(b?.zone)],
      ['Population', population ? fmtNum(population) : ''],
      ['Capital', b?.capital ? 'Yes' : 'No'],
      ['Port', b?.port ? 'Yes' : 'No'],
      ['Walls', b?.walls ? 'Yes' : 'No'],
      ['Citadel', b?.citadel ? 'Yes' : 'No'],
      ['Plaza', b?.plaza ? 'Yes' : 'No'],
      ['Temple', b?.temple ? 'Yes' : 'No'],
      ['Type (Azgaar)', b?.type ?? ''],
    ]);

    const customFrame = [
      '```custom-frames',
      `frame: ${CITY_FRAME_NAME}`,
      `style: height: ${CITY_FRAME_HEIGHT};`,
      `urlSuffix: ${url.replace(
        'https://watabou.github.io/city-generator/',
        '',
      )}`,
      '```',
      '',
    ].join('\n');

    const linkLine = `[Open in generator](${url})\n`;

    const body = [
      fm,
      geoLink ? `# ${geoLink}\n` : '',
      customFrame,
      linkLine,
      table,
      '### 🧙 NPCs',
      '```dataview',
      'TABLE profession AS "Profession", race AS "Race"',
      'FROM "World/NPCs"',
      'WHERE location = this.file.name',
      'SORT name asc',
      '```',
    ].join('\n');

    writeNote(F.burgs, fileName, body);
  });

  console.log('✅ Done! Notes written to:', OUT_DIR);
};

main();
