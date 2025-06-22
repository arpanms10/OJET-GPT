const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
// import { extractImagesFromPdf } from "pdf-extract-image";
const { encoding_for_model } = require("tiktoken");

// import { AutoTokenizer } from '@xenova/transformers';
/*
const { AutoTokenizer } = require('@xenova/transformers');

// Load tokenizer for mxbai-embed-large
const tokenizer = await AutoTokenizer.from_pretrained('mixedbread-ai/mxbai-embed-large-v1');

async function createTokenAwareChunks(text, maxTokens = 256) {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const chunks = [];
  const seen = new Set();

  // Clean up and normalize whitespace
  text = text.replace(/\u00A0/g, ' ').replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n\n');

  // Extract and remove code blocks
  const codeBlocks = text.match(codeBlockRegex) || [];
  const remainingText = text.replace(codeBlockRegex, '');

  // --- 1. Handle code blocks ---
  for (const block of codeBlocks) {
    const encoded = await tokenizer.encode(block);
    const tokenIds = encoded.inputIds;

    for (let i = 0; i < tokenIds.length; i += maxTokens) {
      const sliced = tokenIds.slice(i, i + maxTokens);
      const decoded = await tokenizer.decode(sliced, { skipSpecialTokens: true });
      const trimmed = decoded.trim();

      if (trimmed && !seen.has(trimmed)) {
        chunks.push(trimmed);
        seen.add(trimmed);
      }
    }
  }

  // --- 2. Handle prose text ---
  const sentences = remainingText.split(/(?<=[.?!])\s+/);
  let currentChunk = '';
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    const encoded = await tokenizer.encode(trimmed);
    const sentenceTokens = encoded.inputIds;

    if (currentTokenCount + sentenceTokens.length > maxTokens) {
      const finalChunk = currentChunk.trim();
      if (finalChunk && !seen.has(finalChunk)) {
        chunks.push(finalChunk);
        seen.add(finalChunk);
      }

      currentChunk = trimmed;
      currentTokenCount = sentenceTokens.length;
    } else {
      currentChunk += ' ' + trimmed;
      currentTokenCount += sentenceTokens.length;
    }
  }

  // Push final chunk
  if (currentChunk.trim() && !seen.has(currentChunk.trim())) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
*/

function createTextChunks(text, maxTokens = 256) {
  const encoder = encoding_for_model("gpt-4");
  const codeBlockRegex = /```[\s\S]*?```/g;

  // Extract code blocks first
  const codeBlocks = text.match(codeBlockRegex) || [];
  const remainingText = text.replace(codeBlockRegex, "");

  const chunks = [];

  // First add code blocks directly as individual chunks
  for (const block of codeBlocks) {
    chunks.push(block);
  }

  // Then chunk the remaining prose by token size
  const tokens = encoder.encode(remainingText);
  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunkTokens = tokens.slice(i, i + maxTokens);
    const chunkText = encoder.decode(chunkTokens);
    chunks.push(chunkText);
  }

  return chunks;
}


/*
function createTextChunksV2(text, maxTokens = 256) {
  const encoder = encoding_for_model("cl100k_base");
  const codeBlockRegex = /```[\s\S]*?```/g;
  const seenChunks = new Set();
  const chunks = [];

  // Normalize and clean text
  text = text.replace(/\u00A0/g, ' ')       // non-breaking spaces to space
             .replace(/\s+\n/g, '\n')       // trim spaces before newlines
             .replace(/\n{2,}/g, '\n\n');   // normalize multiple newlines

  // Extract and process code blocks
  const codeBlocks = text.match(codeBlockRegex) || [];
  let remainingText = text.replace(codeBlockRegex, "");

  for (const block of codeBlocks) {
    const blockTokens = encoder.encode(block);

    // Chunk code block if it exceeds max token length
    for (let i = 0; i < blockTokens.length; i += maxTokens) {
      const chunkText = encoder.decode(blockTokens.slice(i, i + maxTokens)).trim();
      if (!seenChunks.has(chunkText)) {
        chunks.push(chunkText);
        seenChunks.add(chunkText);
      }
    }
  }

  // Split prose into sentences
  const sentences = remainingText.split(/(?<=[.?!])\s+/);
  let currentChunk = "";
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) continue;

    const sentenceTokens = encoder.encode(cleanSentence);

    if (currentTokenCount + sentenceTokens.length > maxTokens) {
      const trimmedChunk = currentChunk.trim();
      if (trimmedChunk && !seenChunks.has(trimmedChunk)) {
        chunks.push(trimmedChunk);
        seenChunks.add(trimmedChunk);
      }

      // Start new chunk
      currentChunk = cleanSentence;
      currentTokenCount = sentenceTokens.length;
    } else {
      currentChunk += " " + cleanSentence;
      currentTokenCount += sentenceTokens.length;
    }
  }

  // Add any final chunk
  const finalChunk = currentChunk.trim();
  if (finalChunk && !seenChunks.has(finalChunk)) {
    chunks.push(finalChunk);
  }

  return chunks;
}

*/

/**
 * 
 * | Feature                        | Version 1 | Version 2 |
| ------------------------------ | --------- | --------- |
| Model-agnostic tokenizer       | ✅         | ✅         |
| Sentence-based prose splitting | ✅         | ✅         |
| Code block splitting by tokens | ❌         | ✅         |
| Duplicate chunk filtering      | ❌         | ✅         |
| Whitespace / Unicode cleanup   | ❌         | ✅         |

 */

/**
 * 
 * Why maxTokens = 256?
Limits from embedding model context window
The mxbai-embed-large-v1 model supports a maximum context length of 512 tokens, meaning any input beyond that gets truncated 

By choosing 256, you're giving a safety margin to avoid hitting that limit, accommodating overhead like sentence padding or prompt tokens—so embeddings won’t unknowingly drop important content.

Tradeoff: granularity vs cost
Smaller chunks are quicker to encode and cheaper to store/query, but too small loses context. Around 200–400 tokens is a commonly recommended range to keep chunks coherent yet efficient.

Independent of Qdrant
Qdrant doesn't impose token limits; its role is storing the vector. The constraint is purely model-specific (the embedding encoder), not Qdrant.
 */
/*
function createTextChunksV1(text, maxTokens = 256) {
  const encoder = encoding_for_model("cl100k_base");  // more neutral tokenizer
  const codeBlockRegex = /```[\s\S]*?```/g;

  const chunks = [];

  // Extract code blocks
  const codeBlocks = text.match(codeBlockRegex) || [];
  let remainingText = text.replace(codeBlockRegex, "");

  // Add code blocks as-is (still improved in V2)
  for (const block of codeBlocks) {
    chunks.push(block);
  }

  // Split prose into sentences using punctuation-based delimiter
  const sentences = remainingText.split(/(?<=[.?!])\s+/);

  let currentChunk = "";
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const sentenceTokens = encoder.encode(sentence);

    // If adding this sentence exceeds max tokens, finalize the current chunk
    if (currentTokenCount + sentenceTokens.length > maxTokens) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentTokenCount = sentenceTokens.length;
    } else {
      currentChunk += " " + sentence;
      currentTokenCount += sentenceTokens.length;
    }
  }

  // Add any remaining text
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  return chunks;
}
  */

/**
 * 
 *{Approximation: ~1 token = 0.75 words (so 200 words ≈ 250–300 tokens)} text 
 * 
 */
function naiveChunkByWords(text, maxWords = 200) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}
async function extractAndChunkPDF(pdfBuffer, chunkSize = 256) {
  const data = await pdfParse(pdfBuffer);
  const fullText = data.text.replace(/\s+/g, " ").trim(); // Normalize spaces

  // Tokenize text into chunks
  return createTextChunks(fullText, chunkSize);
  // return await createTokenAwareChunks(fullText, chunkSize)
}

/**
 * Extract text from images in a PDF using Tesseract.js
 */
async function extractTextFromImages(fileBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const imagesInDoc = [];
    let extractedText = "";
    console.log(pdfDoc);
    //TODO: Need to work on extracting images from PDF

    console.log("===== Images in PDF =====");
    console.log(imagesInDoc);

    for (const image in imagesInDoc) {
      const { width, height, bitsPerComponent, colorSpace, data } = image;
      const imageBuffer = Buffer.from(data);
      const {
        data: { text }
      } = await Tesseract.recognize(imageBuffer, "eng", {
        logger: m => console.log("OCR Progress:", m)
      });

      extractedText += text + "\n";
    }

    return extractedText.trim() || "No readable text found.";
  } catch (error) {
    console.error("Error extracting text from images:", error);
    throw new Error("Failed to extract text from images in PDF.");
  }
}

module.exports = {
  extractAndChunkPDF,
  extractTextFromImages
};
