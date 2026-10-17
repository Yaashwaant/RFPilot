"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  Sparkles,
  Loader2,
  Database,
  Layers,
} from "lucide-react";
import { apiListKnowledge, apiUploadKnowledge, apiDeleteKnowledge } from "@/lib/api/client";

export default function KnowledgePage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await apiListKnowledge();
      setDocs(data);
    } catch (err) {
      console.warn("Using sample collateral:", err);
      setDocs([
        {
          id: "kb-01",
          name: "Security-Whitepaper-2026.pdf",
          mimeType: "application/pdf",
          chunkCount: 42,
          status: "READY",
          uploadedAt: new Date().toISOString(),
        },
        {
          id: "kb-02",
          name: "Compliance-Certifications.pdf",
          mimeType: "application/pdf",
          chunkCount: 18,
          status: "READY",
          uploadedAt: new Date().toISOString(),
        },
        {
          id: "kb-03",
          name: "SLA-and-Business-Continuity.pdf",
          mimeType: "application/pdf",
          chunkCount: 24,
          status: "READY",
          uploadedAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setIsUploading(true);
    try {
      await apiUploadKnowledge(selectedFile);
      setSelectedFile(null);
      loadDocs();
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this document and its vector chunks?")) return;
    try {
      await apiDeleteKnowledge(id);
      loadDocs();
    } catch (err) {
      console.error(err);
    }
  };

  const totalChunks = docs.reduce((acc, d) => acc + (d.chunkCount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h1 className="font-bold text-slate-900 text-base">Knowledge Base Collateral</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Database className="w-4 h-4 text-emerald-600" />
            {totalChunks} Indexed Vector Chunks
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-8">
        {/* Upload Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">Upload Reference Collateral</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add technical whitepapers, SOC2 reports, and SLA documents for hybrid vector & full-text grounding.
            </p>
          </div>

          <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 w-full border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-50/50">
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,.md"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                className="hidden"
                id="kb-upload-input"
              />
              <label htmlFor="kb-upload-input" className="cursor-pointer flex items-center justify-center gap-2 text-xs font-medium text-blue-600">
                <Upload className="w-4 h-4 text-blue-500" />
                <span>{selectedFile ? selectedFile.name : "Choose PDF, DOCX, XLSX, or TXT file"}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{isUploading ? "Chunking & Embedding..." : "Index Document"}</span>
            </button>
          </form>
        </div>

        {/* Document Grid */}
        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Indexed Collateral Library</h3>

          {loading ? (
            <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading documents...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-xs italic">
              No collateral uploaded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-xs text-slate-900 truncate" title={d.name}>
                          {d.name}
                        </h4>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(d.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(d.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      {d.chunkCount} chunks
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-full border border-emerald-200 text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {d.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
