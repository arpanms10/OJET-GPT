// codeChunker.js
const acorn = require("acorn");
const jsx = require("acorn-jsx");
const markdown = require('markdown-it')();

// Extend acorn to support JSX parsing
const parser = acorn.Parser.extend(jsx());

/**
 * Extracts top-level functions, classes, and variable declarations from JS/TS/JSX/TSX code.
 * Returns an array of { code, type }
 */
function extractJsCodeBlocks(sourceCode) {
  const blocks = [];
  let ast;
  try {
    ast = parser.parse(sourceCode, {
      ecmaVersion: "latest",
      sourceType: "module",
      onComment: (block, text, start, end, loc) => {
        // Store comments in an array for later use
        if (!ast.comments) {
          ast.comments = [];
        }
        ast.comments.push({ text, start, end, loc });
      }
    });
  } catch (err) {
    console.warn("Failed to parse file with acorn:", err.message);
    return [{ code: sourceCode, type: "code",  metadata: {} }];
  }

  // Associate comments with code blocks
  const comments = ast.comments || [];

  for (const node of ast.body) {
    const { start, end, type } = node;
    if (
      [
        "FunctionDeclaration",
        "ClassDeclaration",
        "VariableDeclaration"
      ].includes(type)
    ) {
      const code = sourceCode.slice(start, end).trim();
      const blockComments = comments.filter(comment => {
        // Check if the comment is within the code block
        return comment.start >= start && comment.end <= end;
      }).map(comment => comment.text.trim());
      blocks.push({
        code,
        type: "code",
        metadata: {
          comments: blockComments
        }
      });
    }
  }

  // Fallback if no usable blocks found
  if (blocks.length === 0) {
    const fileComments = comments.map(comment => comment.text.trim());
    blocks.push({
      code: sourceCode,
      type: "code",
      metadata: {
        comments: fileComments
      }
    });
  }

  return blocks;
}

const fs = require('fs');
const parse5 = require('parse5');

function extractHtmlChunks(htmlContent) {
  const chunks = [];
  const document = parse5.parse(htmlContent);

  // Recursively traverse the HTML document
  function traverse(node) {
    if (node.nodeName === '#text') {
      // Extract text content
      chunks.push({
        code: node.value.trim(),
        type: 'text',
        metadata: {}
      });
    } else {
      // Extract HTML tags
      chunks.push({
        code: parse5.serialize(node),
        type: 'html',
        metadata: {
          tagName: node.nodeName,
          attributes: node.attrs
        }
      });

      // Recursively traverse child nodes
      node.childNodes && node.childNodes.forEach(traverse);
    }
  }

  traverse(document);

  return chunks;
}

function extractTextChunks(textContent) {
  const chunks = textContent.split('\n').map((line, index) => ({
    code: line.trim(),
    type: 'text',
    metadata: {
      lineNumber: index + 1
    }
  }));

  return chunks;
}

/**
 * Chunk markdown content into smaller pieces.
 * @param {string} mdContent - The markdown content to be chunked.
 * @returns {string[]} An array of chunked markdown content.
 */
function extractMarkDownChunk(mdContent) {
  const tokens = markdown.parse(mdContent, {});
  const chunks = [];
  let currentChunk = '';
  let currentChunkTokenCount = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let tokenText = token.content || '';

    // Estimate token count for the current token
    const tokenCount = estimateTokenCount(tokenText);

    // Check if adding the current token exceeds the max token limit
    if (currentChunkTokenCount + tokenCount > 256) {
      // If it exceeds, add the current chunk to the list and start a new one
      chunks.push(currentChunk.trim());
      currentChunk = tokenText + ' ';
      currentChunkTokenCount = tokenCount;
    } else {
      // If not, add the token to the current chunk
      currentChunk += tokenText + ' ';
      currentChunkTokenCount += tokenCount;
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk.trim() !== '') {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Estimate the token count for a given text.
 * This is a simple estimation and may not be accurate for all cases.
 * @param {string} text - The text to estimate token count for.
 * @returns {number} The estimated token count.
 */
function estimateTokenCount(text) {
  // A simple estimation: count the number of words and add some buffer for punctuation
  return text.split(/\s+/).length + (text.match(/[^a-zA-Z0-9\s]/g) || []).length;
}


/*
// Read an HTML file
fs.readFile('example.html', 'utf8', (err, htmlContent) => {
  if (err) {
    console.error(err);
  } else {
    const htmlChunks = extractHtmlChunks(htmlContent);
    // Process the extracted HTML chunks
    const codeChunks = htmlChunks
      .filter(c => c.type === "html" || c.type === "text")
      .map(c => c.code)
      .join("");
    // Store the concatenated code chunks in the Vector DB
    storeCodeSnippets(codeChunks, {});
  }
});
*/

module.exports = { extractJsCodeBlocks, extractHtmlChunks, extractTextChunks, extractMarkDownChunk };
