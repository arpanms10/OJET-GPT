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
const COLLECTION_NAME = "data_history";

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
    .upsert(COLLECTION_NAME, pointObj)
    .then(() => {
      console.log("Chat history stored successfully.");
    })
    .catch(err => {
      console.error("Error storing chat history:", err);
    });
}

async function searchEmbeddings(queryVector, limit = 500) {
  try {
    console.log("Searching embeddings in Qdrant...");
    console.log(queryVector);
    return await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_vector: true,
      score_threshold: 0.7
    });
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
    console.log(chunk);
    const decodedText = decoder.decode(chunk);
    const vector = await generateEmbeddings(decodedText); // Get embedding

    points.push({
      id: generateId(),
      vector,
      payload: {
        fileId,
        chunkIndex: i,
        text: decodedText
      }
    });
  }

  // Upsert to Qdrant
  await client.upsert(COLLECTION_NAME, { points });

  console.log(`✅ Stored ${chunks.length} chunks in Qdrant.`);
}

module.exports = { storeEmbeddings, searchEmbeddings, storeChunksInQdrant };
