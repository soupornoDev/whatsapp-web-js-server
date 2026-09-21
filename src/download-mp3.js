const ytDlp = require("youtube-dl-exec");
const ffmpeg = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

/**
 * Download YouTube audio and convert it to MP3.
 *
 * @param {string} videoUrl
 * @param {string} outputDir
 * @returns {Promise<string>}
 */
async function downloadMp3(
  videoUrl,
  outputDir = path.join(process.cwd(), "downloads")
) {
  if (!videoUrl) {
    throw new Error("YouTube URL is required.");
  }

  // Make sure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
      recursive: true,
    });
  }

  try {
    // ----------------------------------------
    // Validate URL
    // ----------------------------------------

    const urlObj = new URL(videoUrl);

    if (
      !urlObj.hostname.includes("youtube.com") &&
      !urlObj.hostname.includes("youtu.be")
    ) {
      throw new Error("Invalid YouTube URL.");
    }

    // ----------------------------------------
    // Get YouTube Video ID
    // ----------------------------------------

    let videoId = null;

    if (urlObj.hostname.includes("youtu.be")) {
      videoId = urlObj.pathname.split("/")[1];
    } else {
      videoId = urlObj.searchParams.get("v");
    }

    if (!videoId) {
      throw new Error("Could not determine YouTube video ID.");
    }

    console.log(`YouTube Video ID: ${videoId}`);

    // ----------------------------------------
    // Output path
    // ----------------------------------------

    const outputTemplate = path.join(
      outputDir,
      `${videoId}.%(ext)s`
    );

    const mp3Path = path.join(
      outputDir,
      `${videoId}.mp3`
    );

    // ----------------------------------------
    // Download + Convert
    // ----------------------------------------

    console.log("Starting yt-dlp...");

    await ytDlp(videoUrl, {
      extractAudio: true,

      audioFormat: "mp3",
      audioQuality: "192K",

      output: outputTemplate,

      // ffmpeg-static gives the executable path
      ffmpegLocation: path.dirname(ffmpeg),

      noPlaylist: true,
      noWarnings: true,

      // Avoid downloading unnecessary files
      noPart: true,
    });

    // ----------------------------------------
    // Check MP3
    // ----------------------------------------

    if (!fs.existsSync(mp3Path)) {
      throw new Error(
        `MP3 file was not created:\n${mp3Path}`
      );
    }

    const stats = fs.statSync(mp3Path);

    if (stats.size === 0) {
      throw new Error("Downloaded MP3 file is empty.");
    }

    console.log(`MP3 created: ${mp3Path}`);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    return mp3Path;

  } catch (error) {
    console.error(
      "Error downloading/converting MP3:",
      error.message
    );

    throw error;
  }
}

module.exports = downloadMp3;