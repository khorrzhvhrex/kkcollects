#!/usr/bin/env node

/**
 * KKM local Pokémon TCG data builder.
 *
 * Input:
 *   A local checkout of tcgdex/cards-database (passed with --source)
 *
 * Output:
 *   data/sets-index.js
 *   data/sets/<set-id>.js
 *   data/pokedex.js
 *   data/source-info.json
 *
 * The deployed tracker does not contact TCGdex, PokéAPI, or another service.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outputData = path.join(root, "data");
const outputSets = path.join(outputData, "sets");

function parseArgs(argv) {
  const result = {
    source: "",
    includePocket: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--source") {
      result.source = argv[++i] || "";
    } else if (arg === "--include-pocket") {
      result.includePocket = true;
    }
  }

  if (!result.source) {
    throw new Error(
      "Missing --source path to a local tcgdex/cards-database checkout."
    );
  }

  return result;
}

function walk(dir) {
  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else {
      results.push(full);
    }
  }

  return results;
}

function findBalanced(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === openChar) depth += 1;

    if (char === closeChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  throw new Error(
    `Could not find balanced ${openChar}${closeChar} block.`
  );
}

function extractObjectLiteral(source, typeName) {
  const patterns = [
    new RegExp(`const\\s+\\w+\\s*:\\s*${typeName}\\s*=\\s*\\{`),
    new RegExp(`const\\s+\\w+\\s*=\\s*\\{`)
  ];

  let match = null;

  for (const pattern of patterns) {
    match = pattern.exec(source);
    if (match) break;
  }

  if (!match) {
    throw new Error(`Could not locate ${typeName} object.`);
  }

  const start = source.indexOf("{", match.index);

  return findBalanced(source, start, "{", "}");
}

function evaluateLiteral(literal, context = {}) {
  return vm.runInNewContext(
    `(${literal})`,
    {
      ...context,
      console: { log() {}, warn() {}, error() {} }
    },
    {
      timeout: 1000
    }
  );
}

function readTsObject(file, typeName, context = {}) {
  const source = fs.readFileSync(file, "utf8");
  const literal = extractObjectLiteral(source, typeName);

  return evaluateLiteral(literal, context);
}

function englishText(value) {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    return value.en ||
      value["en-us"] ||
      Object.values(value).find(item => typeof item === "string") ||
      "";
  }

  return "";
}

function releaseDate(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value.en || Object.values(value)[0] || "";
  }
  return "";
}

function safeFileId(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe local set id: ${value}`);
  }

  return value;
}

function prettyToken(token) {
  return String(token || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function treatmentForDetailedVariant(variant) {
  if (variant.foil === "cosmos") return "Cosmos Holo";

  if (variant.type === "normal") return "Standard";
  if (variant.type === "holo") return "Holo";
  if (variant.type === "reverse") return "Reverse Holo";

  return "Other";
}

function printingLabel(printing) {
  const parts = [];

  if (printing.foil && printing.foil !== "cosmos") {
    parts.push(prettyToken(printing.foil));
  }

  if (printing.subtype) {
    parts.push(prettyToken(printing.subtype));
  }

  for (const stamp of printing.stamps || []) {
    if (stamp === "1st-edition") continue;
    parts.push(prettyToken(stamp));
  }

  if (printing.sourceType === "metal") {
    parts.push("Metal Card");
  }

  if (printing.sourceType === "lenticular") {
    parts.push("Lenticular");
  }

  return parts.length
    ? parts.join(" · ")
    : "Base printing";
}

function normalizeDetailedPrintings(variants) {
  return variants.map((variant, index) => {
    const stamps = Array.isArray(variant.stamp)
      ? [...variant.stamp]
      : [];

    const printing = {
      key: `d${index}`,
      treatment: treatmentForDetailedVariant(variant),
      size: variant.size === "jumbo"
        ? "Oversized"
        : "Standard",
      edition: stamps.includes("1st-edition")
        ? "1st Edition"
        : "Unlimited",
      sourceType: variant.type || "",
      foil: variant.foil || "",
      subtype: variant.subtype || "",
      stamps,
      languages: Array.isArray(variant.languages)
        ? [...variant.languages]
        : [],
      tcgplayerId:
        variant.thirdParty?.tcgplayer ??
        null
    };

    printing.label = printingLabel(printing);

    return printing;
  });
}

function normalizeLegacyPrintings(variants) {
  const printings = [];
  let index = 0;

  const add = (treatment, size = "Standard", extra = {}) => {
    const printing = {
      key: `l${index++}`,
      treatment,
      size,
      edition: "Unlimited",
      sourceType: "",
      foil: "",
      subtype: "",
      stamps: [],
      languages: [],
      tcgplayerId: null,
      ...extra
    };

    printing.label = printingLabel(printing);
    printings.push(printing);
  };

  if (variants?.normal) add("Standard");
  if (variants?.holo) add("Holo");
  if (variants?.reverse) add("Reverse Holo");

  if (variants?.jumbo) {
    const baseTreatments = printings.length
      ? [...new Set(printings.map(item => item.treatment))]
      : ["Standard"];

    for (const treatment of baseTreatments) {
      add(treatment, "Oversized");
    }
  }

  if (variants?.preRelease) {
    add(
      variants?.holo ? "Holo" : "Standard",
      "Standard",
      { stamps: ["pre-release"], label: "Pre Release" }
    );
  }

  if (variants?.wPromo) {
    add(
      variants?.holo ? "Holo" : "Standard",
      "Standard",
      { stamps: ["w-promo"], label: "W Promo" }
    );
  }

  // The old boolean form does not identify which treatment carries 1st Edition.
  // Retain the possibility without pretending we know the exact combination.
  if (variants?.firstEdition) {
    const firstEditionBases = printings.length
      ? printings.filter(item => item.size === "Standard")
      : [{
          treatment: "Standard",
          size: "Standard"
        }];

    for (const base of firstEditionBases) {
      add(
        base.treatment,
        base.size,
        {
          edition: "1st Edition",
          stamps: ["1st-edition"],
          label: "1st Edition"
        }
      );
    }
  }

  return printings;
}

function defaultTreatment(card, printings, officialCount, localId) {
  const explicit = [
    "Holo",
    "Reverse Holo",
    "Cosmos Holo",
    "Standard"
  ].find(value =>
    printings.some(printing => printing.treatment === value)
  );

  if (explicit && printings.length === 1) {
    return explicit;
  }

  const rarity = String(card.rarity || "").toLowerCase();
  const suffix = String(card.suffix || "");

  if (
    ["ex", "EX", "GX", "V"].includes(suffix) ||
    rarity.includes("holo") ||
    rarity.includes("double rare") ||
    rarity.includes("ultra rare") ||
    rarity.includes("hyper rare") ||
    rarity.includes("secret rare") ||
    rarity.includes("special illustration rare") ||
    rarity.includes("radiant rare") ||
    rarity.includes("amazing rare") ||
    rarity.includes("shiny")
  ) {
    return "Holo";
  }

  const numerator = Number(
    String(localId).replace(/^0+/, "")
  );

  if (
    Number.isFinite(numerator) &&
    Number.isFinite(Number(officialCount)) &&
    numerator > Number(officialCount)
  ) {
    return "Holo";
  }

  if (printings.some(printing => printing.treatment === "Standard")) {
    return "Standard";
  }

  return printings[0]?.treatment || "Standard";
}

function normalizeCard(card, setId, localId, officialCount) {
  let printings = [];
  let printingPrecision = "inferred";

  if (Array.isArray(card.variants)) {
    printings = normalizeDetailedPrintings(card.variants);
    printingPrecision = "detailed";
  } else if (card.variants && typeof card.variants === "object") {
    printings = normalizeLegacyPrintings(card.variants);
    printingPrecision = "legacy";
  }

  const result = {
    id: `${setId}-${localId}`,
    localId: String(localId),
    name: englishText(card.name),
    category: card.category || "",
    rarity: card.rarity || "",
    dex: Array.isArray(card.dexId)
      ? [...card.dexId]
      : [],
    suffix: card.suffix || "",
    printingPrecision,
    hasFirstEdition: printings.some(
      printing => printing.edition === "1st Edition"
    ),
    defaultTreatment: "",
    printings
  };

  result.defaultTreatment = defaultTreatment(
    card,
    printings,
    officialCount,
    localId
  );

  return result;
}

function parsePokedex(sourceRoot) {
  const file = path.join(
    sourceRoot,
    "scripts",
    "utils-data",
    "pokedex.ts"
  );

  if (!fs.existsSync(file)) {
    return {};
  }

  const text = fs.readFileSync(file, "utf8");
  const mapping = {};

  const regex = /\[\s*(\d+)\s*,\s*['"`]([^'"`]+)['"`]\s*\]/g;

  for (const match of text.matchAll(regex)) {
    const dex = String(Number(match[1])).padStart(3, "0");
    const name = match[2]
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.'’]/g, "")
      .replace(/[:\s]+/g, "-")
      .replace(/-+/g, "-");

    mapping[name] = dex;
  }

  return mapping;
}

function writeJs(file, prefix, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  fs.writeFileSync(
    file,
    `${prefix}${JSON.stringify(payload)};\n`,
    "utf8"
  );
}

function main() {
  const args = parseArgs(process.argv);
  const sourceRoot = path.resolve(args.source);
  const dataRoot = path.join(sourceRoot, "data");

  if (!fs.existsSync(dataRoot)) {
    throw new Error(
      `TCGdex data directory not found: ${dataRoot}`
    );
  }

  fs.mkdirSync(outputSets, { recursive: true });

  const setFiles = walk(dataRoot)
    .filter(file => file.endsWith(".ts"));

  // A set file sits directly above its same-named card directory:
  // data/Base/Team Rocket.ts -> data/Base/Team Rocket/
  const actualSetFiles = setFiles.filter(file => {
    const cardDir = file.slice(0, -3);
    return fs.existsSync(cardDir) &&
      fs.statSync(cardDir).isDirectory();
  });

  const index = [];
  const writtenSetIds = new Set();
  let totalCards = 0;
  let detailedCards = 0;
  let legacyCards = 0;
  let inferredCards = 0;
  let failedCards = 0;

  for (const setFile of actualSetFiles) {
    let set;

    try {
      set = readTsObject(
        setFile,
        "Set",
        {
          serie: {},
          Series: {}
        }
      );
    } catch (error) {
      console.warn(
        `Skipping set file ${setFile}: ${error.message}`
      );
      continue;
    }

    const setId = safeFileId(
      String(set.id || "")
    );

    const name = englishText(set.name);

    if (
      !args.includePocket &&
      (
        set.serie?.id === "tcgp" ||
        /TCG Pocket/i.test(name) ||
        /Pokémon TCG Pocket/i.test(setFile)
      )
    ) {
      continue;
    }

    const cardDir = setFile.slice(0, -3);

    const officialCount =
      Number(set.cardCount?.official ?? 0);

    const cards = [];

    for (const cardFile of walk(cardDir).filter(file => file.endsWith(".ts"))) {
      const localId = path.basename(
        cardFile,
        ".ts"
      );

      try {
        const card = readTsObject(
          cardFile,
          "Card",
          {
            Set: {},
            set: {},
            serie: {}
          }
        );

        const normalized = normalizeCard(
          card,
          setId,
          localId,
          officialCount
        );

        cards.push(normalized);

        if (normalized.printingPrecision === "detailed") detailedCards += 1;
        else if (normalized.printingPrecision === "legacy") legacyCards += 1;
        else inferredCards += 1;

      } catch (error) {
        failedCards += 1;

        console.warn(
          `Card parse failed ${cardFile}: ${error.message}`
        );
      }
    }

    cards.sort((a, b) =>
      a.localId.localeCompare(
        b.localId,
        undefined,
        { numeric: true }
      )
    );

    totalCards += cards.length;

    const totalCount = Math.max(
      cards.length,
      officialCount
    );

    const localSet = {
      id: setId,
      name,
      releaseDate: releaseDate(set.releaseDate),
      officialCount,
      totalCount,
      cards
    };

    writeJs(
      path.join(outputSets, `${setId}.js`),
      `window.KKM_SET_DATA=window.KKM_SET_DATA||{};window.KKM_SET_DATA[${JSON.stringify(setId)}]=`,
      localSet
    );

    index.push({
      id: setId,
      name,
      releaseDate: localSet.releaseDate,
      officialCount,
      totalCount
    });

    writtenSetIds.add(`${setId}.js`);

    console.log(
      `${name} (${setId}): ${cards.length} cards`
    );
  }

  for (const file of fs.readdirSync(outputSets)) {
    if (
      file.endsWith(".js") &&
      !writtenSetIds.has(file)
    ) {
      fs.unlinkSync(
        path.join(outputSets, file)
      );
    }
  }

  index.sort((a, b) => {
    if (a.releaseDate !== b.releaseDate) {
      return String(b.releaseDate || "")
        .localeCompare(String(a.releaseDate || ""));
    }

    return a.name.localeCompare(b.name);
  });

  writeJs(
    path.join(outputData, "sets-index.js"),
    "window.KKM_SET_INDEX=",
    index
  );

  writeJs(
    path.join(outputData, "pokedex.js"),
    "window.KKM_POKEDEX=",
    parsePokedex(sourceRoot)
  );

  const sourceInfo = {
    generatedAt: new Date().toISOString(),
    source: "TCGdex cards-database GitHub repository",
    runtimeExternalDependencies: [],
    setCount: index.length,
    cardCount: totalCards,
    printingData: {
      detailedCards,
      legacyCards,
      inferredCards,
      failedCards
    },
    notes: [
      "The live tracker reads only committed repository files.",
      "officialCount is metadata and is never a card-number validity ceiling.",
      "Detailed physical printings preserve treatment, size, edition, foil, subtype, stamps, language restrictions, and TCGplayer variant ID when present.",
      "Card images and gameplay metadata are intentionally excluded."
    ]
  };

  fs.writeFileSync(
    path.join(outputData, "source-info.json"),
    `${JSON.stringify(sourceInfo, null, 2)}\n`,
    "utf8"
  );

  console.log();
  console.log(`Sets: ${index.length}`);
  console.log(`Cards: ${totalCards}`);
  console.log(`Detailed printing records: ${detailedCards}`);
  console.log(`Legacy printing records: ${legacyCards}`);
  console.log(`Inferred printing records: ${inferredCards}`);
  console.log(`Failed card parses: ${failedCards}`);

  if (failedCards > 0) {
    console.warn(
      "Some source files could not be parsed. Review the workflow log before accepting the update."
    );
  }
}

main();
