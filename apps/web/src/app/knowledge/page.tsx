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
  Brain,
  Search,
  Plus,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  apiListKnowledge,
  apiUploadKnowledge,
  apiDeleteKnowledge,
  apiListMemories,
  apiCreateMemory,
  apiDeleteMemory,
  apiSearchMemories,
} from "@/lib/api/client";

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<"docs" | "memory">("docs");

  // Document state
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Memory state
  const [memories, setMemories] = useState<any[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [newMemoryText, setNewMemoryText] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  const [isSearchingMemories, setIsSearchingMemories] = useState(false);

  const loadDocs = async () => {
    setLoadingDocs(true);
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
      setLoadingDocs(false);
    }
  };

  const loadMemories = async () => {
    setLoadingMemories(true);
    try {
      const data = await apiListMemories();
      setMemories(data);
    } catch (err) {
      console.warn("Could not load memories:", err);
    } finally {
      setLoadingMemories(false);
    }
  };

  useEffect(() => {
    loadDocs();
    loadMemories();
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

  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to remove this document and its vector chunks?")) return;
    try {
      await apiDeleteKnowledge(id);
      loadDocs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    setIsAddingMemory(true);
    try {
      await apiCreateMemory(newMemoryText.trim());
      setNewMemoryText("");
      loadMemories();
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm("Delete this learned institutional memory?")) return;
    try {
      await apiDeleteMemory(id);
      loadMemories();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchMemories = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memorySearchQuery.trim()) {
      loadMemories();
      return;
    }
    setIsSearchingMemories(true);
    try {
      const results = await apiSearchMemories(memorySearchQuery.trim());
      setMemories(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingMemories(false);
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
            <h1 className="font-bold text-slate-900 text-base">Knowledge Base & Memory</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab("docs")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === "docs"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Document Collateral ({docs.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("memory");
                loadMemories();
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "memory"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-blue-600" />
              <span>Mem0 Institutional Memory ({memories.length})</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-8">
        {activeTab === "docs" ? (
          <>
            {/* Upload Document Card */}
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
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Indexed Collateral Library</h3>
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  {totalChunks} Indexed Vector Chunks
                </span>
              </div>

              {loadingDocs ? (
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
                          onClick={() => handleDeleteDoc(d.id)}
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
          </>
        ) : (
          /* Mem0 Institutional Memory Tab */
          <div className="space-y-6">
            {/* Memory Info & Add Card */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-600" />
                    <h2 className="font-bold text-slate-900 text-sm">Institutional Memory Layer (Mem0)</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Powered by Mem0. The AI automatically memorizes approved answers and reviewer edits, and recalls them when generating answers for future RFPs.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  Continuous Learning Active
                </span>
              </div>

              {/* Add Custom Corporate Memory */}
              <form onSubmit={handleAddMemory} className="flex gap-3 items-center pt-2">
                <input
                  type="text"
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  placeholder="Add custom company fact or policy (e.g. 'We offer 99.99% SLA with 15-minute RPO in all contracts')..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!newMemoryText.trim() || isAddingMemory}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                >
                  {isAddingMemory ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Remember Fact</span>
                </button>
              </form>
            </div>

            {/* Semantic Search Memories */}
            <div className="flex items-center justify-between gap-4">
              <form onSubmit={handleSearchMemories} className="flex-1 max-w-md flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memorySearchQuery}
                    onChange={(e) => setMemorySearchQuery(e.target.value)}
                    placeholder="Search learned memories..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearchingMemories}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {isSearchingMemories ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
                </button>
                {memorySearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setMemorySearchQuery("");
                      loadMemories();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Clear
                  </button>
                )}
              </form>

              <span className="text-xs text-slate-500">
                {memories.length} stored {memories.length === 1 ? "memory" : "memories"}
              </span>
            </div>

            {/* Memories List */}
            {loadingMemories ? (
              <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span>Loading memories from Mem0...</span>
              </div>
            ) : memories.length === 0 ? (
              <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-slate-400 text-xs italic space-y-2">
                <Brain className="w-8 h-8 mx-auto text-slate-300" />
                <p>No memories recorded yet.</p>
                <p className="text-[11px] text-slate-400">
                  Memories are automatically created whenever you approve an answer, or when you add company facts above.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-blue-300 transition-all flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded text-[10px] uppercase tracking-wider border border-blue-200">
                          {m.metadata?.type === "approved_rfp_answer" ? "Approved Answer" : "Enterprise Standard"}
                        </span>
                        {m.score !== undefined && (
                          <span className="text-[11px] font-mono text-emerald-600">
                            Relevance: {(m.score * 100).toFixed(0)}%
                          </span>
                        )}
                        {m.createdAt && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(m.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed font-normal">
                        {m.memory}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteMemory(m.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Forget this memory"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
