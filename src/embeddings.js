/*
Summary
Concept	Meaning
maxTokens = 256	Controls how large each text chunk is before embedding
Vector stored	Is 1 per chunk, regardless of how many tokens in the chunk
Embedding size	Fixed (e.g., 1024 floats) — defined by the model, not by maxTokens
Why limit tokens?	To stay within the embedding model’s context limit (e.g. 512 for MXBAI)
*/
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


