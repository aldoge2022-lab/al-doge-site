const { getStore } = require("@netlify/blobs");
const fs = require("fs/promises");
const path = require("path");

const TABLE_BILLS_STORE = "table-bills-v1";
const MAX_TABLE_NUMBER = 10;
const LOCAL_FALLBACK_PATH = path.join("/tmp", "al-doge-table-bills.json");

function getBillsStore() {
  return getStore(TABLE_BILLS_STORE);
}

function normalizeTableNumber(rawTableNumber) {
  const parsed = Number.parseInt(rawTableNumber, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_TABLE_NUMBER) {
    return null;
  }
  return parsed;
}

function normalizeAmount(rawAmount) {
  const parsed = Number.parseFloat(rawAmount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

function billKey(tableNumber) {
  return `table-${tableNumber}`;
}

function buildDefaultBill(tableNumber) {
  return {
    tableNumber,
    totalAmount: 0,
    paidAmount: 0,
    residualAmount: 0,
    status: "open",
    payments: [],
    updatedAt: new Date().toISOString(),
  };
}

async function getBill(tableNumber) {
  try {
    const store = getBillsStore();
    const current = await store.get(billKey(tableNumber), { type: "json" });
    if (!current) {
      return buildDefaultBill(tableNumber);
    }
    return {
      ...buildDefaultBill(tableNumber),
      ...current,
      tableNumber,
    };
  } catch (error) {
    if (!isMissingBlobsEnvironment(error)) {
      throw error;
    }
    const localBills = await readLocalBills();
    const current = localBills[billKey(tableNumber)];
    if (!current) {
      return buildDefaultBill(tableNumber);
    }
    return {
      ...buildDefaultBill(tableNumber),
      ...current,
      tableNumber,
    };
  }
}

async function saveBill(tableNumber, billData) {
  try {
    const store = getBillsStore();
    await store.setJSON(billKey(tableNumber), billData);
  } catch (error) {
    if (!isMissingBlobsEnvironment(error)) {
      throw error;
    }
    const localBills = await readLocalBills();
    localBills[billKey(tableNumber)] = billData;
    await fs.writeFile(LOCAL_FALLBACK_PATH, JSON.stringify(localBills), "utf8");
  }
}

function isMissingBlobsEnvironment(error) {
  return (
    error &&
    typeof error.message === "string" &&
    error.message.includes("environment has not been configured to use Netlify Blobs")
  );
}

async function readLocalBills() {
  try {
    const raw = await fs.readFile(LOCAL_FALLBACK_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

module.exports = {
  MAX_TABLE_NUMBER,
  normalizeTableNumber,
  normalizeAmount,
  getBill,
  saveBill,
};
