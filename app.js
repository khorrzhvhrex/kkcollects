const STORAGE_KEY = "kkmCardTracker_v3";
const PREVIOUS_STORAGE_KEYS = ["kkmCardTracker_v2", "kkmLegacyTracker_v1"];

const $ = id => document.getElementById(id);

const LAST_SET_KEY = "kkmLastSelectedSet_v1";
const LAST_ENTRY_DEFAULTS_KEY = "kkmLastEntryDefaults_v1";
const TABLE_STATE_KEY = "kkmInventoryTableState_v1";
const STATUS_OPTIONS_KEY = "kkmStatusOptions_v1";
const ALL_TREATMENTS = ["Standard", "Holo", "Reverse Holo", "Cosmos Holo", "Other"];
const ALL_SIZES = ["Standard", "Oversized"];

const LANGUAGE_CODES = {
  English: "en",
  French: "fr",
  Japanese: "ja",
  Spanish: "es",
  German: "de",
  Italian: "it",
  Portuguese: "pt",
  Korean: "ko",
  Chinese: "zh-cn",
  Other: null
};

let cards = loadCards();
let loadedSetId = null;
let loadedSetData = null;
let resolvedSourceCard = null;
let tableState = loadTableState();
let activeFilterColumn = null;

function formatDexNumber(number) {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(3, "0") : "";
}

const pokemonNameAliases = {
  "nidoran f": "nidoran-f",
  "nidoran female": "nidoran-f",
  "nidoran ♀": "nidoran-f",
  "nidoran♀": "nidoran-f",

  "nidoran m": "nidoran-m",
  "nidoran male": "nidoran-m",
  "nidoran ♂": "nidoran-m",
  "nidoran♂": "nidoran-m",

  "farfetch'd": "farfetchd",
  "mr. mime": "mr-mime",
  "mime jr.": "mime-jr",
  "mr. rime": "mr-rime",
  "type: null": "type-null",
  "sirfetch'd": "sirfetchd",
  "flabébé": "flabebe"
};

const regionalPrefixes = [
  "alolan ",
  "galarian ",
  "hisuian ",
  "paldean "
];

function normalizePokemonName(name) {
  let normalized = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");

  for (const prefix of regionalPrefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  normalized = normalized
    .replace(/\s+(ex|gx|v|vmax|vstar|break)$/i, "")
    .trim();

  if (pokemonNameAliases[normalized]) {
    return pokemonNameAliases[normalized];
  }

  return normalized
    .replace(/[.'’]/g, "")
    .replace(/[:\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeLegacyVariant(value) {
  if (ALL_TREATMENTS.includes(value)) return value;

  if (!value || ["Promo", "Stamped", "Full Art", "ex / EX / GX / V"].includes(value)) {
    return "Standard";
  }

  return "Other";
}

function migrateCard(card) {
  const quantity = Number(card.quantity ?? 0);

  return {
    ...card,
    setId: card.setId || "",
    size: card.size || "Standard",
    variant: normalizeLegacyVariant(card.variant),
    edition: card.edition || "Unlimited",
    specialPrintingKey: card.specialPrintingKey || "",
    specialPrintingLabel: card.specialPrintingLabel || "",
    sourceCardId: card.sourceCardId || "",
    sourceRarity: card.sourceRarity || "",
    sourceCategory: card.sourceCategory || "",
    sourceSuffix: card.sourceSuffix || "",
    sourcePrinting: card.sourcePrinting || null,
    purchasedFrom: card.purchasedFrom || "",
    purchasedOn: card.purchasedOn || "",
    inactiveAt: quantity === 0
      ? (card.inactiveAt || card.updatedAt || new Date().toISOString())
      : null
  };
}

function loadCards() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return JSON.parse(current).map(migrateCard);

    for (const oldKey of PREVIOUS_STORAGE_KEYS) {
      const old = localStorage.getItem(oldKey);
      if (!old) continue;

      const migrated = JSON.parse(old).map(migrateCard);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    return [];
  } catch (error) {
    console.warn("Could not load local inventory:", error);
    return [];
  }
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadStatusOptions() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STATUS_OPTIONS_KEY)
    );

    if (
      Array.isArray(saved) &&
      saved.length
    ) {
      return saved;
    }
  } catch {
    // Fall through to one-time migration.
  }

  // One-time seed from the statuses already used by this tracker.
  const initial = [
    "Legacy Inventory",
    "PC",
    "Magnet Candidate",
    "Toploader Binder",
    "Sleeved Bulk",
    "General Bulk",
    "TCGPlayer Candidate",
    ...cards.map(card => card.status)
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean);

  const uniqueStatuses =
    [...new Set(initial)];

  localStorage.setItem(
    STATUS_OPTIONS_KEY,
    JSON.stringify(uniqueStatuses)
  );

  return uniqueStatuses;
}

function saveStatusOptions(statuses) {
  const cleaned = [
    ...new Set(
      statuses
        .map(value =>
          String(value || "").trim()
        )
        .filter(Boolean)
    )
  ];

  cleaned.sort((a, b) =>
    a.localeCompare(
      b,
      undefined,
      {
        sensitivity: "base"
      }
    )
  );

  localStorage.setItem(
    STATUS_OPTIONS_KEY,
    JSON.stringify(cleaned)
  );

  populateStatusOptions();

  return cleaned;
}

function populateStatusOptions() {
  const datalist =
    $("statusOptions");

  if (!datalist) return;

  const statuses =
    loadStatusOptions();

  datalist.innerHTML = "";

  for (const status of statuses) {
    const option =
      document.createElement("option");

    option.value = status;

    datalist.appendChild(option);
  }
}

function ensureStatusOption(value) {
  const status =
    String(value || "").trim();

  if (!status) return;

  const statuses =
    loadStatusOptions();

  if (!statuses.includes(status)) {
    saveStatusOptions([
      ...statuses,
      status
    ]);
  }
}

function openStatusManager() {
  const popover =
    $("statusManagerPopover");

  const button =
    $("manageStatusesBtn");

  if (!popover || !button) return;

  const statuses =
    loadStatusOptions();

  popover.innerHTML = `
    <div class="column-filter-title">
      Manage Statuses
    </div>

    <div class="status-manager-list">
      ${statuses.map(status => `
        <div class="status-manager-row">
          <span>${esc(status)}</span>

          <button
            type="button"
            class="status-remove-button"
            data-status="${esc(status)}"
          >
            Remove
          </button>
        </div>
      `).join("")}
    </div>

    <div class="status-manager-add">
      <input
        id="newStatusInput"
        type="text"
        autocomplete="off"
        placeholder="New status..."
      />

      <button
        id="addStatusBtn"
        type="button"
      >
        Add
      </button>
    </div>
  `;

  popover.hidden = false;

  const rect =
    button.getBoundingClientRect();

  const popoverWidth = 300;
  const pagePadding = 12;

  const pageLeft =
    rect.left + window.scrollX;

  const pageTop =
    rect.bottom + window.scrollY + 6;

  const maxLeft =
    document.documentElement.scrollWidth -
    popoverWidth -
    pagePadding;

  popover.style.left =
    `${Math.max(
      pagePadding,
      Math.min(pageLeft, maxLeft)
    )}px`;

  popover.style.top =
    `${pageTop}px`;

  $("addStatusBtn").addEventListener(
    "click",
    addStatusFromManager
  );

  $("newStatusInput").addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addStatusFromManager();
      }
    }
  );

  popover
    .querySelectorAll(
      ".status-remove-button"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          removeManagedStatus(
            button.dataset.status
          );
        }
      );
    });
}

function addStatusFromManager() {
  const input =
    $("newStatusInput");

  const value =
    input.value.trim();

  if (!value) return;

  ensureStatusOption(value);

  closeStatusManager();
  openStatusManager();
}

function removeManagedStatus(status) {
  const statuses =
    loadStatusOptions()
      .filter(value =>
        value !== status
      );

  saveStatusOptions(statuses);

  closeStatusManager();
  openStatusManager();
}

function closeStatusManager() {
  const popover =
    $("statusManagerPopover");

  if (!popover) return;

  popover.hidden = true;
  popover.innerHTML = "";
}

function populateSetDropdown() {
  const select = $("setId");
  const search = $("setSearch");
  const datalist = $("setOptions");

  const index = Array.isArray(window.KKM_SET_INDEX)
    ? window.KKM_SET_INDEX
    : [];

  select.innerHTML =
    `<option value="">Manual / Promo Entry</option>`;

  datalist.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "Manual / Promo Entry";
  datalist.appendChild(manualOption);

  const sets = [...index].sort((a, b) => {
    const aDate = a.releaseDate || "";
    const bDate = b.releaseDate || "";

    if (aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }

    return String(a.name || "")
      .localeCompare(String(b.name || ""));
  });

  for (const set of sets) {
    const date = set.releaseDate
      ? ` (${set.releaseDate})`
      : "";

    const displayLabel = `${set.name}${date}`;

    // Hidden ID select used internally by the app.
    const internalOption = document.createElement("option");

    internalOption.value = set.id;
    internalOption.dataset.name = set.name;
    internalOption.dataset.displayLabel = displayLabel;
    internalOption.textContent = displayLabel;

    select.appendChild(internalOption);

    // Visible searchable suggestion.
    const searchOption = document.createElement("option");

    searchOption.value = displayLabel;

    datalist.appendChild(searchOption);
  }

  const rememberedSet =
    localStorage.getItem(LAST_SET_KEY);

  if (
    rememberedSet &&
    [...select.options].some(
      option => option.value === rememberedSet
    )
  ) {
    select.value = rememberedSet;

    const selected =
      select.selectedOptions[0];

    search.value =
      selected?.dataset?.displayLabel ||
      selected?.dataset?.name ||
      "";
  } else {
    select.value = "";
    search.value = "Manual / Promo Entry";
  }
}

function findSetOptionFromSearch(value) {
  const normalized =
    String(value || "").trim().toLowerCase();

  if (
    !normalized ||
    normalized === "manual / promo entry"
  ) {
    return $("setId").options[0];
  }

  return [...$("setId").options].find(option => {
    if (!option.value) return false;

    const name =
      String(option.dataset.name || "")
        .toLowerCase();

    const label =
      String(option.dataset.displayLabel || "")
        .toLowerCase();

    return (
      normalized === name ||
      normalized === label
    );
  }) || null;
}

async function applySetSearchSelection() {
  const option =
    findSetOptionFromSearch(
      $("setSearch").value
    );

  if (!option) {
    return;
  }

  const selectedSetId = option.value;

  $("setId").value = selectedSetId;

  if (selectedSetId) {
    localStorage.setItem(
      LAST_SET_KEY,
      selectedSetId
    );

    $("setSearch").value =
      option.dataset.displayLabel ||
      option.dataset.name ||
      "";
  } else {
    localStorage.removeItem(LAST_SET_KEY);

    $("setSearch").value =
      "Manual / Promo Entry";
  }

  $("cardNumber").value = "";
  $("name").value = "";
  $("dex").value = "";

  await selectImportedSet(selectedSetId);

  $("cardNumber").focus();
}

function loadLocalSet(setId) {
  return new Promise((resolve, reject) => {
    if (!setId) {
      resolve(null);
      return;
    }

    if (window.KKM_SET_DATA?.[setId]) {
      resolve(window.KKM_SET_DATA[setId]);
      return;
    }

    const script = document.createElement("script");
    script.src = `data/sets/${encodeURIComponent(setId)}.js`;

    script.onload = () => {
      const data = window.KKM_SET_DATA?.[setId];

      if (data) resolve(data);
      else reject(new Error(`Set data missing after loading ${setId}.`));
    };

    script.onerror = () => {
      reject(new Error(`Could not load local set file ${setId}.`));
    };

    document.head.appendChild(script);
  });
}

async function selectImportedSet(setId) {
  loadedSetId = setId || null;
  loadedSetData = null;
  resolvedSourceCard = null;

  $("cardLookupStatus").textContent = "";
  resetPrintingControls();

  if (!setId) {
    $("manualSetLabel").classList.remove("muted-field");
    $("setName").readOnly = false;
    hideSourceMeta();
    return;
  }

  const selected = $("setId").selectedOptions[0];

  $("setName").value =
    selected?.dataset?.name ||
    selected?.textContent ||
    "";

  $("setName").readOnly = true;
  $("manualSetLabel").classList.add("muted-field");

  try {
    loadedSetData = await loadLocalSet(setId);

    $("cardLookupStatus").textContent =
      `${loadedSetData.cards.length} local records loaded`;
  } catch (error) {
    console.warn(error);
    $("cardLookupStatus").textContent = "Local set file unavailable";
  }
}

function normalizeLocalCardNumber(value) {
  return String(value ?? "")
    .trim()
    .split("/")[0]
    .trim()
    .toUpperCase()
    .replace(/^0+(?=\d)/, "");
}

async function resolveCardFromNumber() {
  const setId = $("setId").value;
  const entered = $("cardNumber").value.trim();

  if (!setId || !entered) {
    resolvedSourceCard = null;
    resetPrintingControls();
    hideSourceMeta();
    return;
  }

  if (loadedSetId !== setId || !loadedSetData) {
    await selectImportedSet(setId);
  }

  if (!loadedSetData) return;

  const target = normalizeLocalCardNumber(entered);

  const card = loadedSetData.cards.find(candidate =>
    normalizeLocalCardNumber(candidate.localId) === target
  );

  if (!card) {
    resolvedSourceCard = null;
    $("cardLookupStatus").textContent = "Card number not found in selected set";
    resetPrintingControls();
    hideSourceMeta();
    return;
  }

  resolvedSourceCard = card;

  $("name").value = card.name || "";

  if (!entered.includes("/") && loadedSetData.officialCount != null) {
    // officialCount is display metadata, not a validity ceiling.
    $("cardNumber").value = `${card.localId}/${loadedSetData.officialCount}`;
  }

  const sourceDex =
    Array.isArray(card.dex) && card.dex.length
      ? card.dex[0]
      : card.dex ?? null;
  
  if (sourceDex) {
    $("dex").value = formatDexNumber(sourceDex);
  } else {
    const lookupName = normalizePokemonName(card.name || "");
    const fallbackDex = window.KKM_POKEDEX?.[lookupName];
  
    $("dex").value = fallbackDex
      ? formatDexNumber(fallbackDex)
      : "";
  }

  $("cardLookupStatus").textContent = card.name || "Card loaded";

  applySourcePrintingControls();
  showSourceMeta();
}

function sourcePrintingsForCurrentLanguage() {
  if (!resolvedSourceCard) return [];

  const languageCode = LANGUAGE_CODES[$("language").value];
  const printings = Array.isArray(resolvedSourceCard.printings)
    ? resolvedSourceCard.printings
    : [];

  if (!languageCode) return printings;

  return printings.filter(printing =>
    !Array.isArray(printing.languages) ||
    printing.languages.length === 0 ||
    printing.languages.includes(languageCode)
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function setSelectOptions(select, values, preferredValue = null) {
  select.innerHTML = "";

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  if (
    preferredValue &&
    values.includes(preferredValue)
  ) {
    select.value = preferredValue;
  }
}

function applySourcePrintingControls(preferred = {}) {
  if (!resolvedSourceCard) {
    resetPrintingControls();
    return;
  }

  const printings = sourcePrintingsForCurrentLanguage();

  const treatments = unique(
    printings.map(printing => printing.treatment)
  );

  const fallbackTreatment =
    resolvedSourceCard.defaultTreatment ||
    inferTreatmentFromCard(resolvedSourceCard);

  const treatmentOptions = treatments.length
    ? [...treatments, "Other"].filter((value, index, array) => array.indexOf(value) === index)
    : unique([fallbackTreatment, ...ALL_TREATMENTS]);

  setSelectOptions(
    $("variant"),
    treatmentOptions,
    preferred.variant || fallbackTreatment
  );

  updateDependentPrintingControls(preferred);
}

function updateDependentPrintingControls(preferred = {}) {
  const treatment = $("variant").value;

  if (!resolvedSourceCard) {
    setSelectOptions($("size"), ALL_SIZES, preferred.size || "Standard");
    $("size").disabled = false;
    $("editionField").hidden = true;
    $("specialPrintingField").hidden = true;
    return;
  }

  let printings = sourcePrintingsForCurrentLanguage();

  const matchingTreatment = printings.filter(
    printing => printing.treatment === treatment
  );

  if (matchingTreatment.length) {
    printings = matchingTreatment;
  }

  const sizes = unique(printings.map(printing => printing.size || "Standard"));

  if (sizes.length) {
    setSelectOptions(
      $("size"),
      sizes,
      preferred.size || sizes[0]
    );
    $("size").disabled = sizes.length === 1;
  } else {
    setSelectOptions($("size"), ALL_SIZES, preferred.size || "Standard");
    $("size").disabled = false;
  }

  const selectedSize = $("size").value;

  let sizeMatched = printings.filter(
    printing => (printing.size || "Standard") === selectedSize
  );

  if (!sizeMatched.length) sizeMatched = printings;

  const hasFirstEdition =
    resolvedSourceCard.hasFirstEdition === true ||
    sizeMatched.some(printing => printing.edition === "1st Edition");

  $("editionField").hidden = !hasFirstEdition;

  if (hasFirstEdition) {
    const editions = unique(
      sizeMatched.map(printing => printing.edition || "Unlimited")
    );

    const editionOptions = editions.includes("1st Edition")
      ? unique(["Unlimited", "1st Edition", ...editions])
      : editions;

    setSelectOptions(
      $("edition"),
      editionOptions,
      preferred.edition || "Unlimited"
    );
  } else {
    setSelectOptions($("edition"), ["Unlimited"], "Unlimited");
  }

  updateSpecialPrintingOptions(preferred.specialPrintingKey);
}

function updateSpecialPrintingOptions(preferredKey = "") {
  if (!resolvedSourceCard) {
    $("specialPrintingField").hidden = true;
    $("specialPrinting").innerHTML = "";
    return;
  }

  const treatment = $("variant").value;
  const size = $("size").value;
  const edition = $("editionField").hidden
    ? "Unlimited"
    : $("edition").value;

  let printings = sourcePrintingsForCurrentLanguage().filter(printing =>
    printing.treatment === treatment &&
    (printing.size || "Standard") === size &&
    (printing.edition || "Unlimited") === edition
  );

  if (!printings.length) {
    $("specialPrintingField").hidden = true;
    $("specialPrinting").innerHTML = "";
    return;
  }

  const meaningful = printings.filter(printing =>
    printing.subtype ||
    printing.foil ||
    (Array.isArray(printing.stamps) && printing.stamps.length) ||
    printing.sourceType === "metal" ||
    printing.sourceType === "lenticular"
  );

  if (!meaningful.length && printings.length === 1) {
    $("specialPrintingField").hidden = true;
    $("specialPrinting").innerHTML = "";
    return;
  }

  $("specialPrintingField").hidden = false;

  const select = $("specialPrinting");
  select.innerHTML = "";

  for (const printing of printings) {
    const option = document.createElement("option");
    option.value = printing.key;
    option.textContent = printing.label || buildPrintingLabel(printing);
    select.appendChild(option);
  }

  if (
    preferredKey &&
    printings.some(printing => printing.key === preferredKey)
  ) {
    select.value = preferredKey;
  }

  const selected = currentSourcePrinting();
  $("specialPrintingStatus").textContent =
    selected?.sourceType === "metal" || selected?.sourceType === "lenticular"
      ? `Source type: ${selected.sourceType}`
      : "";
}

function currentSourcePrinting() {
  if (!resolvedSourceCard) return null;

  const key = $("specialPrinting").value;

  if (key) {
    const found = sourcePrintingsForCurrentLanguage().find(
      printing => printing.key === key
    );

    if (found) return found;
  }

  const treatment = $("variant").value;
  const size = $("size").value;
  const edition = $("editionField").hidden
    ? "Unlimited"
    : $("edition").value;

  return sourcePrintingsForCurrentLanguage().find(printing =>
    printing.treatment === treatment &&
    (printing.size || "Standard") === size &&
    (printing.edition || "Unlimited") === edition
  ) || null;
}

function buildPrintingLabel(printing) {
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

  if (printing.sourceType === "metal") parts.push("Metal card");
  if (printing.sourceType === "lenticular") parts.push("Lenticular");

  return parts.length ? parts.join(" · ") : "Base printing";
}

function prettyToken(token) {
  return String(token || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function inferTreatmentFromCard(card) {
  if (card.defaultTreatment) return card.defaultTreatment;

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

  if (resolvedSourceCard && loadedSetData) {
    const numerator = Number(normalizeLocalCardNumber(card.localId));
    const denominator = Number(loadedSetData.officialCount);

    if (
      Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      numerator > denominator
    ) {
      return "Holo";
    }
  }

  return "Standard";
}

function resetPrintingControls() {
  setSelectOptions($("variant"), ALL_TREATMENTS, "Standard");
  setSelectOptions($("size"), ALL_SIZES, "Standard");
  $("size").disabled = false;

  $("editionField").hidden = true;
  setSelectOptions($("edition"), ["Unlimited"], "Unlimited");

  $("specialPrintingField").hidden = true;
  $("specialPrinting").innerHTML = "";
  $("specialPrintingStatus").textContent = "";
}

function showSourceMeta() {
  if (!resolvedSourceCard) {
    hideSourceMeta();
    return;
  }

  const bits = [];

  if (resolvedSourceCard.rarity) {
    bits.push(`<strong>Rarity:</strong> ${esc(resolvedSourceCard.rarity)}`);
  }

  if (resolvedSourceCard.category) {
    bits.push(`<strong>Category:</strong> ${esc(resolvedSourceCard.category)}`);
  }

  if (resolvedSourceCard.suffix) {
    bits.push(`<strong>Type:</strong> ${esc(resolvedSourceCard.suffix)}`);
  }

  if (resolvedSourceCard.printingPrecision) {
    bits.push(`<strong>Printing data:</strong> ${esc(resolvedSourceCard.printingPrecision)}`);
  }

  if (!bits.length) {
    hideSourceMeta();
    return;
  }

  $("sourceCardMeta").innerHTML = bits.join(" &nbsp; · &nbsp; ");
  $("sourceCardMeta").hidden = false;
}

function hideSourceMeta() {
  $("sourceCardMeta").hidden = true;
  $("sourceCardMeta").innerHTML = "";
}

function validateForm() {
  if ($("variant").value === "Other" && !$("notes").value.trim()) {
    $("otherVariantWarning").hidden = false;
    $("notes").focus();
    return false;
  }

  $("otherVariantWarning").hidden = true;
  return true;
}

function formData() {
  const existing = cards.find(card => card.id === $("editId").value);
  const quantity = Number($("quantity").value || 0);
  const now = new Date().toISOString();
  const sourcePrinting = currentSourcePrinting();

  return {
    id: $("editId").value || newId(),
    name: $("name").value.trim(),
    dex: $("dex").value.trim() || null,

    setId: $("setId").value || "",
    setName: $("setName").value.trim(),
    cardNumber: $("cardNumber").value.trim(),

    language: $("language").value,
    size: $("size").value,
    variant: $("variant").value,
    edition: $("editionField").hidden ? "Unlimited" : $("edition").value,

    specialPrintingKey:
      $("specialPrintingField").hidden
        ? ""
        : $("specialPrinting").value,

    specialPrintingLabel:
      $("specialPrintingField").hidden
        ? ""
        : $("specialPrinting").selectedOptions[0]?.textContent || "",

    condition: $("condition").value,
    quantity,
    basis: Number($("basis").value || 0),
    purchasedFrom: $("purchasedFrom").value.trim(),
    purchasedOn: $("purchasedOn").value,
    status: $("status").value,
    storage: $("storage").value.trim(),
    notes: $("notes").value.trim(),

    sourceCardId: resolvedSourceCard?.id || existing?.sourceCardId || "",
    sourceRarity: resolvedSourceCard?.rarity || existing?.sourceRarity || "",
    sourceCategory: resolvedSourceCard?.category || existing?.sourceCategory || "",
    sourceSuffix: resolvedSourceCard?.suffix || existing?.sourceSuffix || "",
    sourcePrinting: sourcePrinting || existing?.sourcePrinting || null,

    createdAt: existing?.createdAt || now,
    updatedAt: now,

    inactiveAt: quantity === 0
      ? (existing?.inactiveAt || now)
      : null
  };
}

function saveEntryDefaults() {
  const defaults = {
    language: $("language").value,
    status: $("status").value,
    storage: $("storage").value,
    basis: $("basis").value,
    purchasedFrom: $("purchasedFrom").value,
    purchasedOn: $("purchasedOn").value
  };
    localStorage.setItem(
    LAST_ENTRY_DEFAULTS_KEY,
    JSON.stringify(defaults)
  );
}

function loadEntryDefaults() {
  try {
    return JSON.parse(
      localStorage.getItem(LAST_ENTRY_DEFAULTS_KEY)
    ) || {};
  } catch {
    return {};
  }
}

function clearForm() {
  const preservedSetId = $("setId").value;
  const preservedSetName = $("setName").value;
  const preservedLanguage = $("language").value;
  const preservedStatus = $("status").value;
  const preservedStorage = $("storage").value;
  const preservedBasis = $("basis").value;
  const preservedPurchasedFrom = $("purchasedFrom").value;
  const preservedPurchasedOn = $("purchasedOn").value;

  saveEntryDefaults();

  form.reset();

  $("editId").value = "";
  $("quantity").value = 1;
  $("condition").value = "NM";

  // Preserve working defaults between card entries.
  $("language").value = preservedLanguage || "English";
  $("status").value = preservedStatus || "Legacy Inventory";
  $("storage").value = preservedStorage || "";
  $("basis").value = preservedBasis || "0.00";
  $("purchasedFrom").value = preservedPurchasedFrom || "";
  $("purchasedOn").value = preservedPurchasedOn || "";

  // Preserve currently selected imported set.
  $("setId").value = preservedSetId || "";

  if (preservedSetId) {
    $("setName").value = preservedSetName;
    $("setName").readOnly = true;
    $("manualSetLabel").classList.add("muted-field");

    const selectedSetOption =
      $("setId").selectedOptions[0];
    
    $("setSearch").value =
      selectedSetOption?.dataset?.displayLabel ||
      selectedSetOption?.dataset?.name ||
      "";
  } else {
    $("setName").value = "";
    $("setName").readOnly = false;
    $("manualSetLabel").classList.remove("muted-field");
  
    $("setSearch").value = "Manual / Promo Entry";
  }

  $("cardLookupStatus").textContent = "";
  $("otherVariantWarning").hidden = true;

  resolvedSourceCard = null;

  resetPrintingControls();
  hideSourceMeta();

  form.querySelector('button[type="submit"]').textContent = "Add Card";
  $("cardNumber").focus();
}

const form = $("cardForm");
const body = $("inventoryBody");

form.addEventListener("submit", event => {
  event.preventDefault();

  if (!validateForm()) return;

  ensureStatusOption(
    $("status").value
  );
  
  const card = formData();
  const index = cards.findIndex(existing => existing.id === card.id);

  if (index >= 0) cards[index] = card;
  else cards.push(card);

  saveCards();
  render();
  clearForm();
});

$("clearBtn").addEventListener("click", clearForm);
$("search").addEventListener("input", render);
$("showInactive").addEventListener("change", render);
$("resetFiltersBtn").addEventListener(
  "click",
  resetInventoryFilters
);

$("columnsBtn").addEventListener(
  "click",
  event => {
    event.stopPropagation();

    closeColumnFilter();
    openColumnVisibility();
  }
);

$("variant").addEventListener("change", () => {
  $("otherVariantWarning").hidden = $("variant").value !== "Other";
  updateDependentPrintingControls();
});

$("size").addEventListener("change", () => {
  updateDependentPrintingControls({
    edition: $("edition").value
  });
});

$("edition").addEventListener("change", () => {
  updateSpecialPrintingOptions();
});

$("specialPrinting").addEventListener("change", () => {
  const selected = currentSourcePrinting();

  $("specialPrintingStatus").textContent =
    selected?.sourceType === "metal" || selected?.sourceType === "lenticular"
      ? `Source type: ${selected.sourceType}`
      : "";
});

$("status").addEventListener(
  "change",
  () => {
    ensureStatusOption(
      $("status").value
    );

    saveEntryDefaults();
  }
);

$("status").addEventListener(
  "blur",
  () => {
    ensureStatusOption(
      $("status").value
    );

    saveEntryDefaults();
  }
);
$("storage").addEventListener("change", saveEntryDefaults);
$("storage").addEventListener("blur", saveEntryDefaults);
$("purchasedFrom").addEventListener("change", saveEntryDefaults);
$("purchasedFrom").addEventListener("blur", saveEntryDefaults);
$("purchasedOn").addEventListener("change", saveEntryDefaults);

$("language").addEventListener("change", () => {
  saveEntryDefaults();

  if (resolvedSourceCard) {
    applySourcePrintingControls({
      variant: $("variant").value,
      size: $("size").value,
      edition: $("edition").value,
      specialPrintingKey: $("specialPrinting").value
    });
  }
});

$("dex").addEventListener("blur", () => {
  $("dex").value = formatDexNumber($("dex").value);
});

$("basis").addEventListener("focus", () => {
  if ($("basis").value === "0.00") {
    $("basis").value = "";
  }
});

$("basis").addEventListener("input", () => {
  const digits = $("basis").value.replace(/\D/g, "");

  if (!digits) {
    $("basis").value = "";
    return;
  }

  $("basis").value = (Number(digits) / 100).toFixed(2);
});

$("basis").addEventListener("blur", () => {
  if (!$("basis").value) {
    $("basis").value = "0.00";
  }

  saveEntryDefaults();
});

$("setSearch").addEventListener("focus", () => {
  $("setSearch").value = "";
});

$("setSearch").addEventListener(
  "change",
  applySetSearchSelection
);

$("setSearch").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySetSearchSelection();
    }
  }
);

$("cardNumber").addEventListener("blur", () => {
  resolveCardFromNumber();
});

$("cardNumber").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    resolveCardFromNumber();
  }
});

async function editCard(id) {
  const card = cards.find(candidate => candidate.id === id);
  if (!card) return;

  $("editId").value = card.id;

  $("setId").value = card.setId || "";
  await selectImportedSet(card.setId || "");

  $("setName").value = card.setName || "";
  $("cardNumber").value = card.cardNumber || "";
  $("name").value = card.name || "";
  $("dex").value = card.dex ?? "";

  $("language").value = card.language || "English";

  if (card.setId && card.cardNumber) {
    await resolveCardFromNumber();
  }

  $("variant").value = normalizeLegacyVariant(card.variant);
  $("size").value = card.size || "Standard";

  if (!$("editionField").hidden) {
    $("edition").value = card.edition || "Unlimited";
  }

  updateDependentPrintingControls({
    variant: normalizeLegacyVariant(card.variant),
    size: card.size || "Standard",
    edition: card.edition || "Unlimited",
    specialPrintingKey: card.specialPrintingKey || ""
  });

  $("condition").value = card.condition || "NM";
  $("quantity").value = Number(card.quantity || 0);
  $("basis").value = Number(card.basis || 0).toFixed(2);
  $("purchasedFrom").value = card.purchasedFrom || "";
  $("purchasedOn").value = card.purchasedOn || "";
  $("status").value = card.status || "Legacy Inventory";
  $("storage").value = card.storage || "";
  $("notes").value = card.notes || "";

  $("otherVariantWarning").hidden = $("variant").value !== "Other";

  form.querySelector('button[type="submit"]').textContent = "Save Changes";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function zeroOutCard(id) {
  const card = cards.find(candidate => candidate.id === id);

  if (!card || Number(card.quantity || 0) === 0) return;

  if (
    !confirm(
      `Set "${card.name}" to quantity 0? The record will remain in history.`
    )
  ) {
    return;
  }

  card.quantity = 0;
  card.inactiveAt = new Date().toISOString();
  card.updatedAt = card.inactiveAt;

  saveCards();
  render();
}

function restoreCard(id) {
  const card = cards.find(candidate => candidate.id === id);

  if (!card || Number(card.quantity || 0) > 0) return;

  const quantity = prompt("Restore quantity:", "1");

  if (quantity === null) return;

  const number = Number(quantity);

  if (!Number.isInteger(number) || number < 1) {
    alert("Enter a whole number greater than 0.");
    return;
  }

  card.quantity = number;
  card.inactiveAt = null;
  card.updatedAt = new Date().toISOString();

  saveCards();
  render();
}

window.editCard = editCard;
window.zeroOutCard = zeroOutCard;
window.restoreCard = restoreCard;

function loadTableState() {
  const fallback = {
    sortKey: "dex",
    sortDir: "asc",
    filters: {},
    hiddenColumns: []
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem(TABLE_STATE_KEY)
    );

    return {
      sortKey: saved?.sortKey || fallback.sortKey,
      sortDir:
        saved?.sortDir === "desc"
          ? "desc"
          : "asc",
      filters:
        saved?.filters &&
        typeof saved.filters === "object"
          ? saved.filters
          : {},
      hiddenColumns:
        Array.isArray(saved?.hiddenColumns)
          ? saved.hiddenColumns
          : []
    };
  } catch {
    return fallback;
  }
}

function saveTableState() {
  localStorage.setItem(
    TABLE_STATE_KEY,
    JSON.stringify(tableState)
  );
}

const TABLE_COLUMNS = {
  dex: {
    get: card => card.dex ?? "",
    filterType: "text"
  },

  name: {
    get: card => card.name ?? "",
    filterType: "text"
  },

  setName: {
    get: card => card.setName ?? "",
    filterType: "select"
  },

  cardNumber: {
    get: card => card.cardNumber ?? "",
    filterType: "text"
  },

  language: {
    get: card => card.language ?? "",
    filterType: "select"
  },

  size: {
    get: card => card.size || "Standard",
    filterType: "select"
  },

  variant: {
    get: card =>
      normalizeLegacyVariant(card.variant),
    filterType: "select"
  },

  edition: {
    get: card =>
      card.edition || "Unlimited",
    filterType: "select"
  },

  specialPrintingLabel: {
    get: card =>
      card.specialPrintingLabel ?? "",
    filterType: "text"
  },

  condition: {
    get: card => card.condition ?? "",
    filterType: "select"
  },

  quantity: {
    get: card =>
      Number(card.quantity || 0),
    filterType: "text"
  },

  basis: {
    get: card =>
      Number(card.basis || 0).toFixed(2),
    filterType: "text"
  },
  
  purchasedFrom: {
    get: card => card.purchasedFrom || "",
    filterType: "select"
  },
  
  purchasedOn: {
    get: card => card.purchasedOn || "",
    filterType: "select"
  },
  
  status: {
    get: card => card.status ?? "",
    filterType: "select"
  },

  storage: {
    get: card => card.storage ?? "",
    filterType: "select"
  }
};

const INVENTORY_COLUMN_ORDER = [
  "dex",
  "name",
  "setName",
  "cardNumber",
  "language",
  "size",
  "variant",
  "edition",
  "specialPrintingLabel",
  "condition",
  "quantity",
  "basis",
  "purchasedFrom",
  "purchasedOn",
  "status",
  "storage",
  "actions"
];

const INVENTORY_COLUMN_LABELS = {
  dex: "Dex",
  name: "Name",
  setName: "Set / Promo",
  cardNumber: "Card #",
  language: "Language",
  size: "Size",
  variant: "Treatment",
  edition: "Edition",
  specialPrintingLabel: "Special",
  condition: "Condition",
  quantity: "Quantity",
  basis: "Basis",
  purchasedFrom: "Purchased From",
  purchasedOn: "Purchased On",
  status: "Status",
  storage: "Storage"
};

function applyColumnVisibility() {
  const hidden = new Set(
    tableState.hiddenColumns || []
  );

  const table = document.querySelector(
    ".table-wrap table"
  );

  if (!table) return;

  const headerCells =
    table.querySelectorAll("thead th");

  headerCells.forEach((cell, index) => {
    const key =
      INVENTORY_COLUMN_ORDER[index];

    if (!key || key === "actions") {
      cell.hidden = false;
      return;
    }

    cell.hidden = hidden.has(key);
  });

  table
    .querySelectorAll("tbody tr")
    .forEach(row => {
      if (
        row.children.length !==
        INVENTORY_COLUMN_ORDER.length
      ) {
        return;
      }

      [...row.children].forEach(
        (cell, index) => {
          const key =
            INVENTORY_COLUMN_ORDER[index];

          if (!key || key === "actions") {
            cell.hidden = false;
            return;
          }

          cell.hidden = hidden.has(key);
        }
      );
    });
}

function openColumnVisibility() {
  const popover =
    $("columnVisibilityPopover");

  const button =
    $("columnsBtn");

  if (!popover || !button) return;

  const hidden = new Set(
    tableState.hiddenColumns || []
  );

  popover.innerHTML = `
    <div class="column-filter-title">
      Columns
    </div>

    <div class="column-visibility-list">
      ${Object.entries(
        INVENTORY_COLUMN_LABELS
      ).map(([key, label]) => `
        <label class="column-visibility-option">
          <input
            type="checkbox"
            value="${key}"
            ${hidden.has(key) ? "" : "checked"}
          />
          ${label}
        </label>
      `).join("")}
    </div>

    <div class="column-filter-actions">
      <button
        type="button"
        id="applyColumnsBtn"
      >
        Apply
      </button>

      <button
        type="button"
        id="showAllColumnsBtn"
      >
        Show All
      </button>
    </div>
  `;

  popover.hidden = false;

  const rect =
    button.getBoundingClientRect();
  
  const popoverWidth = 280;
  const pagePadding = 12;
  
  const pageLeft =
    rect.left + window.scrollX;
  
  const pageTop =
    rect.bottom + window.scrollY + 6;
  
  const maxLeft =
    document.documentElement.scrollWidth -
    popoverWidth -
    pagePadding;
  
  popover.style.left =
    `${Math.max(
      pagePadding,
      Math.min(pageLeft, maxLeft)
    )}px`;
  
  popover.style.top =
    `${pageTop}px`;
  
  popover.style.bottom = "auto";

  $("applyColumnsBtn")
    .addEventListener(
      "click",
      applyColumnSelection
    );

  $("showAllColumnsBtn")
    .addEventListener(
      "click",
      showAllColumns
    );
}

function applyColumnSelection() {
  const checked = new Set(
    [...document.querySelectorAll(
      "#columnVisibilityPopover input[type='checkbox']:checked"
    )].map(input => input.value)
  );

  tableState.hiddenColumns =
    Object.keys(
      INVENTORY_COLUMN_LABELS
    ).filter(
      key => !checked.has(key)
    );

  saveTableState();

  closeColumnVisibility();
  applyColumnVisibility();
}

function showAllColumns() {
  tableState.hiddenColumns = [];

  saveTableState();

  closeColumnVisibility();
  applyColumnVisibility();
}

function closeColumnVisibility() {
  const popover =
    $("columnVisibilityPopover");

  if (!popover) return;

  popover.hidden = true;
  popover.innerHTML = "";
}

function sortInventoryBy(columnKey) {
  if (!TABLE_COLUMNS[columnKey]) return;

  if (tableState.sortKey === columnKey) {
    tableState.sortDir =
      tableState.sortDir === "asc"
        ? "desc"
        : "asc";
  } else {
    tableState.sortKey = columnKey;
    tableState.sortDir = "asc";
  }

  saveTableState();
  render();
}

function compareInventoryValues(
  a,
  b,
  columnKey
) {
  if (columnKey === "dex") {
    const first =
      a.dex ? Number(a.dex) : 99999;

    const second =
      b.dex ? Number(b.dex) : 99999;

    return (
      first - second ||
      (a.name || "").localeCompare(
        b.name || ""
      )
    );
  }

  if (columnKey === "cardNumber") {
    return compareCardNumbers(
      a.cardNumber,
      b.cardNumber
    );
  }

  if (
    columnKey === "quantity" ||
    columnKey === "basis"
  ) {
    return (
      Number(TABLE_COLUMNS[columnKey].get(a)) -
      Number(TABLE_COLUMNS[columnKey].get(b))
    );
  }

  if (columnKey === "condition") {
    const order = [
      "NM",
      "LP",
      "MP",
      "HP",
      "Damaged",
      "Unknown"
    ];

    const first =
      order.indexOf(a.condition);

    const second =
      order.indexOf(b.condition);

    return (
      (first < 0 ? 999 : first) -
      (second < 0 ? 999 : second)
    );
  }

  return String(
    TABLE_COLUMNS[columnKey].get(a)
  ).localeCompare(
    String(TABLE_COLUMNS[columnKey].get(b)),
    undefined,
    {
      numeric: true,
      sensitivity: "base"
    }
  );
}

function cardMatchesColumnFilter(
  card,
  columnKey,
  filterValue
) {
  if (!filterValue) return true;

  const column =
    TABLE_COLUMNS[columnKey];

  if (!column) return true;

  const value = String(
    column.get(card) ?? ""
  );

  if (column.filterType === "select") {
    return value === filterValue;
  }

  return value
    .toLowerCase()
    .includes(
      String(filterValue).toLowerCase()
    );
}

function getColumnFilterOptions(columnKey) {
  const column =
    TABLE_COLUMNS[columnKey];

  if (!column) return [];

  return [...new Set(
    cards
      .map(card =>
        String(
          column.get(card) ?? ""
        ).trim()
      )
      .filter(Boolean)
  )].sort((a, b) =>
    a.localeCompare(
      b,
      undefined,
      {
        numeric: true,
        sensitivity: "base"
      }
    )
  );
}

function openColumnFilter(
  columnKey,
  button
) {
  const column =
    TABLE_COLUMNS[columnKey];

  if (!column) return;

  activeFilterColumn = columnKey;

  const popover =
    $("columnFilterPopover");

  const currentValue =
    tableState.filters[columnKey] || "";

  if (column.filterType === "select") {
    const options =
      getColumnFilterOptions(columnKey);

    popover.innerHTML = `
      <div class="column-filter-title">
        Filter ${esc(
          button.dataset.label ||
          columnKey
        )}
      </div>

      <select id="columnFilterInput">
        <option value="">All</option>

        ${options.map(value => `
          <option
            value="${esc(value)}"
            ${
              value === currentValue
                ? "selected"
                : ""
            }
          >
            ${esc(value)}
          </option>
        `).join("")}
      </select>

      <div class="column-filter-actions">
        <button
          type="button"
          id="applyColumnFilterBtn"
        >
          Apply
        </button>

        <button
          type="button"
          id="clearColumnFilterBtn"
        >
          Clear
        </button>
      </div>
    `;
  } else {
    popover.innerHTML = `
      <div class="column-filter-title">
        Filter ${esc(
          button.dataset.label ||
          columnKey
        )}
      </div>

      <input
        id="columnFilterInput"
        type="text"
        autocomplete="off"
        placeholder="Contains..."
        value="${esc(currentValue)}"
      />

      <div class="column-filter-actions">
        <button
          type="button"
          id="applyColumnFilterBtn"
        >
          Apply
        </button>

        <button
          type="button"
          id="clearColumnFilterBtn"
        >
          Clear
        </button>
      </div>
    `;
  }

  popover.hidden = false;

  const rect =
    button.getBoundingClientRect();

  const popoverWidth = 260;

  const left = Math.min(
    rect.left,
    window.innerWidth -
      popoverWidth -
      12
  );

  popover.style.left =
    `${Math.max(12, left)}px`;

  popover.style.top =
    `${rect.bottom + 6}px`;

  $("applyColumnFilterBtn")
    .addEventListener(
      "click",
      applyActiveColumnFilter
    );

  $("clearColumnFilterBtn")
    .addEventListener(
      "click",
      clearActiveColumnFilter
    );

  const input =
    $("columnFilterInput");

  input.focus();

  input.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyActiveColumnFilter();
      }

      if (event.key === "Escape") {
        closeColumnFilter();
      }
    }
  );
}

function applyActiveColumnFilter() {
  if (!activeFilterColumn) return;

  const value =
    $("columnFilterInput")
      .value
      .trim();

  if (value) {
    tableState.filters[
      activeFilterColumn
    ] = value;
  } else {
    delete tableState.filters[
      activeFilterColumn
    ];
  }

  saveTableState();
  closeColumnFilter();
  render();
}

function clearActiveColumnFilter() {
  if (!activeFilterColumn) return;

  delete tableState.filters[
    activeFilterColumn
  ];

  saveTableState();
  closeColumnFilter();
  render();
}

function closeColumnFilter() {
  const popover =
    $("columnFilterPopover");

  popover.hidden = true;
  popover.innerHTML = "";

  activeFilterColumn = null;
}

function resetInventoryFilters() {
  const hiddenColumns = [
    ...(tableState.hiddenColumns || [])
  ];

  tableState = {
    sortKey: "dex",
    sortDir: "asc",
    filters: {},
    hiddenColumns
  };

  saveTableState();
  closeColumnFilter();
  render();
}

function initializeInventoryHeaders() {
  document
    .querySelectorAll(".sort-header")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          sortInventoryBy(
            button.dataset.column
          );
        }
      );
    });

  document
    .querySelectorAll(
      ".column-filter-button"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          openColumnFilter(
            button.dataset.filter,
            button
          );
        }
      );
    });

  document.addEventListener(
    "click",
    event => {
      const popover =
        $("columnFilterPopover");

      if (
        popover.hidden ||
        popover.contains(event.target) ||
        event.target.closest(
          ".column-filter-button"
        )
      ) {
        return;
      }

      closeColumnFilter();
    }
  );

  document.addEventListener(
    "click",
    event => {
      const popover =
        $("columnVisibilityPopover");
  
      if (
        !popover ||
        popover.hidden ||
        popover.contains(event.target) ||
        event.target.closest("#columnsBtn")
      ) {
        return;
      }
  
      closeColumnVisibility();
    }
  );

  window.addEventListener(
    "resize",
    closeColumnFilter
  );
}

function updateInventoryHeaderState() {
  document
    .querySelectorAll(".sort-header")
    .forEach(button => {
      const active =
        button.dataset.column ===
        tableState.sortKey;

      const indicator =
        button.querySelector(
          ".sort-indicator"
        );

      button.classList.toggle(
        "active",
        active
      );

      if (indicator) {
        indicator.textContent =
          active
            ? (
                tableState.sortDir === "asc"
                  ? "▲"
                  : "▼"
              )
            : "";
      }
    });

  document
    .querySelectorAll(
      ".column-filter-button"
    )
    .forEach(button => {
      const active = Boolean(
        tableState.filters[
          button.dataset.filter
        ]
      );

      button.classList.toggle(
        "active",
        active
      );
    });

  const filterCount =
    Object.keys(
      tableState.filters
    ).length;

  $("resetFiltersBtn").textContent =
    filterCount
      ? `Reset Filters (${filterCount})`
      : "Reset Filters";
}

function filteredCards() {
  const query =
    $("search")
      .value
      .trim()
      .toLowerCase();

  const showInactive =
    $("showInactive").checked;

  let list = cards.filter(card => {
    if (
      !showInactive &&
      Number(card.quantity || 0) === 0
    ) {
      return false;
    }

    for (
      const [
        columnKey,
        filterValue
      ] of Object.entries(
        tableState.filters
      )
    ) {
      if (
        !cardMatchesColumnFilter(
          card,
          columnKey,
          filterValue
        )
      ) {
        return false;
      }
    }

    if (!query) return true;

    return [
      card.name,
      card.setName,
      card.cardNumber,
      card.language,
      card.size,
      card.variant,
      card.edition,
      card.specialPrintingLabel,
      card.sourceRarity,
      card.sourceCategory,
      card.sourceSuffix,
      card.condition,
      card.purchasedFrom,
      card.purchasedOn,
      card.status,
      card.storage,
      card.notes,
      card.dex
    ].some(value =>
      String(value ?? "")
        .toLowerCase()
        .includes(query)
    );
  });

  list.sort((a, b) => {
    const result =
      compareInventoryValues(
        a,
        b,
        tableState.sortKey
      );

    return tableState.sortDir === "desc"
      ? -result
      : result;
  });

  return list;
}

function compareCardNumbers(a, b) {
  const first = normalizeLocalCardNumber(a);
  const second = normalizeLocalCardNumber(b);

  const firstNumber = Number(first);
  const secondNumber = Number(second);

  if (
    Number.isFinite(firstNumber) &&
    Number.isFinite(secondNumber)
  ) {
    return firstNumber - secondNumber;
  }

  return first.localeCompare(
    second,
    undefined,
    { numeric: true }
  );
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character])
  );
}

function render() {
  const list = filteredCards();

  updateInventoryHeaderState();

  body.innerHTML = "";

  if (!list.length) {
    body.appendChild(
      $("emptyTemplate").content.cloneNode(true)
    );
  } else {
    for (const card of list) {
      const inactive = Number(card.quantity || 0) === 0;
      const row = document.createElement("tr");

      if (inactive) row.classList.add("inactive-row");

      row.innerHTML = `
        <td>${esc(card.dex ?? "")}</td>
        <td title="${esc(card.notes)}">${esc(card.name)}</td>
        <td>${esc(card.setName)}</td>
        <td>${esc(card.cardNumber)}</td>
        <td>${esc(card.language)}</td>
        <td>${esc(card.size || "Standard")}</td>
        <td>${esc(normalizeLegacyVariant(card.variant))}</td>
        <td>${esc(card.edition || "Unlimited")}</td>
        <td>${card.specialPrintingLabel
          ? `<span class="special-badge">${esc(card.specialPrintingLabel)}</span>`
          : ""
        }</td>
        <td>${esc(card.condition)}</td>
        <td>${Number(card.quantity || 0)}</td>
        <td>$${Number(card.basis || 0).toFixed(2)}</td>
        <td>${esc(card.purchasedFrom || "")}</td>
        <td>${esc(card.purchasedOn || "")}</td>
        <td>${esc(card.status)}</td>
        <td>${esc(card.storage)}</td>
        <td class="row-actions">
          <button onclick="editCard('${card.id}')">Edit</button>
          ${
            inactive
              ? `<button onclick="restoreCard('${card.id}')">Restore</button>`
              : `<button onclick="zeroOutCard('${card.id}')">Zero Out</button>`
          }
        </td>
      `;

      body.appendChild(row);
    }
  }

  const active = cards.filter(
    card => Number(card.quantity || 0) > 0
  );

  const inactive = cards.filter(
    card => Number(card.quantity || 0) === 0
  );

  $("uniqueCount").textContent =
    active.length.toLocaleString();

  $("cardCount").textContent =
    active.reduce(
      (sum, card) => sum + Number(card.quantity || 0),
      0
    ).toLocaleString();

  $("pcCount").textContent =
    active
      .filter(card => card.status === "PC")
      .reduce(
        (sum, card) => sum + Number(card.quantity || 0),
        0
      )
      .toLocaleString();

  $("inactiveCount").textContent =
    inactive.length.toLocaleString();
  
  applyColumnVisibility();
  }

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const anchor = document.createElement("a");

  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(
    () => URL.revokeObjectURL(anchor.href),
    1000
  );
}

$("exportJsonBtn").addEventListener("click", () => {
  const payload = {
    app: "KKM Card Tracker",
    version: 3,
    exportedAt: new Date().toISOString(),
    cards
  };

  download(
    `kkm-card-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
});

$("exportCsvBtn").addEventListener("click", () => {
  const columns = [
    "id",
    "name",
    "dex",
    "setId",
    "setName",
    "cardNumber",
    "language",
    "size",
    "variant",
    "edition",
    "specialPrintingLabel",
    "condition",
    "quantity",
    "basis",
    "purchasedFrom",
    "purchasedOn",
    "status",
    "storage",
    "notes",
    "sourceCardId",
    "sourceRarity",
    "sourceCategory",
    "sourceSuffix",
    "createdAt",
    "updatedAt",
    "inactiveAt"
  ];

  const csv = [
    columns.join(","),
    ...cards.map(card =>
      columns.map(column =>
        `"${String(card[column] ?? "").replaceAll('"', '""')}"`
      ).join(",")
    )
  ].join("\n");

  download(
    `kkm-card-export-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv"
  );
});

$("importJsonInput").addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed)
      ? parsed
      : parsed.cards;

    if (!Array.isArray(imported)) {
      throw new Error("No cards array found.");
    }

    if (
      !confirm(
        `Import ${imported.length} rows? This will replace the current local inventory.`
      )
    ) {
      return;
    }

    cards = imported.map(migrateCard);

    saveCards();
    render();
    clearForm();

  } catch (error) {
    alert(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});

populateSetDropdown();
resetPrintingControls();
initializeInventoryHeaders();

const savedDefaults = loadEntryDefaults();

$("language").value = savedDefaults.language || "English";
$("status").value = savedDefaults.status || "Legacy Inventory";
$("storage").value = savedDefaults.storage || "";
$("basis").value = savedDefaults.basis || "0.00";
$("purchasedFrom").value = savedDefaults.purchasedFrom || "";
$("purchasedOn").value = savedDefaults.purchasedOn || "";

if ($("setId").value) {
  selectImportedSet($("setId").value);
}

render();
