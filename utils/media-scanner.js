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

// Initialize Knex.js
const db = knex(config.development);

// Folder to scan for media files
const MEDIA_FOLDER = process.env.MEDIA_FOLDER;

// Supported file extensions (added .mov and .cr2)
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const MUSIC_EXTENSIONS = [".mp3"];
const DOCUMENT_EXTENSIONS = [".pdf"];
const RAW_EXTENSIONS = [".cr2"]; //skip for now since it's not supported when generating thumbnails

const SUPPORTED_EXTENSIONS = [
  ...VIDEO_EXTENSIONS,
  ...PHOTO_EXTENSIONS,
  ...MUSIC_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
];

module.exports = SUPPORTED_EXTENSIONS;

// Test mode: if true, write to a file; if false, insert into the database
const TEST_MODE = process.env.TEST_MODE === "true";

// Output file for test mode
const OUTPUT_FILE = process.env.OUTPUT_FILE;

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

// Function to extract metadata from a file
async function extractMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([...VIDEO_EXTENSIONS, ...MUSIC_EXTENSIONS].includes(ext)) {
    // Extract metadata for video/audio files using ffmpeg
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve({
          title: path.basename(filePath, ext),
          duration: metadata.format.duration || null,
          file_type: ext === ".mp3" ? "music" : "video",
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

async function processFile(filePath, mediaData) {
  const ext = path.extname(filePath).toLowerCase();
  if (SUPPORTED_EXTENSIONS.includes(ext)) {
    console.log(`Processing file: ${filePath}`);

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
        if ([...PHOTO_EXTENSIONS].includes(ext)) {
          await generateImageThumbnail(filePath, thumbnailPath);
        } else if ([...VIDEO_EXTENSIONS].includes(ext)) {
          await generateVideoThumbnail(filePath, thumbnailPath);
        }
      } else {
        throw error;
      }
    }

    const mediaEntry = {
      title: metadata.title,
      file_path: filePath,
      file_type: metadata.file_type,
      duration: metadata.duration,
      tags: "",
      thumbnail_path: thumbnailPath,
      created_at: new Date(),
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
  }
}

// Function to scan the media folder and process files
async function scanMediaFolder(folderPath = MEDIA_FOLDER, mediaData = []) {
  try {
    // Read the media folder
    const files = await fs.readdir(folderPath);

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(folderPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          if (file.toLowerCase() === "thumbnails") {
            console.log(`Skipping thumbnails directory: ${filePath}`);
            return;
          }
          // Recursively scan nested directories
          await scanMediaFolder(filePath, mediaData);
        } else {
          try {
            await processFile(filePath, mediaData);
          } catch (error) {
            console.error(`Error processing file: ${filePath}`, error);
          }
        }
      })
    );

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

// Run the media scanner
scanMediaFolder();
