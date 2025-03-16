const { default: ollama } = require("ollama");

async function generateEmbeddings(text) {
  console.log("Generating embeddings for ", text);
  const response = await ollama.embeddings({
    model: "mxbai-embed-large",
    prompt: text
  });
  console.log("Embedding In progress");
  return response.embedding;
}

module.exports = { generateEmbeddings };
