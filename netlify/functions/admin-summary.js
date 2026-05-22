exports.handler = async function () {
  return {
    statusCode: 403,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: false, error: "Dashboard privata non disponibile pubblicamente" })
  };
};
