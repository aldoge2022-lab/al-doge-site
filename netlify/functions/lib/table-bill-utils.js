const COVER_PRICE = 1.5;
const TABLE_MIN = 1;
const TABLE_MAX = 10;

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return round2(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return round2(parsed);
    }
  }
  return NaN;
}

function normalizeTableId(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new Error('ID tavolo mancante');
  }

  const tableNumber = Number.parseInt(raw, 10);
  if (!Number.isInteger(tableNumber) || tableNumber < TABLE_MIN || tableNumber > TABLE_MAX) {
    throw new Error(`ID tavolo non valido (consentiti ${TABLE_MIN}-${TABLE_MAX})`);
  }

  return String(tableNumber);
}

function sanitizeProductItems(inputItems) {
  const safeItems = [];
  const source = Array.isArray(inputItems) ? inputItems : [];

  for (const entry of source) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const name = String(entry.name ?? '').trim();
    const isCoverName = /^coperto\b/i.test(name);
    if (!name || isCoverName || entry.isCover === true) {
      continue;
    }

    const qtyRaw = Number.parseInt(entry.qty, 10);
    const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    const price = parseMoney(entry.price);
    if (!Number.isFinite(price) || price < 0) {
      continue;
    }

    const note = String(entry.note ?? '').trim();
    const extrasSource = Array.isArray(entry.extras) ? entry.extras : [];
    const extras = [];
    for (const extra of extrasSource) {
      if (!extra || typeof extra !== 'object') {
        continue;
      }
      const extraName = String(extra.name ?? '').trim();
      if (!extraName) {
        continue;
      }
      const extraPrice = parseMoney(extra.price);
      if (!Number.isFinite(extraPrice) || extraPrice < 0) {
        continue;
      }
      extras.push({
        name: extraName,
        price: extraPrice,
      });
    }

    const extrasTotal = round2(extras.reduce((sum, extra) => sum + extra.price, 0));
    const basePriceRaw = parseMoney(entry.basePrice);
    const fallbackBasePrice = round2(Math.max(0, price - extrasTotal));
    const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0
      ? basePriceRaw
      : fallbackBasePrice;

    safeItems.push({
      id: String(entry.id ?? `${Date.now()}-${safeItems.length + 1}`),
      name,
      qty,
      basePrice,
      extras,
      note,
      price,
      lineTotal: round2(qty * price),
      isCover: false,
    });
  }

  return safeItems;
}

function buildBill(rawBill) {
  const tableId = normalizeTableId(rawBill.tableId ?? rawBill.tableNumber);
  const coversRaw = Number.parseInt(rawBill.covers, 10);
  const covers = Number.isInteger(coversRaw) && coversRaw > 0 ? coversRaw : 0;

  const productItems = sanitizeProductItems(rawBill.items);
  const productsTotal = round2(productItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const coverTotal = round2(covers * COVER_PRICE);

  const items = [...productItems];
  if (covers > 0) {
    items.push({
      id: 'cover',
      name: `Coperto x ${covers}`,
      qty: covers,
      price: COVER_PRICE,
      lineTotal: coverTotal,
      isCover: true,
    });
  }

  return {
    schemaVersion: 1,
    tableId,
    covers,
    items,
    productsTotal,
    coverTotal,
    total: round2(productsTotal + coverTotal),
    updatedAt: new Date().toISOString(),
  };
}

function getTableStorageKey(tableId) {
  return `table-bill:${normalizeTableId(tableId)}`;
}

function getDefaultBill(tableId) {
  return buildBill({ tableId, covers: 0, items: [] });
}

module.exports = {
  COVER_PRICE,
  TABLE_MIN,
  TABLE_MAX,
  buildBill,
  getDefaultBill,
  getTableStorageKey,
  normalizeTableId,
};
