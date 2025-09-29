const { tavily } = require("@tavily/core");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const response = await tvly.search("Who is Leo Messi?");

async function searchWeb(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  const url = `${process.env.TAVILY_API_HOST}/search`;

  try {
    const response = await axios.post(url, {
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      include_raw_content: true
    });

    const results = response.data.results;
    return results
      .map((r, i) => `🌐 Web (${i + 1}): ${r.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("Tavily search failed:", error.message);
    return "";
  }
}

module.exports = { searchWeb };
