const STORAGE_KEY = "kkmCardTracker_v2";
const LEGACY_STORAGE_KEY = "kkmLegacyTracker_v1";

const $ = id => document.getElementById(id);

let cards = loadCards();
let loadedSetId = null;
let loadedSetData = null;

const pokemonNameAliases = {
  "nidoran f": "nidoran-f",
  "nidoran female": "nidoran-f",
  "nidoran ♀": "nidoran-f",
  "nidoran♀": "nidoran-f",
  "nidoran m": "nidoran-m",
  "nidoran male": "nidoran-m",
  "nidoran ♂": "nidoran-m",
  "nidoran♂": "nidoran-m",
  "farfetchd": "farfetchd",
  "farfetch'd": "farfetchd",
  "mr mime": "mr-mime",
  "mr. mime": "mr-mime",
  "mime jr": "mime-jr",
  "mime jr.": "mime-jr",
  "mr rime": "mr-rime",
  "mr. rime": "mr-rime",
  "type null": "type-null",
  "type: null": "type-null",
  "ho oh": "ho-oh",
  "ho-oh": "ho-oh",
  "porygon z": "porygon-z",
  "porygon-z": "porygon-z",
  "jangmo o": "jangmo-o",
  "jangmo-o": "jangmo-o",
  "hakamo o": "hakamo-o",
  "hakamo-o": "hakamo-o",
  "kommo o": "kommo-o",
  "kommo-o": "kommo-o",
  "sirfetchd": "sirfetchd",
  "sirfetch'd": "sirfetchd",
  "flabebe": "flabebe",
  "flabébé": "flabebe",
  "wo chien": "wo-chien",
  "wo-chien": "wo-chien",
  "chien pao": "chien-pao",
  "chien-pao": "chien-pao",
  "ting lu": "ting-lu",
  "ting-lu": "ting-lu",
  "chi yu": "chi-yu",
  "chi-yu": "chi-yu"
};

const regionalPrefixes = ["alolan ", "galarian ", "hisuian ", "paldean "];

function formatDexNumber(number) {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(3, "0") : "";
}

function normalizePokemonName(name) {
  let normalized = name
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

  if (pokemonNameAliases[normalized]) {
    return pokemonNameAliases[normalized];
  }

  return normalized
    .replace(/[.'’]/g, "")
    .replace(/[:\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function autofillDexNumber() {
  const enteredName = $("name").value.trim();
  if (!enteredName) return;

  const dexMap = window.KKM_POKEDEX || {};
  let lookupName = normalizePokemonName(enteredName);
  let dex = dexMap[lookupName];

  // TCG card names often append ex / EX / GX / V / VMAX / VSTAR / BREAK.
  if (!dex) {
    const stripped = enteredName.replace(/\s+(ex|EX|GX|V|VMAX|VSTAR|BREAK)$/i, "").trim();
    lookupName = normalizePokemonName(stripped);
    dex = dexMap[lookupName];
  }

  if (dex) $("dex").value = formatDexNumber(dex);
}

function migrateLegacyCard(card) {
  return {
    ...card,
    setId: card.setId || "",
    size: card.size || "Standard",
    variant: normalizeLegacyVariant(card.variant),
    inactiveAt: Number(card.quantity || 0) === 0 ? (card.inactiveAt || new Date().toISOString()) : null
  };
}

function normalizeLegacyVariant(value) {
  if (["Standard", "Holo", "Reverse Holo", "Cosmos Holo", "Other"].includes(value)) return value;
  if (!value || value === "Promo" || value === "Stamped" || value === "Full Art" || value === "ex / EX / GX / V") {
    return "Standard";
  }
  return "Other";
}

function loadCards() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return JSON.parse(current).map(migrateLegacyCard);

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = JSON.parse(legacy).map(migrateLegacyCard);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function saveCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function populateSetDropdown() {
  const select = $("setId");
  const index = Array.isArray(window.KKM_SET_INDEX) ? window.KKM_SET_INDEX : [];
  const current = select.value;

  select.innerHTML = `<option value="">Manual / Promo Entry</option>`;

  const sets = [...index].sort((a, b) => {
    const aDate = a.releaseDate || "";
    const bDate = b.releaseDate || "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  for (const set of sets) {
    const option = document.createElement("option");
    option.value = set.id;
    option.dataset.name = set.name;
    const date = set.releaseDate ? ` (${set.releaseDate})` : "";
    option.textContent = `${set.name}${date}`;
    select.appendChild(option);
  }

  if ([...select.options].some(option => option.value === current)) {
    select.value = current;
  }
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
    script.onerror = () => reject(new Error(`Could not load local set file ${setId}.`));
    document.head.appendChild(script);
  });
}

async function selectImportedSet(setId) {
  loadedSetId = setId || null;
  loadedSetData = null;
  $("cardLookupStatus").textContent = "";

  if (!setId) {
    $("manualSetLabel").classList.remove("muted-field");
    $("setName").readOnly = false;
    return;
  }

  const selected = $("setId").selectedOptions[0];
  $("setName").value = selected?.dataset?.name || selected?.textContent || "";
  $("setName").readOnly = true;
  $("manualSetLabel").classList.add("muted-field");

  try {
    loadedSetData = await loadLocalSet(setId);
    $("cardLookupStatus").textContent = `${loadedSetData.cards.length} local records loaded`;
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

  if (!setId || !entered) return;

  if (loadedSetId !== setId || !loadedSetData) {
    await selectImportedSet(setId);
  }

  if (!loadedSetData) return;

  const target = normalizeLocalCardNumber(entered);
  const card = loadedSetData.cards.find(c =>
    normalizeLocalCardNumber(c.localId) === target
  );

  if (!card) {
    $("cardLookupStatus").textContent = "Card number not found in selected set";
    return;
  }

  $("name").value = card.name;

  // IMPORTANT:
  // officialCount is display metadata only. It is never a validation ceiling.
  // Secret rares such as Dark Raichu 83/82 must remain valid.
  if (!entered.includes("/") && loadedSetData.officialCount != null) {
    $("cardNumber").value = `${card.localId}/${loadedSetData.officialCount}`;
  }

  if (card.dex) {
    const dex = Array.isArray(card.dex) ? card.dex[0] : card.dex;
    $("dex").value = formatDexNumber(dex);
  } else {
    autofillDexNumber();
  }

  $("cardLookupStatus").textContent = card.name;
}

function formData() {
  const existing = cards.find(c => c.id === $("editId").value);
  const quantity = Number($("quantity").value || 0);
  const now = new Date().toISOString();

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
    condition: $("condition").value,
    quantity,
    basis: Number($("basis").value || 0),
    status: $("status").value,
    storage: $("storage").value.trim(),
    notes: $("notes").value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    inactiveAt: quantity === 0
      ? (existing?.inactiveAt || now)
      : null
  };
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

function clearForm() {
  form.reset();
  $("editId").value = "";
  $("quantity").value = 1;
  $("basis").value = "0.00";
  $("language").value = "English";
  $("size").value = "Standard";
  $("variant").value = "Standard";
  $("condition").value = "Unknown";
  $("status").value = "Legacy Inventory";
  $("setId").value = "";
  $("setName").readOnly = false;
  $("manualSetLabel").classList.remove("muted-field");
  $("cardLookupStatus").textContent = "";
  $("otherVariantWarning").hidden = true;
  loadedSetId = null;
  loadedSetData = null;
  form.querySelector('button[type="submit"]').textContent = "Add Card";
  $("cardNumber").focus();
}

const form = $("cardForm");
const body = $("inventoryBody");

form.addEventListener("submit", e => {
  e.preventDefault();
  if (!validateForm()) return;

  const card = formData();
  const idx = cards.findIndex(c => c.id === card.id);

  if (idx >= 0) cards[idx] = card;
  else cards.push(card);

  saveCards();
  render();
  clearForm();
});

$("clearBtn").addEventListener("click", clearForm);
$("search").addEventListener("input", render);
$("statusFilter").addEventListener("change", render);
$("sortBy").addEventListener("change", render);
$("showInactive").addEventListener("change", render);

$("variant").addEventListener("change", () => {
  const isOther = $("variant").value === "Other";
  $("otherVariantWarning").hidden = !isOther;
});

$("name").addEventListener("input", autofillDexNumber);

$("dex").addEventListener("blur", () => {
  $("dex").value = formatDexNumber($("dex").value);
});

$("setId").addEventListener("change", async () => {
  $("cardNumber").value = "";
  $("name").value = "";
  $("dex").value = "";
  await selectImportedSet($("setId").value);
  $("cardNumber").focus();
});

let cardLookupTimer = null;
$("cardNumber").addEventListener("input", () => {
  clearTimeout(cardLookupTimer);
  cardLookupTimer = setTimeout(resolveCardFromNumber, 180);
});

async function editCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c) return;

  $("editId").value = c.id;
  $("setId").value = c.setId || "";
  await selectImportedSet(c.setId || "");
  $("setName").value = c.setName || "";
  $("cardNumber").value = c.cardNumber || "";
  $("name").value = c.name || "";
  $("dex").value = c.dex ?? "";
  $("language").value = c.language || "English";
  $("size").value = c.size || "Standard";
  $("variant").value = normalizeLegacyVariant(c.variant);
  $("condition").value = c.condition || "Unknown";
  $("quantity").value = Number(c.quantity || 0);
  $("basis").value = Number(c.basis || 0).toFixed(2);
  $("status").value = c.status || "Legacy Inventory";
  $("storage").value = c.storage || "";
  $("notes").value = c.notes || "";
  $("otherVariantWarning").hidden = $("variant").value !== "Other";

  form.querySelector('button[type="submit"]').textContent = "Save Changes";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function zeroOutCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c || Number(c.quantity || 0) === 0) return;

  if (!confirm(`Set "${c.name}" to quantity 0? The record will be retained as inactive.`)) return;

  c.quantity = 0;
  c.inactiveAt = new Date().toISOString();
  c.updatedAt = c.inactiveAt;
  saveCards();
  render();
}

function restoreCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c || Number(c.quantity || 0) > 0) return;

  const qty = prompt("Restore quantity:", "1");
  if (qty === null) return;

  const n = Number(qty);
  if (!Number.isInteger(n) || n < 1) {
    alert("Enter a whole number greater than 0.");
    return;
  }

  c.quantity = n;
  c.inactiveAt = null;
  c.updatedAt = new Date().toISOString();
  saveCards();
  render();
}

window.editCard = editCard;
window.zeroOutCard = zeroOutCard;
window.restoreCard = restoreCard;

function filteredCards() {
  const q = $("search").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const sort = $("sortBy").value;
  const showInactive = $("showInactive").checked;

  let list = cards.filter(c => {
    if (!showInactive && Number(c.quantity || 0) === 0) return false;
    if (status && c.status !== status) return false;

    if (!q) return true;

    return [
      c.name, c.setName, c.cardNumber, c.language, c.size, c.variant,
      c.condition, c.status, c.storage, c.notes, c.dex
    ].some(v => String(v ?? "").toLowerCase().includes(q));
  });

  list.sort((a, b) => {
    if (sort === "recent") return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    if (sort === "name") return (a.name || "").localeCompare(b.name || "");
    if (sort === "set") {
      return (a.setName || "").localeCompare(b.setName || "")
        || compareCardNumbers(a.cardNumber, b.cardNumber);
    }

    const ad = a.dex ? Number(a.dex) : 99999;
    const bd = b.dex ? Number(b.dex) : 99999;
    return ad - bd || (a.name || "").localeCompare(b.name || "");
  });

  return list;
}

function compareCardNumbers(a, b) {
  const aa = normalizeLocalCardNumber(a);
  const bb = normalizeLocalCardNumber(b);
  const an = Number(aa);
  const bn = Number(bb);

  if (Number.isFinite(an) && Number.isFinite(bn) && !Number.isNaN(an) && !Number.isNaN(bn)) {
    return an - bn;
  }

  return aa.localeCompare(bb, undefined, { numeric: true });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function render() {
  const list = filteredCards();
  body.innerHTML = "";

  if (!list.length) {
    body.appendChild($("emptyTemplate").content.cloneNode(true));
  } else {
    for (const c of list) {
      const inactive = Number(c.quantity || 0) === 0;
      const tr = document.createElement("tr");
      if (inactive) tr.classList.add("inactive-row");

      tr.innerHTML = `
        <td>${esc(c.dex ?? "")}</td>
        <td title="${esc(c.notes)}">${esc(c.name)}</td>
        <td>${esc(c.setName)}</td>
        <td>${esc(c.cardNumber)}</td>
        <td>${esc(c.language)}</td>
        <td>${esc(c.size || "Standard")}</td>
        <td>${esc(normalizeLegacyVariant(c.variant))}</td>
        <td>${esc(c.condition)}</td>
        <td>${Number(c.quantity || 0)}</td>
        <td>$${Number(c.basis || 0).toFixed(2)}</td>
        <td>${esc(c.status)}</td>
        <td>${esc(c.storage)}</td>
        <td class="row-actions">
          <button onclick="editCard('${c.id}')">Edit</button>
          ${
            inactive
              ? `<button onclick="restoreCard('${c.id}')">Restore</button>`
              : `<button onclick="zeroOutCard('${c.id}')">Zero Out</button>`
          }
        </td>
      `;

      body.appendChild(tr);
    }
  }

  const active = cards.filter(c => Number(c.quantity || 0) > 0);
  const inactive = cards.filter(c => Number(c.quantity || 0) === 0);

  $("uniqueCount").textContent = active.length.toLocaleString();
  $("cardCount").textContent = active.reduce((sum, c) => sum + Number(c.quantity || 0), 0).toLocaleString();
  $("pcCount").textContent = active
    .filter(c => c.status === "PC")
    .reduce((sum, c) => sum + Number(c.quantity || 0), 0)
    .toLocaleString();
  $("inactiveCount").textContent = inactive.length.toLocaleString();
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("exportJsonBtn").addEventListener("click", () => {
  const payload = {
    app: "KKM Card Tracker",
    version: 2,
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
  const cols = [
    "id", "name", "dex", "setId", "setName", "cardNumber", "language",
    "size", "variant", "condition", "quantity", "basis", "status",
    "storage", "notes", "createdAt", "updatedAt", "inactiveAt"
  ];

  const csv = [
    cols.join(","),
    ...cards.map(c =>
      cols.map(k => `"${String(c[k] ?? "").replaceAll('"', '""')}"`).join(",")
    )
  ].join("\n");

  download(
    `kkm-card-export-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv"
  );
});

$("importJsonInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed) ? parsed : parsed.cards;

    if (!Array.isArray(imported)) throw new Error("No cards array found.");

    if (!confirm(`Import ${imported.length} rows? This will replace the current local inventory.`)) {
      return;
    }

    cards = imported.map(migrateLegacyCard);
    saveCards();
    render();
    clearForm();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

populateSetDropdown();
render();
