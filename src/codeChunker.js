// codeChunker.js
const acorn = require("acorn");
const jsx = require("acorn-jsx");

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
      sourceType: "module"
    });
  } catch (err) {
    console.warn("Failed to parse file with acorn:", err.message);
    return [{ code: sourceCode, type: "code" }];
  }

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
      blocks.push({ code, type: "code" });
    }
  }

  // Fallback if no usable blocks found
  if (blocks.length === 0) {
    blocks.push({ code: sourceCode, type: "code" });
  }

  return blocks;
}

module.exports = { extractJsCodeBlocks };
