const { default: ollama } = require("ollama");
const express = require("express");
const path = require("path");
const app = express();
const multer = require("multer");
const {
  extractAndChunkPDF,
  extractTextFromImages
} = require("./src/pdfParser");
const {
  storeEmbeddings,
  searchEmbeddings,
  storeChunksInQdrant
} = require("./src/dbconnect");
const { generateEmbeddings } = require("./src/embeddings");
// const deepseekSearch = require("./src/modelHandler");

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (for UI)
app.use(express.static(path.join(__dirname, "public")));

// System Prompt (for better response guidance)
/* const SYSTEM_PROMPT = `You are an AI assistant restricted to using only the provided context to generate responses. 
Do not include any information that is not found in the retrieved context. If the context is insufficient or if you have received no or empty context, 
respond with 'I don't have enough information to answer this.'`; */

const SYSTEM_PROMPT = `You are an AI assistant that only provides answers based on retrieved data from the database. 
You must strictly follow these rules:
1. Only use the provided database data to generate responses. If no relevant data is retrieved, respond with: "I don’t have enough information to answer that."
2. Do not use your own knowledge or make assumptions.
3. Do not generate responses based on external world knowledge, prior training, or common sense reasoning.
4. If the retrieved data is unclear or ambiguous, state that explicitly and ask for clarification if necessary.
5. Keep responses factual, concise, and directly based on the retrieved data.`;

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

    /* const text = await extractTextFromImages(file.buffer);
    console.log(text, "text from images"); */
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
    //TODO: Implement a function to retrieve chat history from the database
    res.json({ history: "Chat history retrieved successfully" });
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
    const embedResponse = await generateEmbeddings(query);

    const queryEmbedding = embedResponse.data.embedding;

    // Search for similar embeddings
    const searchResults = await searchEmbeddings(queryEmbedding);
    const context = searchResults
      ?.map((result, index) => `(${index + 1}) ${result.payload.text}`)
      .join("\n\n");

    if (!context) {
      return res.json({ results: "No relevant information found." });
    }

    res.json({ results: context });
  } catch (error) {
    console.error("Error performing search:", error.message);
    res.status(500).json({ error: "Failed to retrieve results" });
  }
});

async function* generateReadableResponse(userQuery, searchResults) {
  console.log("Generating response...");
  try {
    let context = searchResults
      ?.map((result, index) => `(${index + 1}) ${result.payload.text}`)
      .join("\n\n");

    /* if (!context) {
      return "I don't have enough information to answer this.";
    } */

    console.log(context, "context");

    const ollamaResponse = await ollama.generate(
      {
        model: "deepseek-coder-v2",
        system: SYSTEM_PROMPT,
        prompt: `User Query: ${userQuery}\n\nRetrieved Data:\n${context}\n\nAssistant:`,
        stream: true
      },
      { responseType: "stream" } // Enable streaming response
    );

    //const ollamaResponse = await deepseekSearch(SYSTEM_PROMPT, context);

    console.log("Ollama response:", ollamaResponse);

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
