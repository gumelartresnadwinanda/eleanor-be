require("dotenv").config();
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const knex = require("knex");
const config = require("../knexfile");

// Environment variables
const MEDIA_FOLDER = process.env.MEDIA_FOLDER;
const TAGS = process.env.MEDIA_TAGS;
const CHECK_RECURSIVE = process.env.MEDIA_RECURSIVE_CHECK === "true";
const batchSize = 5;
const USE_DIRECTORY_TAGS = process.env.USE_DIRECTORY_TAGS === "true";
const MEDIA_EXCLUDED_DIRECTORIES = process.env.MEDIA_EXCLUDED_DIRECTORIES
  ? process.env.MEDIA_EXCLUDED_DIRECTORIES.split(",").map((dir) =>
      dir.toLowerCase()
    )
  : [];
const MEDIA_IS_PROTECTED = process.env.MEDIA_IS_PROTECTED === "true";

// Initialize Knex.js
const db = knex(config.development);

// Supported file extensions (added .mov and .cr2)
const VIDEO_EXTENSIONS = [".mp4", ".mkv"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MUSIC_EXTENSIONS = [".mp3"];
const DOCUMENT_EXTENSIONS = [".pdf"];
// const RAW_EXTENSIONS = [".cr2"]; //skip for now since it's not supported when generating thumbnails

const SUPPORTED_EXTENSIONS = [
  ...VIDEO_EXTENSIONS,
  ...PHOTO_EXTENSIONS,
  ...MUSIC_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
];

module.exports = SUPPORTED_EXTENSIONS;

// Ensure ffmpeg and ffprobe are installed and accessible
ffmpeg.getAvailableFormats((err) => {
  if (err) {
    console.error("ffmpeg is not installed or not accessible in the PATH.");
    process.exit(1);
  }
});

ffmpeg.getAvailableCodecs((err) => {
  if (err) {
    console.error("ffprobe is not installed or not accessible in the PATH.");
    process.exit(1);
  }
});

// Handle ffmpeg process exit codes
process.on("uncaughtException", (err) => {
  if (err.code === "3221225725") {
    console.error(
      "ffmpeg exited with code 3221225725: Press [q] to stop, [?] for help"
    );
  } else {
    console.error("Unhandled error:", err);
  }
  process.exit(1);
});

// Function to extract metadata from a file
async function extractMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([...VIDEO_EXTENSIONS, ...MUSIC_EXTENSIONS].includes(ext)) {
    // Extract metadata for video/audio files using ffmpeg
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, async (err, metadata) => {
        if (err) {
          console.error(
            `Error extracting metadata with ffmpeg for ${filePath}:`,
            err
          );
          return reject(err);
        }
        try {
          const fileStat = await fsp.stat(filePath);
          resolve({
            title: path.basename(filePath, ext),
            duration: metadata.format.duration || null,
            file_type: ext === ".mp3" ? "music" : "video",
            created_at: fileStat.mtime,
          });
        } catch (statError) {
          console.error(`Error getting file stats for ${filePath}:`, statError);
          reject(statError);
        }
      });
    });
  } else if ([...PHOTO_EXTENSIONS].includes(ext)) {
    try {
      const fileStat = await fsp.stat(filePath);
      return {
        title: path.basename(filePath, ext),
        duration: null,
        file_type: "photo",
        created_at: fileStat.mtime,
      };
    } catch (error) {
      console.warn(`Error extracting data from ${filePath}:`, error);
    }
  } else if (ext === ".pdf") {
    return {
      title: path.basename(filePath, ext),
      duration: null,
      file_type: "document",
    };
  } else {
    return null;
  }
}

function extractTagsFromPath(filePath) {
  const parts = filePath.split(path.sep);
  const tagsFromPath = parts
    .slice(1, -1)
    .filter(
      (part) =>
        !/^[A-Z]:$/i.test(part) &&
        !["photo", "video", ...MEDIA_EXCLUDED_DIRECTORIES].includes(
          part.toLowerCase()
        )
    )
    .map((part) => part.toLowerCase());

  return tagsFromPath;
}

async function processFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    console.log(`Processing file: ${filePath}`);

    try {
      const metadata = await extractMetadata(filePath);
      if (!metadata) return;

      const thumbnailDir = path.join(path.dirname(filePath), "thumbnails");

      const thumbnailPath = path.join(
        thumbnailDir,
        `thumb_${path.basename(filePath, ext)}.jpg`
      );

      const generateThumbnailPath = (suffix) =>
        thumbnailPath.replace(".jpg", `_${suffix}.jpg`);

      const thumbnailMd = fs.existsSync(generateThumbnailPath("md"))
        ? generateThumbnailPath("md")
        : "";
      const thumbnailLg = fs.existsSync(generateThumbnailPath("lg"))
        ? generateThumbnailPath("lg")
        : "";

      if (!fs.existsSync(thumbnailPath)) {
        console.log(`Thumbnail not generated for file: ${filePath}`);
      }

      const directoryTags = USE_DIRECTORY_TAGS
        ? extractTagsFromPath(filePath)
        : [];
      const combinedTags = Array.from(
        new Set([...directoryTags, ...(TAGS ? TAGS.split(",") : [])])
      ).join(",");

      const mediaEntry = {
        title: metadata.title,
        file_path: filePath,
        file_type: metadata.file_type,
        duration: metadata.duration,
        tags: combinedTags,
        thumbnail_path: fs.existsSync(thumbnailPath) ? thumbnailPath : "",
        thumbnail_md: thumbnailMd,
        thumbnail_lg: thumbnailLg,
        created_at: metadata.created_at || new Date(),
        is_protected: MEDIA_IS_PROTECTED || false,
      };

      try {
        await db("media").insert(mediaEntry);
      } catch (error) {
        if (error.code === "23505") {
          console.log(`Media file already exists: ${filePath}`);
        } else {
          throw error;
        }
      }

      console.log(`Processed: ${filePath}`);
    } catch (error) {
      console.error(`Error processing file: ${filePath}`, error);
      await logError(filePath, error.message);
    }
  }
}

// Function to log errors to media_error.json
async function logError(filePath, reason) {
  const errorLogPath = path.join(MEDIA_FOLDER, "media_error.json");
  let errorLog = [];

  try {
    const errorLogContent = await fsp.readFile(errorLogPath, "utf8");
    errorLog = JSON.parse(errorLogContent);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error reading media_error.json:", error);
    }
  }

  errorLog.push({ filePath, reason });

  try {
    await fsp.writeFile(errorLogPath, JSON.stringify(errorLog, null, 2));
  } catch (error) {
    console.error("Error writing to media_error.json:", error);
  }
}

// Function to scan the media folder and process files
async function scanMediaFolder(
  folderPath = MEDIA_FOLDER,
  mediaData = [],
  batchSize = 100,
  startBatch = 0
) {
  try {
    // Read the media folder
    const files = await fsp.readdir(folderPath);
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);

    for (let batch = startBatch; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, totalFiles);
      const batchFiles = files.slice(start, end);

      await Promise.all(
        batchFiles.map(async (file) => {
          const filePath = path.join(folderPath, file);
          const stat = await fsp.stat(filePath);

          if (stat.isDirectory()) {
            if (file.toLowerCase() === "thumbnails") {
              console.log(`Skipping thumbnails directory: ${filePath}`);
              return;
            }
            // Recursively scan nested directories
            if (CHECK_RECURSIVE) {
              await scanMediaFolder(filePath, mediaData, batchSize, 0);
            }
          } else {
            try {
              await processFile(filePath);
            } catch (error) {
              console.error(`Error processing file: ${filePath}`, error);
            }
          }
        })
      );

      console.log(`Processed batch ${batch + 1} of ${totalBatches}`);
    }
    console.log("Media data inserted into the database.");
  } catch (error) {
    console.error("Error scanning media folder:", error);
  } finally {
    if (folderPath === MEDIA_FOLDER) {
      // Close the database connection
      await db.destroy();
    }
  }
}

if (require.main === module) {
  scanMediaFolder(MEDIA_FOLDER, [], batchSize, 0);
}

// Export the functions you need
module.exports = {
  processFile,
  scanMediaFolder,
};
