const { QdrantClient } = require("@qdrant/js-client-rest");
const { v4: uuidv4 } = require("uuid");
const { generateEmbeddings } = require("./embeddings");
const dotenv = require("dotenv");
dotenv.config();

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  checkCompatibility: false
});
const TEXT_COLLECTION = "data_history";
const CODE_COLLECTION = "code_snippets";

function generateId() {
  return uuidv4();
}

async function storeEmbeddings(response, text) {
  console.log(response);
  const id = generateId();
  const pointObj = {
    wait: true,
    points: [{ id: id, vector: response, payload: { text: text } }]
  };
  client
    .upsert(TEXT_COLLECTION, pointObj)
    .then(() => {
      console.log("Chat history stored successfully.");
    })
    .catch(err => {
      console.error("Error storing chat history:", err);
    });
}

async function searchEmbeddings(queryVector, limit = 500) {
  try {
    const [textResults, codeResults] = await Promise.all([
      client.search(TEXT_COLLECTION, {
        vector: queryVector,
        limit,
        with_vector: true,
        score_threshold: 0.7
      }),
      client.search(CODE_COLLECTION, {
        vector: queryVector,
        limit,
        with_vector: true,
        score_threshold: 0.7
      })
    ]);

    return { textResults, codeResults };
  } catch (error) {
    console.error("Error searching embeddings in Qdrant:", error);
    throw new Error("Failed to search embeddings.");
  }
}

async function storeChunksInQdrant(chunks, fileId) {
  let points = [];
  const decoder = new TextDecoder("utf-8");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isCodeBlock = chunk.trim().startsWith("```");

    const vector = await generateEmbeddings(chunk);
    points.push({
      id: generateId(),
      vector,
      payload: {
        fileId,
        chunkIndex: i,
        text: isCodeBlock ? chunk : decoder.decode(chunk),
        type: isCodeBlock ? "code" : "text"
      }
    });
  }

  // Upsert to Qdrant
  await client.upsert(TEXT_COLLECTION, { points });

  console.log(`✅ Stored ${chunks.length} chunks in Qdrant.`);
}

async function storeCodeSnippets(code, metadata = {}) {
  try {
    const embedding = await generateEmbeddings(code);
    console.log("Generated embedding for code snippet:", embedding);
    const point = {
      id: generateId(),
      vector: embedding,
      payload: {
        text: code,
        ...metadata,
        type: "code"
      }
    };
    console.log("Storing code snippet with ID:", point.id);
    await client.upsert("code_snippets", { points: [point] });
    console.log("✅ Code snippet stored successfully:", point.id);
    return point;
  } catch (error) {
    console.error("❌ Error storing code snippet:", error.message);
  }
}

module.exports = {
  storeEmbeddings,
  searchEmbeddings,
  storeChunksInQdrant,
  storeCodeSnippets
};
