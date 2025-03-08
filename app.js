const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const path = require("path");
const app = express();
app.use(express.json());

// Serve static HTML files
app.use(express.static(path.join(__dirname, "public")));

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const pool = new Pool({
  user: "app_user", // Change if you have a different username
  host: "localhost",
  database: "ojetgpt_database",
  password: "app_password", // Set your PostgreSQL password
  port: 5432
});

// POST: Generate a response to a prompt
app.post("/chat", async (req, res) => {
  const { prompt } = req.body;
  console.log("Prompt: ", prompt);

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const ollamaResponse = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "deepseek-coder-v2", // Change this to your model name
        prompt: prompt,
        stream: true
      },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/plain");

    let responseText = "";

    ollamaResponse.data.on("data", chunk => {
      const data = chunk.toString();
      responseText = JSON.parse(data).response;
      res.write(responseText);
    });

    ollamaResponse.data.on("end", async () => {
      // Store the interaction in PostgreSQL
      /* await pool.query(
                "INSERT INTO chat_history (prompt, response) VALUES ($1, $2)",
                [prompt, responseText]
            ); */
      res.end();
    });
  } catch (error) {
    console.error("Error communicating with Ollama:", error.message);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// GET: Retrieve stored chat history
app.get("/history", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM chat_history ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching history:", error.message);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
});
