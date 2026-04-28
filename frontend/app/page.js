"use client";
import { useState } from "react";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!idea) return;
    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("http://localhost:8000/generate-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea }),
      });
      const data = await res.json();
      setResponse(data.response);
    } catch (error) {
      setResponse("Error connecting to backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-4xl font-bold text-blue-900 mb-2">SpecForge</h1>
      <p className="text-gray-600 mb-8">AI-powered requirements engineering</p>
      <div className="max-w-2xl">
        <textarea
          className="w-full border border-gray-300 rounded-lg p-4 text-gray-800 text-base"
          rows={4}
          placeholder="Describe your product idea here..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Analysing..." : "Generate Spec"}
        </button>
        {response && (
          <div className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="font-bold text-gray-800 mb-3">Analysis:</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{response}</p>
          </div>
        )}
      </div>
    </main>
  );
}