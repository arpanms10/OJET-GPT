// sourceFileParser.js
const path = require("path");
const { extractJsCodeBlocks, extractTextChunks, extractHtmlChunks, extractMarkDownChunk } = require("./codeChunker");
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
    // return chunks.map(text => ({ code: text, type: "text" }));
    return {fileType:'pdf', parsedChunks: chunks.map(text => ({ code: text, type: "text" }))};
  } else if ([".js", ".ts", ".tsx", ".jsx"].includes(ext)) {
    return {fileType:'javascript', parsedChunks: extractJsCodeBlocks(rawText)};
  } else if ([".html"].includes(ext)) {
    // return extractHtmlChunks(rawText);
    return {fileType:'html', parsedChunks: extractHtmlChunks(rawText)};
  } else if (ext === ".md") {
    // Markdown parsing
    // const sections = rawText
    //   .split(/\n(?=##+|```)/)
    //   .map(text => text.trim())
    //   .filter(Boolean);
    // // return sections.map(code => ({ code, type: "markdown" }));
    // return {fileType:'markdown', parsedChunks: sections.map(code => ({ code, type: "markdown" }))};
    return {fileType:'markdown', parsedChunks: extractMarkDownChunk(rawText)};
  } else if(ext === ".txt") {
    // return extractTextChunks(rawText);
    return {fileType:'text', parsedChunks: extractTextChunks(rawText)};
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".js", ".ts", ".tsx", ".jsx", ".html", ".txt", ".pdf",].includes(ext)) return "code";
  if ([".md"].includes(ext)) return "markdown";
  return "unknown";
}

module.exports = { parseSourceFile, getFileType };
