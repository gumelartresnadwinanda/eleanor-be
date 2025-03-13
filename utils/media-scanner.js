require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const exif = require("exif-reader");
const knex = require("knex");
const config = require("../knexfile");
const {
  generateImageThumbnail,
  generateVideoThumbnail,
} = require("./thumbnail-generator");

// Environment variables
const MEDIA_FOLDER = process.env.MEDIA_FOLDER;
const TEST_MODE = process.env.MEDIA_TEST_MODE === "true";
const OUTPUT_FILE = process.env.MEDIA_OUTPUT_FILE;
const TAGS = process.env.MEDIA_TAGS;
const CHECK_RECURSIVE = process.env.MEDIA_RECURSIVE_CHECK === "true";
const batchSize = parseInt(process.env.BATCH_SIZE, 10) || 10;
const startBatch = parseInt(process.env.START_BATCH, 10) || 0;
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
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png"];
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
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error(
            `Error extracting metadata with ffmpeg for ${filePath}:`,
            err
          );
          return reject(err);
        }
        resolve({
          title: path.basename(filePath, ext),
          duration: metadata.format.duration || null,
          file_type: ext === ".mp3" ? "music" : "video",
          created_at: metadata.format.tags.creation_time || null,
        });
      });
    });
  } else if ([...PHOTO_EXTENSIONS].includes(ext)) {
    // Extract metadata for image files using exif-reader
    try {
      const fileBuffer = await fs.readFile(filePath);
      const exifData = exif(fileBuffer);
      return {
        title: path.basename(filePath, ext),
        duration: null,
        file_type: "photo",
        exif: exifData,
      };
    } catch (error) {
      console.warn(`Error extracting EXIF data from ${filePath}:`, error);
      return {
        title: path.basename(filePath, ext),
        duration: null,
        file_type: "photo",
      };
    }
  } else if (ext === ".pdf") {
    // Handle PDF files
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

  const fileName = path.basename(filePath, path.extname(filePath));
  const firstTagFromFileName = fileName.includes("_")
    ? fileName.split("_")[0].toLowerCase()
    : null;

  return firstTagFromFileName
    ? [...tagsFromPath, firstTagFromFileName]
    : tagsFromPath;
}

async function processFile(filePath, mediaData) {
  const ext = path.extname(filePath).toLowerCase();
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    console.log(`Processing file: ${filePath}`);

    try {
      const metadata = await extractMetadata(filePath);
      if (!metadata) return;

      const thumbnailDir = path.join(path.dirname(filePath), "thumbnails");
      await ensureDirectoryExists(thumbnailDir);

      const thumbnailPath = path.join(
        thumbnailDir,
        `thumb_${path.basename(filePath, ext)}.jpg`
      );

      // Check if the thumbnail already exists
      try {
        await fs.access(thumbnailPath);
        console.log(`Thumbnail already exists: ${thumbnailPath}`);
      } catch (error) {
        if (error.code === "ENOENT") {
          // Thumbnail does not exist, generate a new one
          try {
            if ([...PHOTO_EXTENSIONS].includes(ext)) {
              await generateImageThumbnail(filePath, thumbnailPath);
            } else if ([...VIDEO_EXTENSIONS].includes(ext)) {
              await generateVideoThumbnail(filePath, thumbnailPath);
            }
          } catch (thumbnailError) {
            console.error(
              `Error generating thumbnail for ${filePath}:`,
              thumbnailError
            );
            await logError(filePath, thumbnailError.message);
            return; // Skip this file
          }
        } else {
          throw error;
        }
      }

      const directoryTags = USE_DIRECTORY_TAGS
        ? extractTagsFromPath(filePath)
        : [];
      const combinedTags = [
        ...new Set([...directoryTags, ...(TAGS ? TAGS.split(",") : [])]),
      ].join(",");

      const mediaEntry = {
        title: metadata.title,
        file_path: filePath,
        file_type: metadata.file_type,
        duration: metadata.duration,
        tags: combinedTags,
        thumbnail_path: thumbnailPath,
        thumbnail_md: thumbnailPath.replace(".jpg", "_md.jpg"),
        thumbnail_lg: thumbnailPath.replace(".jpg", "_lg.jpg"),
        created_at: metadata.created_at || new Date(),
        is_protected: MEDIA_IS_PROTECTED || false,
      };

      if (TEST_MODE) {
        mediaData.push({ ...mediaEntry, exif: metadata.exif });
      } else {
        try {
          await db("media").insert(mediaEntry);
        } catch (error) {
          if (error.code === "23505") {
            console.log(`Media file already exists: ${filePath}`);
          } else {
            throw error;
          }
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
    const errorLogContent = await fs.readFile(errorLogPath, "utf8");
    errorLog = JSON.parse(errorLogContent);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error reading media_error.json:", error);
    }
  }

  errorLog.push({ filePath, reason });

  try {
    await fs.writeFile(errorLogPath, JSON.stringify(errorLog, null, 2));
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
    const files = await fs.readdir(folderPath);
    const totalFiles = files.length;
    const totalBatches = Math.ceil(totalFiles / batchSize);

    for (let batch = startBatch; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, totalFiles);
      const batchFiles = files.slice(start, end);

      await Promise.all(
        batchFiles.map(async (file) => {
          const filePath = path.join(folderPath, file);
          const stat = await fs.stat(filePath);

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
              await processFile(filePath, mediaData);
            } catch (error) {
              console.error(`Error processing file: ${filePath}`, error);
            }
          }
        })
      );

      console.log(`Processed batch ${batch + 1} of ${totalBatches}`);
    }

    if (TEST_MODE && folderPath === MEDIA_FOLDER) {
      // Write media data to a file
      await fs.writeFile(OUTPUT_FILE, JSON.stringify(mediaData, null, 2));
      console.log(`Media data written to ${OUTPUT_FILE}`);
    } else if (!TEST_MODE && folderPath === MEDIA_FOLDER) {
      console.log("Media data inserted into the database.");
    }
  } catch (error) {
    console.error("Error scanning media folder:", error);
  } finally {
    if (folderPath === MEDIA_FOLDER) {
      // Close the database connection
      await db.destroy();
    }
  }
}

scanMediaFolder(MEDIA_FOLDER, [], batchSize, startBatch);
