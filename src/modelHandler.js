const OpenAI = require("openai");
const { default: ollama } = require("ollama");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1"
});

const googleAI = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY
});
const model = googleAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function deepseekSearch(system_prompt, query) {
  const messages = [
    { role: "system", content: system_prompt },
    { role: "user", content: query }
  ];
  try {
    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: messages,
      max_tokens: 100,
      num_results: 5,
      stream: true
    });

    const results = [];
    response.data.on("data", chunk => {
      results.push(chunk);
    });

    return results;
  } catch (error) {
    console.error("Error searching in Deepseek:", error.message);
    throw new Error("Failed to search in Deepseek");
  }
}

async function searchWithLocalModel(SYSTEM_PROMPT, userQuery, context) {
  return await ollama.generate(
    {
      model: "deepseek-coder-v2:16b",
      system: SYSTEM_PROMPT,
      prompt: `User Query: ${userQuery}

Use only the context below to answer the user's question.
Format any code using triple backticks (\`\`\`js):

${context}

Assistant:`,
      stream: true
    },
    { responseType: "stream" }
  );
}

module.exports = { deepseekSearch, searchWithLocalModel };
