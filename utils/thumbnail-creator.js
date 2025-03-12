require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const express = require("express");
const {
  generateImageThumbnail,
  generateVideoThumbnail,
} = require("./thumbnail-generator");

// Environment variables
// const MEDIA_FOLDER = process.env.MEDIA_FOLDER;
const MEDIA_FOLDER = "D:\\Photo";
const port = 6003;

const app = express();
let processedFiles = [];

// Supported file extensions
const VIDEO_EXTENSIONS = [".mp4", ".mkv"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg"];
const SUPPORTED_EXTENSIONS = [...VIDEO_EXTENSIONS, ...PHOTO_EXTENSIONS];
const BATCH_SIZE = 5;
const OUTPUT_SUMMARY_FILE = path.join(__dirname, "../output/scan_summary.json");

// Ensure the thumbnail directory exists
async function ensureDirectoryExists(directory) {
  try {
    await fs.mkdir(directory, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

// Function to process a single file and generate thumbnails
async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    // console.log("==================================================");
    // console.log(`Processing file: ${filePath}`);
    // console.log("==================================================");

    const thumbnailDir = path.join(path.dirname(filePath), "thumbnails");
    await ensureDirectoryExists(thumbnailDir);

    const thumbnailPath = path.join(
      thumbnailDir,
      `thumb_${path.basename(filePath, ext)}.jpg`
    );

    // Check if the thumbnail already exists
    try {
      await fs.access(thumbnailPath);
      console.log("==================================================");
      console.log(`Thumbnail already exists: ${thumbnailPath}`);
      console.log("==================================================");
      processedFiles.push({ filePath, status: "exists" });
    } catch (error) {
      if (error.code === "ENOENT") {
        // Thumbnail does not exist, generate a new one
        try {
          if (PHOTO_EXTENSIONS.includes(ext)) {
            await generateImageThumbnail(filePath, thumbnailPath);
          } else if (VIDEO_EXTENSIONS.includes(ext)) {
            await generateVideoThumbnail(filePath, thumbnailPath);
          }
          processedFiles.push({ filePath, status: "generated" });
        } catch (thumbnailError) {
          console.error(
            `Error generating thumbnail for ${filePath}:`,
            thumbnailError
          );
          processedFiles.push({
            filePath,
            status: "error",
            error: thumbnailError.message,
          });
        }
      } else {
        throw error;
      }
    }
    processedFiles.push(filePath);
  }
}

// Function to scan the media folder and process files in batches
async function scanMediaFolder(folderPath = MEDIA_FOLDER) {
  try {
    const files = await fs.readdir(folderPath);
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / BATCH_SIZE);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalFiles);
      const batchFiles = files.slice(start, end);

      await Promise.all(
        batchFiles.map(async (file) => {
          const filePath = path.join(folderPath, file);
          const stat = await fs.stat(filePath);

          if (stat.isDirectory()) {
            if (file.toLowerCase() === "thumbnails") {
              console.log("==================================================");
              console.log(`Skipping thumbnails directory: ${filePath}`);
              console.log("==================================================");
              return;
            }
            // Recursively scan nested directories
            await scanMediaFolder(filePath);
          } else {
            await processFile(filePath);
          }
        })
      );

      console.log(`Processed batch ${batch + 1} of ${totalBatches}`);
    }

    console.log("==================================================");
    console.log("FINISHED SCANNING");
    console.log("==================================================");
  } catch (error) {
    console.error("Error scanning media folder:", error);
  }
}

// Function to save the scan summary to a JSON file
async function saveScanSummary() {
  const summary = {
    totalProcessed: processedFiles.length,
    processedFiles,
  };
  try {
    await fs.writeFile(OUTPUT_SUMMARY_FILE, JSON.stringify(summary, null, 2));
    console.log(`Scan summary saved to ${OUTPUT_SUMMARY_FILE}`);
  } catch (error) {
    console.error("Error writing scan summary:", error);
  }
}

// Endpoint to get the status of the thumbnail generation process
app.get("/status", (req, res) => {
  const generatingStatus = processedFiles.filter(
    (file) => file.status === "generated" || file.status === "error"
  );
  res.json({
    totalProcessed: processedFiles.length,
    generatingStatus,
  });
});

// Start the server and begin scanning and generating thumbnails
const server = app.listen(port, () => {
  console.log("==================================================");
  console.log(`Server is running on http://localhost:${port}`);
  console.log("==================================================");
  scanMediaFolder().then(async () => {
    console.log("==================================================");
    console.log("Shutting down the server...");
    console.log("==================================================");
    await saveScanSummary();
    server.close();
  });
});
