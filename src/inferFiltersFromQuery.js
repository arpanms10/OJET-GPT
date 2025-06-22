const { default: ollama } = require("ollama");

const SYSTEM_PROMPT = `
You are an assistant that extracts structured metadata filters from natural language developer queries.
Return ONLY a JSON object with the following keys:
- framework: (string)
- tags: (array of strings)
- language: (string, e.g., "js", "tsx")
- filename: (string)
- type: ("code" or "text")

Examples:

Query: "Show Oracle JET dialog code using TSX"
→ {
  "framework": "oraclejet",
  "tags": ["dialog"],
  "language": "tsx",
  "type": "code"
}

Query: "Where is the PDF about deployment steps?"
→ {
  "tags": ["deployment"],
  "type": "text"
}

If any field is not clear, omit it. DO NOT explain anything. DO NOT return text outside the JSON.
`;

async function inferSearchFiltersWithLLM(userQuery) {
  try {
    const response = await ollama.chat({
      model: "mistral",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userQuery }
      ]
    });

    const raw = response.message.content.trim();
    const jsonStart = raw.indexOf("{");
    const json = raw.slice(jsonStart);

    const parsed = JSON.parse(json);
    return parsed;
  } catch (err) {
    console.error("❌ Failed to infer filters with LLM:", err.message);
    return null;
  }
}

function buildQdrantFilter(metadata = {}) {
  const must = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        must.push({
          key,
          match: { value: item }
        });
      }
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      must.push({
        key,
        match: { value }
      });
    }
  }

  return must.length > 0 ? { must } : null;
}

module.exports = { inferSearchFiltersWithLLM, buildQdrantFilter };
