const ytDlp = require("youtube-dl-exec");
const ffmpeg = require("ffmpeg-static");
const ffprobe = require("ffprobe-static");
const path = require("path");
const fs = require("fs");

/**
 * Downloads audio from a YouTube URL and converts it to MP3.
 * @param {string} videoUrl - The YouTube video URL.
 * @param {string} outputDir - Directory where the MP3 file will be saved.
 * @returns {Promise<string>} - Resolves to the absolute path of the generated MP3 file.
 */
export default async function downloadMp3(videoUrl, outputDir = path.join(process.cwd(), "downloads")) {
  // Ensure destination directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Define output pattern using yt-dlp template syntax
  const outputTemplate = path.join(outputDir, "%(id)s.%(ext)s");

  try {
    await ytDlp(videoUrl, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: "192K",
      output: outputTemplate,
      ffmpegLocation: path.dirname(ffmpeg),
      noPlaylist: true,
    });

    // Extract Video ID from URL to construct final filename
    const urlObj = new URL(videoUrl);
    let videoId = urlObj.searchParams.get("v");

    // Handle shortened YouTube URLs (e.g., https://youtu.be/ID)
    if (!videoId && urlObj.hostname === "youtu.be") {
      videoId = urlObj.pathname.slice(1);
    }

    if (!videoId) {
      throw new Error("Could not determine YouTube video ID from URL.");
    }

    const expectedMp3Path = path.join(outputDir, `${videoId}.mp3`);

    if (!fs.existsSync(expectedMp3Path)) {
      throw new Error(`File conversion completed, but expected file was not found: ${expectedMp3Path}`);
    }

    return expectedMp3Path;
  } catch (error) {
    console.error("Error downloading/converting MP3:", error);
    throw error;
  }
}

// Example usage:
(async () => {
  try {
    const songUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    console.log("Starting download...");
    
    const filePath = await downloadMp3(songUrl);
    console.log(`Successfully downloaded to: ${filePath}`);
  } catch (err) {
    console.error("Failed to download song:", err.message);
  }
})();