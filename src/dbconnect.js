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

/**
 * 
 *Flow Recap in RAG
🧾 You chunk your document into pieces of ~256 tokens (text chunks).

🔄 Each chunk (not each token) is passed to the embedding model (e.g., mxbai-embed-large).

📉 The embedding model turns the entire chunk into one fixed-length vector (e.g., a 1024-dimensional vector).

🧠 That single vector is stored in Qdrant — associated with the original chunk of text.
 */
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

async function storeChunksInQdrant(chunks, fileId, metadata, batchSize = 200) {
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
        ...metadata,
        // text: isCodeBlock ? chunk : decoder.decode(chunk),
        text: chunk,
        type: isCodeBlock ? "code" : "text"
      }
    });
  }

  // Upsert to Qdrant
  // await client.upsert(TEXT_COLLECTION, { points });
  console.log(`📦 Total points to insert: ${points.length}`);
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    try {
      console.log(`🔄 Inserting batch: ${i} to ${i + batch.length - 1}`);
      await client.upsert(TEXT_COLLECTION, {
        wait: true,
        points: batch,
      });
    } catch (err) {
      console.error(`❌ Error inserting batch ${i}-${i + batch.length - 1}:`, err);
      throw err;
    }
  }
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

async function storeIntoVectorDB({parsedChunks, fileType}, file, res){
  if (fileType === 'pdf') {
    const textChunks = parsedChunks
      .filter(c => c.type !== "code")
      .map(c => c.code)
      .join("");
    if (textChunks.length > 0) {
      await storeChunksInQdrant(textChunks, file.originalname);
      res.write("✅ Text chunks stored in data_history collection.\n");
    }
  } else if(fileType === 'javascript'){
      const jsCodeChunks = parsedChunks
        .filter(c => c.type === "code")
        .map(c => c.code)
        .join("");
      if (jsCodeChunks.length > 0) {
        const metadata = {
          language: "jsx",
          framework: "oraclejet",
          tags: ["oraclejet", "dialog", "vdom", "preact", "MVVM", "xApp"],
          filename: file.originalname
        };
        console.log("Storing code chunks:", jsCodeChunks);
        await storeCodeSnippets(jsCodeChunks, metadata);
        res.write("✅ Code chunks stored in code_snippets collection.\n");
      }
    } else if(fileType === 'html'){
      const htmlCodeChunks = parsedChunks
        .filter(c => c.type === "html" || c.type === "text")
        .map(c => c.code)
        .join("");
      if (htmlCodeChunks.length > 0) {
        const metadata = {
          language: "HTML",
          framework: "oraclejet",
          tags: ["oraclejet", "dialog", "vdom", "preact", "MVVM", "xApp", "HTML"],
          filename: file.originalname
        };
        console.log("Storing code chunks:", htmlCodeChunks);
        await storeCodeSnippets(htmlCodeChunks, metadata);
        res.write("✅ Code chunks stored in code_snippets collection.\n");
      }
    } else if (fileType === 'markdown'){
      const mdChunks = parsedChunks.join("");
      if (mdChunks.length > 0) {
        const metadata = {
          language: "markdown",
          framework: "oraclejet",
          tags: ["Low Level Desing", "LLD", "oraclejet", "dialog", "vdom", "preact", "MVVM", "xApp", "HTML"],
          filename: file.originalname
        };
        console.log("Storing code chunks:", mdChunks);
        await storeChunksInQdrant(mdChunks, file.originalname, metadata);
        res.write("✅ LLD chunks stored in code_snippets collection.\n");
      }
    } else {

    } 
}

module.exports = {
  storeEmbeddings,
  searchEmbeddings,
  storeChunksInQdrant,
  storeCodeSnippets,
  storeIntoVectorDB,
};
