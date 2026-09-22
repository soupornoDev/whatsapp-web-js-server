"use client";
import { useState } from "react";

export default function Home() {

  function app(){
    
  }
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQR = async () => {
    setLoading(true);
    setError(null);
    try {
      // Adding a timestamp to prevent browser caching of the QR code image
      const timestamp = new Date().getTime();
      const apiUrl = process.env.NEXT_PUBLIC_BOT_API_URL || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/api/qr?t=${timestamp}`);
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch QR code");
      }
      
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setQrUrl(objectUrl);
    } catch (err: any) {
      setError(err.message);
      setQrUrl(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white p-6">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center border border-gray-700">
        <h1 className="text-3xl font-bold mb-4 text-green-400">WhatsApp Bot</h1>
        <p className="text-gray-400 mb-8">Scan the QR code to connect your bot</p>
        
        {error && (
          <div className="bg-red-900/50 text-red-300 p-4 rounded-lg mb-6 text-sm border border-red-800">
            {error}
          </div>
        )}

        {qrUrl ? (
          <div className="bg-white p-4 rounded-xl inline-block mb-6 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={qrUrl} 
              alt="WhatsApp QR Code" 
              width={250} 
              height={250} 
              className="rounded-lg" 
            />
          </div>
        ) : (
          <div className="w-[250px] h-[250px] bg-gray-700/50 rounded-xl mx-auto mb-6 flex items-center justify-center border-2 border-dashed border-gray-600">
            <span className="text-gray-500">No QR Code loaded</span>
          </div>
        )}

        <button 
          onClick={fetchQR} 
          disabled={loading}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-1 active:translate-y-0"
        >
          {loading ? "Generating..." : "Get QR Code"}
        </button>
      </div>
    </main>
  );
}
