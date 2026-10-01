
const STORAGE_KEY = "kkmLegacyTracker_v1";

let cards = loadCards();

const $ = id => document.getElementById(id);

const form = $("cardForm");
const body = $("inventoryBody");

function loadCards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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

function formData() {
  return {
    id: $("editId").value || newId(),
    name: $("name").value.trim(),
    dex: $("dex").value ? Number($("dex").value) : null,
    setName: $("setName").value.trim(),
    cardNumber: $("cardNumber").value.trim(),
    language: $("language").value,
    variant: $("variant").value,
    condition: $("condition").value,
    quantity: Number($("quantity").value || 1),
    basis: Number($("basis").value || 0),
    status: $("status").value,
    storage: $("storage").value.trim(),
    notes: $("notes").value.trim(),
    createdAt: $("editId").value
      ? (cards.find(c => c.id === $("editId").value)?.createdAt || new Date().toISOString())
      : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function clearForm() {
  form.reset();
  $("editId").value = "";
  $("quantity").value = 1;
  $("basis").value = "0.00";
  $("language").value = "English";
  $("variant").value = "Standard";
  $("condition").value = "Unknown";
  $("status").value = "Legacy Inventory";
  form.querySelector('button[type="submit"]').textContent = "Add Card";
  $("name").focus();
}

form.addEventListener("submit", e => {
  e.preventDefault();
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

function editCard(id) {
  const c = cards.find(x => x.id === id);
  if (!c) return;
  $("editId").value = c.id;
  $("name").value = c.name;
  $("dex").value = c.dex ?? "";
  $("setName").value = c.setName;
  $("cardNumber").value = c.cardNumber;
  $("language").value = c.language;
  $("variant").value = c.variant;
  $("condition").value = c.condition;
  $("quantity").value = c.quantity;
  $("basis").value = c.basis.toFixed(2);
  $("status").value = c.status;
  $("storage").value = c.storage;
  $("notes").value = c.notes;
  form.querySelector('button[type="submit"]').textContent = "Save Changes";
  window.scrollTo({top:0, behavior:"smooth"});
}

function deleteCard(id) {
  if (!confirm("Delete this inventory row?")) return;
  cards = cards.filter(c => c.id !== id);
  saveCards();
  render();
}

window.editCard = editCard;
window.deleteCard = deleteCard;

function filteredCards() {
  const q = $("search").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  const sort = $("sortBy").value;

  let list = cards.filter(c => {
    if (status && c.status !== status) return false;
    if (!q) return true;
    return [
      c.name, c.setName, c.cardNumber, c.language, c.variant,
      c.condition, c.status, c.storage, c.notes, c.dex
    ].some(v => String(v ?? "").toLowerCase().includes(q));
  });

  list.sort((a,b) => {
    if (sort === "recent") return new Date(b.createdAt) - new Date(a.createdAt);
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "set") return (a.setName || "").localeCompare(b.setName || "") || (a.cardNumber || "").localeCompare(b.cardNumber || "");
    const ad = a.dex ?? 99999, bd = b.dex ?? 99999;
    return ad - bd || a.name.localeCompare(b.name);
  });

  return list;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function render() {
  const list = filteredCards();
  body.innerHTML = "";

  if (!list.length) {
    body.appendChild($("emptyTemplate").content.cloneNode(true));
  } else {
    for (const c of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.dex ?? ""}</td>
        <td title="${esc(c.notes)}">${esc(c.name)}</td>
        <td>${esc(c.setName)}</td>
        <td>${esc(c.cardNumber)}</td>
        <td>${esc(c.language)}</td>
        <td>${esc(c.variant)}</td>
        <td>${esc(c.condition)}</td>
        <td>${c.quantity}</td>
        <td>$${Number(c.basis || 0).toFixed(2)}</td>
        <td>${esc(c.status)}</td>
        <td>${esc(c.storage)}</td>
        <td class="row-actions">
          <button onclick="editCard('${c.id}')">Edit</button>
          <button onclick="deleteCard('${c.id}')">Delete</button>
        </td>`;
      body.appendChild(tr);
    }
  }

  $("uniqueCount").textContent = cards.length.toLocaleString();
  $("cardCount").textContent = cards.reduce((s,c) => s + Number(c.quantity || 0), 0).toLocaleString();
  $("pcCount").textContent = cards.filter(c => c.status === "PC").reduce((s,c) => s + Number(c.quantity || 0), 0).toLocaleString();
  $("magnetCount").textContent = cards.filter(c => c.status === "Magnet Candidate").reduce((s,c) => s + Number(c.quantity || 0), 0).toLocaleString();
}

function download(name, content, type) {
  const blob = new Blob([content], {type});
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
    app: "KKM Legacy Card Tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    cards
  };
  download(`kkm-card-backup-${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify(payload, null, 2), "application/json");
});

$("exportCsvBtn").addEventListener("click", () => {
  const cols = ["id","name","dex","setName","cardNumber","language","variant","condition","quantity","basis","status","storage","notes","createdAt","updatedAt"];
  const csv = [
    cols.join(","),
    ...cards.map(c => cols.map(k => `"${String(c[k] ?? "").replaceAll('"','""')}"`).join(","))
  ].join("\n");
  download(`kkm-card-export-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
});

$("importJsonInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed) ? parsed : parsed.cards;
    if (!Array.isArray(imported)) throw new Error("No cards array found.");
    if (!confirm(`Import ${imported.length} rows? This will replace the current local inventory.`)) return;
    cards = imported;
    saveCards();
    render();
    clearForm();
  } catch (err) {
    alert(`Import failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

render();
