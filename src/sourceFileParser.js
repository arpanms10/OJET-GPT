// sourceFileParser.js
const path = require("path");
const { extractJsCodeBlocks } = require("./codeChunker");
const { extractAndChunkPDF } = require("./pdfParser");

/**
 * Parses supported source files and returns an array of { code, type } blocks.
 */
async function parseSourceFile(fileBuffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  const rawText = fileBuffer.toString("utf-8");

  // ✅ PDF parsing via pdfParser.js
  if (ext === ".pdf") {
    const chunks = await extractAndChunkPDF(fileBuffer);
    return chunks.map(text => ({ code: text, type: "text" }));
  }

  // ✅ Code parsing via acorn
  if ([".js", ".ts", ".tsx", ".jsx"].includes(ext)) {
    return extractJsCodeBlocks(rawText);
  }

  // ✅ Markdown parsing
  if (ext === ".md") {
    const sections = rawText
      .split(/\n(?=##+|```)/)
      .map(text => text.trim())
      .filter(Boolean);
    return sections.map(code => ({ code, type: "markdown" }));
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".js", ".ts", ".tsx", ".jsx"].includes(ext)) return "code";
  if ([".md"].includes(ext)) return "markdown";
  return "unknown";
}

module.exports = { parseSourceFile, getFileType };
