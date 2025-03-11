require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const MEDIA_FOLDER = process.env.MEDIA_FOLDER;

if (!MEDIA_FOLDER) {
  throw new Error("MEDIA_FOLDER environment variable is not defined.");
}

console.log(`MEDIA_FOLDER is set to: ${MEDIA_FOLDER}`);

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

async function optimizeVideo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".mov") {
    console.log(`Skipping non-MOV file: ${filePath}`);
    return;
  }

  const fileName = path.basename(filePath, ".MOV");

  const outputFilePath = path.join(path.dirname(filePath), `${fileName}.mp4`);
  const successLog = path.join(path.dirname(filePath), "success.json");
  const failLog = path.join(path.dirname(filePath), "fail.json");

  // Check if the .mp4 file already exists
  try {
    await fs.access(outputFilePath);
    console.log(`Skipping already optimized file: ${outputFilePath}`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Error checking file existence: ${outputFilePath}`, error);
      return;
    }
  }

  try {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .outputOptions([
          "-c:v libx264",
          "-crf 28", // Adjust quality here (lower value means higher quality)
          "-preset fast",
        ])
        .output(outputFilePath)
        .on("progress", (progress) => {
          console.log(
            `Processing: ${filePath} - ${progress.percent.toFixed(2)}% done`
          );
        })
        .on("end", async () => {
          console.log(`Optimized video saved: ${outputFilePath}`);
          await logResult(filePath, successLog);
          resolve();
        })
        .on("error", async (error) => {
          console.error(`Error optimizing video: ${filePath}`, error);
          await logResult(filePath, failLog, error.message);
          reject(error);
        })
        .run();
    });
  } catch (error) {
    console.error(`Error processing file: ${filePath}`, error);
    await logResult(filePath, failLog, error.message);
  }
}

async function scanAndOptimize(folderPath = MEDIA_FOLDER) {
  if (!folderPath) {
    console.error("Folder path is undefined.");
    return;
  }

  try {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fs.stat(filePath);
      console.log(`Processing: ${filePath}`);
      if (stat.isDirectory()) {
        if (file.toLowerCase() === "optimized") {
          console.log(`Skipping optimized directory: ${filePath}`);
          continue;
        }
        await scanAndOptimize(filePath);
      } else {
        await optimizeVideo(filePath);
      }
    }
  } catch (error) {
    console.error("Error scanning media folder:", error);
  }
}

scanAndOptimize();
