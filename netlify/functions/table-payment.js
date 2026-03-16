const {
  normalizeTableNumber,
  normalizeAmount,
  getBill,
  saveBill,
} = require("./_table-bills-store");
const telegramNotify = require("./telegram-notify");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function (event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "METHOD_NOT_ALLOWED" });
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const tableNumber = normalizeTableNumber(payload.tableNumber);
    const paymentAmount = normalizeAmount(payload.paymentAmount);

    if (!tableNumber) {
      return json(400, { error: "INVALID_TABLE_NUMBER" });
    }
    if (paymentAmount === null || paymentAmount <= 0) {
      return json(400, { error: "INVALID_PAYMENT_AMOUNT" });
    }

    const bill = await getBill(tableNumber);
    if (!Number.isFinite(bill.totalAmount) || bill.totalAmount <= 0) {
      return json(400, { error: "BILL_NOT_INITIALIZED" });
    }

    if (bill.residualAmount <= 0) {
      return json(400, { error: "BILL_ALREADY_PAID", bill });
    }

    if (paymentAmount > bill.residualAmount) {
      return json(400, {
        error: "PAYMENT_EXCEEDS_RESIDUAL",
        bill,
        maxPayableAmount: bill.residualAmount,
      });
    }

    const paymentRecord = {
      id: `tbl_${Date.now()}`,
      amount: paymentAmount,
      timestamp: new Date().toISOString(),
    };

    const paidAmount = Math.round((bill.paidAmount + paymentAmount) * 100) / 100;
    const residualAmount = Math.round(Math.max(bill.totalAmount - paidAmount, 0) * 100) / 100;
    const status = residualAmount <= 0 ? "paid" : "partial";

    const nextBill = {
      ...bill,
      paidAmount,
      residualAmount,
      status,
      payments: [...(Array.isArray(bill.payments) ? bill.payments : []), paymentRecord],
      updatedAt: new Date().toISOString(),
    };

    await saveBill(tableNumber, nextBill);

    const isFinalPayment = status === "paid";
    let notificationSent = false;

    try {
      const notifyPayload = {
        type: "table_payment",
        tableNumber,
        total: nextBill.totalAmount,
        paymentAmount,
        paidAmount: nextBill.paidAmount,
        residualAmount: nextBill.residualAmount,
        status: isFinalPayment ? "CONTO SALDATO" : "QUOTA PAGATA",
        orderId: paymentRecord.id,
        name: `Tavolo ${tableNumber}`,
        address: `Tavolo ${tableNumber}`,
        items: [
          {
            qty: 1,
            name: isFinalPayment
              ? `Saldo finale tavolo ${tableNumber}`
              : `Quota tavolo ${tableNumber}`,
          },
        ],
      };

      const notifyResponse = await telegramNotify.handler(
        {
          httpMethod: "POST",
          body: JSON.stringify(notifyPayload),
        },
        context
      );

      notificationSent = notifyResponse?.statusCode >= 200 && notifyResponse?.statusCode < 300;
      if (!notificationSent) {
        console.warn("[table-payment] telegram-notify failed", notifyResponse?.statusCode);
      }
    } catch (notifyError) {
      console.warn("[table-payment] telegram-notify error", notifyError);
    }

    return json(200, {
      bill: nextBill,
      payment: paymentRecord,
      notificationSent,
      isFinalPayment,
    });
  } catch (error) {
    console.error("[table-payment] error", error);
    return json(500, { error: "INTERNAL_ERROR" });
  }
};
