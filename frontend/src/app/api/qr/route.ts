import { NextResponse } from "next/server";
import wwjsBot from "@/lib/wwjs";

export async function GET() {
  try {
    const qrDataUrl = await wwjsBot();
    return NextResponse.json({ qrUrl: qrDataUrl });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to generate QR code" },
      { status: 500 }
    );
  }
}
