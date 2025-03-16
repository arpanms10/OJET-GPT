const { default: ollama } = require("ollama");
const express = require("express");
const axios = require("axios");
const path = require("path");
const app = express();
const multer = require("multer");
const { extractAndChunkPDF, extractTextFromImages } = require("./pdfParser");
const {
  storeEmbeddings,
  searchEmbeddings,
  storeChunksInQdrant
} = require("./dbconnect");
const { generateEmbeddings } = require("./embeddings");

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (for UI)
app.use(express.static(path.join(__dirname, "public")));

// System Prompt (for better response guidance)
const SYSTEM_PROMPT = `You are an AI assistant restricted to using only the provided context to generate responses. 
Do not include any information that is not found in the retrieved context. If the context is insufficient, 
respond with 'I don't have enough information to answer this.'`;

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// ---------------------------------
// Generate Chat Response & Store in DB
// ---------------------------------
app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log(prompt, "prompt");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Start streaming from Ollama
    if (prompt) {
      res.write("💡 Processing user query...\n");
      const queryVector = await generateEmbeddings(prompt);
      console.log(queryVector, "queryVector");
      const searchResults = await searchEmbeddings(queryVector);
      console.log(searchResults.length, "searchResults");

      res.write("🔍 Searching relevant information...\n");
      for await (const chunk of generateReadableResponse(
        prompt,
        searchResults
      )) {
        res.write(chunk);
      }
    }

    res.end();
  } catch (error) {
    console.error("Error communicating with Ollama:", error.message);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post("/file-upload", upload.single("file"), async (req, res) => {
  const { file } = req;
  if (!file) {
    return res.status(400).json({ error: "File is required" });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (file) {
    console.log("File uploaded: ", file.originalname);
    const chunks = await extractAndChunkPDF(file.buffer);

    // const text = await extractTextFromImages(file.buffer);
    console.log(text, "text from images");
    res.write("✅ PDF chunks stored successfully.\n");
    await storeChunksInQdrant(chunks, file.originalname);
    res.write("✅ PDF embeddings stored successfully.\n");
  }
});

// ---------------------------------
// Retrieve Chat History
// ---------------------------------
app.get("/history", async (req, res) => {
  try {
    /* const result = await pool.query(
      "SELECT * FROM chat_history ORDER BY created_at DESC"
    ); */
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching history:", error.message);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
});

// ---------------------------------
// Store Text Embeddings for RAG
// ---------------------------------
app.post("/store_embedding", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    // Get embedding using mxbai-embed-large
    const output = await generateEmbeddings(text);
    await storeEmbeddings(output, text);
    res.json({ message: "Embedding stored successfully" });
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// ---------------------------------
// Perform Similarity Search (RAG)
// ---------------------------------
app.post("/search", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    // Get embedding for search query
    const embedResponse = await axios.post(
      "http://localhost:11434/api/embeddings",
      {
        model: "mxbai-embed-large",
        prompt: query
      }
    );

    const queryEmbedding = embedResponse.data.embedding;

    // Search for similar vectors using cosine similarity
    /* const result = await pool.query(
      `
      SELECT content, embedding <-> $1 AS similarity
      FROM ojetgpt_vector
      ORDER BY similarity ASC
      LIMIT 5
      `,
      [queryEmbedding]
    ); */

    res.json({ results: result.rows });
  } catch (error) {
    console.error("Error performing search:", error.message);
    res.status(500).json({ error: "Failed to retrieve results" });
  }
});

async function* generateReadableResponse(userQuery, searchResults) {
  try {
    let context = searchResults
      ?.map((result, index) => `(${index + 1}) ${result.payload.text}`)
      .join("\n\n");

    if (!context) {
      return "I don't have enough information to answer this.";
    }

    console.log(context, "context");

    const ollamaResponse = await ollama.generate(
      {
        model: "deepseek-coder-v2",
        prompt: `${SYSTEM_PROMPT}\nUser Query: ${userQuery}\n\nRelevant Information:\n${context}\n\nAssistant:`,
        stream: true
      },
      { responseType: "stream" } // Enable streaming response
    );

    let fullResponse = "";
    for await (const part of ollamaResponse) {
      console.log("Response chunk:", part.response);
      fullResponse += part.response;
      yield part.response;
      if (part.done && part.done_reason === "stop") break;
    }

    // return fullResponse;
  } catch (error) {
    console.error("Error generating AI response:", error.message);
    throw new Error("Failed to generate response.");
  }
}
