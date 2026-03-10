/**
 * LEGACY FUNCTION (DEPRECATED)
 *
 * This endpoint is kept only for backward compatibility.
 * Official AI entrypoint: /.netlify/functions/ai-orchestrator
 * Source of truth: netlify/functions/ai-orchestrator.js + orchestrator-v3/*
 */

const { handler: orchestratorHandler } = require('./ai-orchestrator');

exports.handler = async (event = {}, context = {}) => {
  console.warn('[AI_ENGINE][DEPRECATED] Routed legacy call to ai-orchestrator.');
  return orchestratorHandler(event, context);
};
