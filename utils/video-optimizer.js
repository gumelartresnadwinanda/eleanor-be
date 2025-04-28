require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const express = require("express");
const { generateVideoThumbnail } = require("./thumbnail-generator");
const { processFile } = require("./media-scanner");

const MEDIA_FOLDER = process.env.MEDIA_OPTIMIZE_FOLDER;

if (!MEDIA_FOLDER) {
  throw new Error("MEDIA_FOLDER environment variable is not defined.");
}

console.log(`MEDIA_FOLDER is set to: ${MEDIA_FOLDER}`);

const app = express();
const port = 6002;

let optimizationStatus = [];
let optimizedVideos = [];
let thumbnailStatus = [];
let generatedThumbnails = 0;
let dbInsertedVideos = [];
let dbInsertCount = 0;

// Function to log the result of the optimization process
async function logResult(filePath, logPath, reason = null) {
  let log = [];
  try {
    const logContent = await fs.readFile(logPath, "utf8");
    log = JSON.parse(logContent);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Error reading ${logPath}:`, error);
    }
  }

  log.push({ filePath, reason });

  try {
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  } catch (error) {
    console.error(`Error writing to ${logPath}:`, error);
  }
}

// Function to optimize a video file
async function optimizeVideo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".mov") {
    console.log(`Skipping non-MOV file: ${filePath}`);
    console.log("--------------------------------------------------");
    return;
  }

  const fileName = path.basename(filePath, ".MOV");
  const outputFilePath = path.join(path.dirname(filePath), `${fileName}.mp4`);
  const thumbnailDir = path.join(path.dirname(filePath), "thumbnails");
  try {
    await fs.access(thumbnailDir);
  } catch {
    await fs.mkdir(thumbnailDir);
  }
  const thumbnailPath = path.join(thumbnailDir, `thumb_${fileName}.jpg`);
  const successLog = path.join(path.dirname(filePath), "success.json");
  const failLog = path.join(path.dirname(filePath), "fail.json");

  // Check if the .mp4 file already exists
  try {
    await fs.access(outputFilePath);
    console.log(`Skipping already optimized file: ${outputFilePath}`);
    console.log("--------------------------------------------------");
    return;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Error checking file existence: ${outputFilePath}`, error);
      console.log("--------------------------------------------------");
      return;
    }
  }

  try {
    const originalStat = await fs.stat(filePath);

    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([
          "-vf scale=1280:-2", // Resize width to 1280, keep aspect ratio
          "-r 30", // Set frame rate to 30fps
          "-c:v libx264", // Use H.264 codec
          "-preset fast", // Fast encoding
          "-crf 28", // Quality (lower = better quality)
          "-c:a aac", // Use AAC audio (Android-friendly)
          "-b:a 128k", // Audio bitrate
          "-movflags +faststart", // Allow progressive playback
        ])
        .output(outputFilePath)
        .on("progress", (progress) => {
          const existingIndex = optimizationStatus.findIndex(
            (status) => status.filePath === filePath
          );
          if (existingIndex !== -1) {
            optimizationStatus[existingIndex].progress =
              progress.percent?.toFixed(2);
          } else {
            optimizationStatus.push({
              filePath,
              progress: progress.percent?.toFixed(2),
            });
          }
        })
        .on("end", async () => {
          console.log(`Optimized video saved: ${outputFilePath}`);
          await fs.utimes(
            outputFilePath,
            originalStat.atime,
            originalStat.mtime
          );

          await logResult(filePath, successLog);
          optimizedVideos.push(filePath);
          optimizationStatus = optimizationStatus.filter(
            (status) => status.filePath !== filePath
          );

          // Generate thumbnail for the optimized video
          try {
            console.log(
              `Generating thumbnail for optimized video: ${outputFilePath}`
            );
            await generateVideoThumbnail(outputFilePath, thumbnailPath);
            console.log(`Thumbnail generated: ${thumbnailPath}`);
            generatedThumbnails++;
            thumbnailStatus.push({
              filePath: outputFilePath,
              status: "generated",
            });

            // Insert the optimized video into the database
            await processFile(outputFilePath);
            console.log(
              `Inserted optimized video into database: ${outputFilePath}`
            );
            dbInsertedVideos.push(outputFilePath);
            dbInsertCount++;
          } catch (thumbnailError) {
            console.error(
              `Error generating thumbnail or inserting into database for ${outputFilePath}:`,
              thumbnailError
            );
            thumbnailStatus.push({
              filePath: outputFilePath,
              status: "failed",
            });
          }

          console.log("--------------------------------------------------");
          resolve();
        })
        .on("error", async (error) => {
          console.error(`Error optimizing video: ${filePath}`, error);
          await logResult(filePath, failLog, error.message);
          optimizationStatus = optimizationStatus.filter(
            (status) => status.filePath !== filePath
          );
          console.log("--------------------------------------------------");
          reject(error);
        })
        .run();
    });
  } catch (error) {
    console.error(`Error processing file: ${filePath}`, error);
    await logResult(filePath, failLog, error.message);
    console.log("--------------------------------------------------");
  }
}

// Function to scan the media folder and optimize videos
async function scanAndOptimize(folderPath = MEDIA_FOLDER) {
  if (!folderPath) {
    console.error("Folder path is undefined.");
    console.log("--------------------------------------------------");
    return;
  }

  try {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fs.stat(filePath);
      console.log(`Processing: ${filePath}`);
      if (stat.isDirectory()) {
        if (file.toLowerCase() === "thumbnails") {
          console.log(`Skipping thumbnails directory: ${filePath}`);
          console.log("--------------------------------------------------");
          continue;
        }
        await scanAndOptimize(filePath);
      } else {
        await optimizeVideo(filePath);
      }
    }
  } catch (error) {
    console.error("Error scanning media folder:", error);
    console.log("--------------------------------------------------");
  }
}

// Endpoint to get the status of the optimization process
app.get("/status", (req, res) => {
  res.json({
    totalDoneOptimizing: optimizedVideos.length,
    generatedThumbnails,
    dbInsertCount,
    optimizationStatus,
    optimizedVideos,
    thumbnailStatus,
    dbInsertedVideos,
  });
});

// Start the server and begin scanning and optimizing videos
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log("--------------------------------------------------");
  scanAndOptimize();
});
