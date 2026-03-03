function logExecution(payload) {
  const log = {
    timestamp: new Date().toISOString(),
    intent: payload.intent || 'info',
    toolUsed: payload.toolUsed || null,
    validation: payload.validation || null,
    finalCartDelta: Array.isArray(payload.finalCartDelta) ? payload.finalCartDelta : [],
    executionTimeMs: Number(payload.executionTimeMs) || 0,
    status: payload.status || 'success',
    error: payload.error || null
  };

  console.log(JSON.stringify(log));
}

module.exports = {
  logExecution
};
