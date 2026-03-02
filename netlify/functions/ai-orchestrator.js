const aiEngine = require("./ai-engine");

exports.handler = (event, context) => {
  return aiEngine.handler(event, context);
};
