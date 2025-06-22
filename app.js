const express = require("express");
const path = require("path");
const app = express();
const multer = require("multer");
const { parseSourceFile, getFileType } = require("./src/sourceFileParser");
const {
  storeEmbeddings,
  searchEmbeddings,
  storeChunksInQdrant,
  storeCodeSnippets,
  storeIntoVectorDB
} = require("./src/dbconnect");
const { generateEmbeddings } = require("./src/embeddings");
const { searchWithLocalModel } = require("./src/modelHandler");
const {
  inferSearchFiltersWithLLM,
  buildQdrantFilter
} = require("./src/inferFiltersFromQuery");
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

RULES:
1. You must only use the provided retrieved data to generate responses. Do not use external knowledge.
2. If no relevant data is retrieved, reply: "I don’t have enough information to answer that."
3. Do not guess or make assumptions. Be literal and precise.
4. If the retrieved data includes code, return the full code exactly as it appears, wrapped in triple backticks like \`\`\`js ... \`\`\`.
5. Do not omit or truncate code. Always include the full retrieved code block if it directly answers the user question.
6. Keep responses clear and based only on the content provided. Do not fabricate explanations.
`;
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
      const inferredResponse = await inferSearchFiltersWithLLM(prompt);
      console.log(inferredResponse, "filters from LLM");
      const filters = {}; //buildQdrantFilter(inferredResponse);
      console.log(filters, "filters for search");
      const { codeResults, textResults } = await searchEmbeddings(
        queryVector,
        filters
      );
      console.log(codeResults.length, "codeResults");
      console.log(textResults.length, "textResults");

      res.write("🔍 Searching relevant information...\n");
      for await (const chunk of generateReadableResponse(
        prompt,
        codeResults,
        textResults
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
  res.write(`📁 File uploaded: ${file.originalname}\n`);
  const fileType = getFileType(file.originalname);

  if (fileType === "unknown") {
    return res.status(400).json({ error: "Unsupported file type" });
  }

  let parsedData;
  try {
    parsedData = await parseSourceFile(file.buffer, file.originalname);
    console.log("Parsed chunks:", parsedData.parsedChunks);
    if (parsedData.parsedChunks.length === 0) {
      return res.status(400).json({ error: "No valid chunks found." });
    }
  } catch (error) {
    console.error("Failed to parse source file:", error.message);
    return res.status(500).json({ error: "Failed to parse file." });
  }
  parsedData.file = file;
  await storeIntoVectorDB(parsedData, file, res);

  res.end();
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
    const { codeResults, textResults } = await searchEmbeddings(queryEmbedding);
    const context = [
      ...codeResults.map(
        (result, index) => `(${index + 1}) ${result.payload.text}`
      ),
      ...textResults.map(
        (result, index) => `(${index + 1}) ${result.payload.text}`
      )
    ].join("\n\n");

    if (!context) {
      return res.json({ results: "No relevant information found." });
    }

    res.json({ results: context });
  } catch (error) {
    console.error("Error performing search:", error.message);
    res.status(500).json({ error: "Failed to retrieve results" });
  }
});

app.post("/store-code-snippet", async (req, res) => {
  const { code, metadata } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Code snippet is required" });
  }

  try {
    const point = await storeCodeSnippets(code, metadata);
    res.json({ message: "Code snippet stored successfully", id: point.id });
  } catch (error) {
    console.error("Failed to store code snippet:", error.message);
    res.status(500).json({ error: "Failed to store code snippet" });
  }
});

async function* generateReadableResponse(
  userQuery,
  codeResults = [],
  textResults = []
) {
  console.log("Generating response...");

  try {
    // Prioritize top 5 code and top 5 text blocks
    const codeChunks = codeResults
      .slice(0, 5)
      .map((res, i) => `💻 Code (${i + 1}):\n${res.payload.text}`);

    const textChunks = textResults
      .slice(0, 5)
      .map((res, i) => `📝 Text (${i + 1}):\n${res.payload.text}`);

    const contextChunks = [...codeChunks, ...textChunks];
    const context = contextChunks.join("\n\n");

    if (!context.trim()) {
      yield "⚠️ I don’t have enough information to answer that.";
      return;
    }

    console.log("Prepared context:\n", context);

    const ollamaResponse = await searchWithLocalModel(
      SYSTEM_PROMPT,
      userQuery,
      context
    );

    let fullResponse = "";
    for await (const part of ollamaResponse) {
      const escapedResponse = escapeHtml(part.response);
      console.log("Response chunk:", part.response);
      fullResponse += escapedResponse;
      yield escapedResponse;

      if (part.done && part.done_reason === "stop") break;
    }
  } catch (error) {
    console.error("❌ Error generating AI response:", error.message);
    yield "⚠️ Sorry, something went wrong while generating a response.";
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/*TODO: Design and scaffolding of C1 codebase
0. Create design document 
1. MVVM to Preact conversion of any component
2. addkittodialog component conversion
*/
