import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

const INPUT_FILES = [
  './Items Compendium.xml', // merged compendium
];
const OUTPUT_DIR = '../../Obsidian/Yet-Another-D-D-Party/Items';

const SELLERS = [
  'blacksmith',
  'alchemist',
  'merchant',
  'tanner',
  'weaver',
  'fisher',
  'baker',
  'herbalist',
  'innkeeper',
];

// Currency → copper conversion
const toCopper = value => {
  if (!value) return null;
  const clean = value.trim().toLowerCase();

  const match = clean.match(/([\d.]+)\s*(cp|sp|gp|ep|pp)/i);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'cp':
      return num;
    case 'sp':
      return num * 10;
    case 'ep':
      return num * 50;
    case 'gp':
      return num * 100;
    case 'pp':
      return num * 1000;
    default:
      return num;
  }
};

// Fallback prices by rarity & type
const rarityPrice = (rarity, name, type) => {
  if (!rarity) return null;
  const r = rarity.toLowerCase();

  const consumable = ['potion', 'elixir', 'scroll'].some(w =>
    name.toLowerCase().includes(w),
  );

  const gp = (() => {
    switch (r) {
      case 'common':
        return consumable ? 25 : 50;
      case 'uncommon':
        return consumable ? 100 : 200;
      case 'rare':
        return consumable ? 500 : 2000;
      case 'very rare':
        return consumable ? 5000 : 10000;
      case 'legendary':
        return consumable ? 50000 : 50000;
      default:
        return null;
    }
  })();

  return gp ? gp * 100 : null; // gp → copper
};

// Derive tags from type/magic
const deriveTags = item => {
  const tags = [];
  const type = (item.type?.[0] || '').toUpperCase();

  switch (type) {
    case 'M':
    case 'A':
      tags.push('weapon');
      break;
    case 'HA':
    case 'MA':
    case 'LA':
    case 'S':
      tags.push('armor');
      break;
    case 'G':
      tags.push('gear');
      break;
    case 'W':
      tags.push('wondrous');
      break;
    case '$':
      tags.push('currency');
      break;
    default:
      tags.push('item');
  }

  if (item.magic && item.magic[0] === '1') tags.push('magic');
  return tags;
};

// Determine subfolder by type
const deriveFolder = type => {
  switch (type) {
    case 'M':
    case 'A':
      return 'Weapons';
    case 'HA':
    case 'MA':
    case 'LA':
    case 'S':
      return 'Armor';
    case 'G':
      return 'Gear';
    case 'W':
      return 'Wondrous';
    case '$':
      return 'Currency';
    default:
      return 'Other';
  }
};

// Seller logic
const deriveSoldBy = item => {
  const name = (item.name?.[0] || '').toLowerCase();
  const type = (item.type?.[0] || '').toUpperCase();

  // multiple-seller sets
  if (
    name.includes('potion') ||
    name.includes('elixir') ||
    name.includes('scroll')
  ) {
    return ['merchant', 'alchemist', 'herbalist'];
  }

  if (['M', 'A', 'HA', 'MA', 'LA', 'S'].includes(type)) return ['blacksmith'];
  if (type === '$') return ['merchant'];
  if (type === 'W') return ['merchant'];
  if (type === 'G') {
    if (name.includes('alchemist')) return ['alchemist'];
    if (
      name.includes('poison') ||
      name.includes('antitoxin') ||
      name.includes('herb')
    )
      return ['herbalist', 'alchemist'];
    if (name.includes('fish') || name.includes('net'))
      return ['fisher', 'innkeeper'];
    if (
      name.includes('bread') ||
      name.includes('pie') ||
      name.includes('cake') ||
      name.includes('ration')
    )
      return ['baker', 'merchant', 'innkeeper'];
    if (
      name.includes('cloth') ||
      name.includes('robe') ||
      name.includes('silk')
    )
      return ['weaver'];
    if (
      name.includes('leather') ||
      name.includes('hide') ||
      name.includes('pelt')
    )
      return ['tanner', 'merchant'];
    if (name.includes('ale') || name.includes('wine') || name.includes('meal'))
      return ['innkeeper'];
    return ['merchant'];
  }

  return ['merchant'];
};

const deriveRarity = item => {
  // explicit <rarity> tag
  if (item.rarity && item.rarity[0]) {
    return item.rarity[0];
  }

  // check text entries for "Rarity: ..."
  if (item.text) {
    for (const t of item.text) {
      const m = t.match(/rarity:\s*([\w\s]+)/i);
      if (m) return m[1].trim();
    }
  }

  // if item is marked as magic → default Legendary
  if (item.magic && item.magic[0] === '1') {
    return 'Legendary';
  }

  // otherwise fallback to Common
  return 'Common';
};

// Process XML file
const processFile = async file => {
  const xml = fs.readFileSync(file, 'utf8');
  const data = await parseStringPromise(xml);
  const items = data.compendium.item;

  for (const it of items) {
    const name = it.name?.[0] || 'Unknown';
    let price = toCopper(it.value?.[0]);
    const priceRaw = it.value?.[0] || null;

    const rarity = deriveRarity(it);
    const type = (it.type?.[0] || 'item').toUpperCase();
    const tags = deriveTags(it);
    const soldBy = deriveSoldBy(it);
    const folder = deriveFolder(type);

    // fallback if no price
    if (price == null) {
      price = rarityPrice(rarity, name, type);
    }

    const description = (it.text || [])
      .map(t => t.trim())
      .filter(Boolean)
      .join('\n\n');

    const frontmatter = [
      '---',
      `name: ${name}`,
      `price: ${price !== null ? price : 'null'}`,
      priceRaw ? `priceRaw: "${priceRaw}"` : `priceRaw: "estimated"`,
      `type: ${type}`,
      `rarity: ${rarity.toLowerCase()}`,
      `tags: [${tags.join(', ')}]`,
      soldBy ? `soldBy:\n${soldBy.map(s => `  - ${s}`).join('\n')}` : '',
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const content = `${frontmatter}\n\n${description}`;

    const outDir = path.join(OUTPUT_DIR, folder);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, name + '.md');
    fs.writeFileSync(outPath, content, 'utf8');
  }
};

const main = async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const file of INPUT_FILES) {
    await processFile(file);
  }
  console.log('Markdown notes generated in', OUTPUT_DIR);
};

main().catch(err => console.error(err));
