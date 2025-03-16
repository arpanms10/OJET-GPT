const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
// import { extractImagesFromPdf } from "pdf-extract-image";
const { encoding_for_model } = require("tiktoken");

function createTextChunks(text, maxTokens = 256) {
  const encoder = encoding_for_model("gpt-4");
  const tokens = encoder.encode(text);
  let chunks = [];

  for (let i = 0; i < tokens.length; i += maxTokens) {
    const chunkTokens = tokens.slice(i, i + maxTokens);
    const chunkText = encoder.decode(chunkTokens);
    chunks.push(chunkText);
  }

  return chunks;
}

async function extractAndChunkPDF(pdfBuffer, chunkSize = 256) {
  const data = await pdfParse(pdfBuffer);
  const fullText = data.text.replace(/\s+/g, " ").trim(); // Normalize spaces

  // Tokenize text into chunks
  return createTextChunks(fullText, chunkSize);
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
