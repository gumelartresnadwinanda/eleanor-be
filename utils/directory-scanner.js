require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");

// Environment variables
const SCAN_DIRECTORY = process.env.SCAN_DIRECTORY || ".";
const SCAN_OUTPUT_FILE = process.env.SCAN_OUTPUT_FILE || "directories.json";

async function scanDirectories(directoryPath, result = []) {
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      if (file.isDirectory()) {
        const fullPath = path.join(directoryPath, file.name);
        result.push(fullPath);
        await scanDirectories(fullPath, result);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory: ${directoryPath}`, error);
  }
  return result;
}

async function saveDirectoriesToFile(directoryPath, outputFilePath) {
  const directories = await scanDirectories(directoryPath);
  try {
    await fs.writeFile(outputFilePath, JSON.stringify(directories, null, 2));
    console.log(`Directories saved to ${outputFilePath}`);
  } catch (error) {
    console.error(`Error writing to file: ${outputFilePath}`, error);
  }
}

saveDirectoriesToFile(SCAN_DIRECTORY, SCAN_OUTPUT_FILE);
