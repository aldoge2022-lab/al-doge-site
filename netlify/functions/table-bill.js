const {
  normalizeTableNumber,
  normalizeAmount,
  getBill,
  saveBill,
} = require("./_table-bills-store");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "GET") {
      const tableNumber = normalizeTableNumber(event.queryStringParameters?.table);
      if (!tableNumber) {
        return json(400, { error: "INVALID_TABLE_NUMBER" });
      }

      const bill = await getBill(tableNumber);
      return json(200, { bill });
    }

    if (event.httpMethod === "POST") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const tableNumber = normalizeTableNumber(payload.tableNumber);
      const totalAmount = normalizeAmount(payload.totalAmount);

      if (!tableNumber) {
        return json(400, { error: "INVALID_TABLE_NUMBER" });
      }
      if (totalAmount === null || totalAmount <= 0) {
        return json(400, { error: "INVALID_TOTAL_AMOUNT" });
      }

      const current = await getBill(tableNumber);
      const paidAmount = Math.min(current.paidAmount || 0, totalAmount);
      const residualAmount = Math.round((totalAmount - paidAmount) * 100) / 100;
      const status = residualAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "open";

      const nextBill = {
        ...current,
        tableNumber,
        totalAmount,
        paidAmount,
        residualAmount,
        status,
        note: typeof payload.note === "string" ? payload.note.trim() : "",
        updatedAt: new Date().toISOString(),
      };

      await saveBill(tableNumber, nextBill);
      return json(200, { bill: nextBill });
    }

    return json(405, { error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    console.error("[table-bill] error", error);
    return json(500, { error: "INTERNAL_ERROR" });
  }
};
