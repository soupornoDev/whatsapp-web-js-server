import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["whatsapp-web.js", "unzipper", "youtube-dl-exec", "ffmpeg-static", "qr-image"],
};

export default nextConfig;
