const aiEngine = require("./ai-engine");

exports.handler = async (event, context) => {
  return aiEngine.handler(
    {
      ...event,
      __orchestratorInternal: true
    },
    context
  );
};
