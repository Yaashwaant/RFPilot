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
  Link2,
  Globe,
  HardDrive,
  Cloud,
  FileSpreadsheet,
  Check,
  AlertCircle,
  X,
  Play,
  RotateCw,
} from "lucide-react";
import {
  apiListKnowledge,
  apiUploadKnowledge,
  apiDeleteKnowledge,
  apiListMemories,
  apiCreateMemory,
  apiDeleteMemory,
  apiSearchMemories,
  apiListConnectors,
  apiTestConnector,
  apiSyncConnector,
  apiUploadPastRfp,
} from "@/lib/api/client";

export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<"docs" | "memory" | "connectors">("docs");

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

  // Connectors state
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loadingConnectors, setLoadingConnectors] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<any | null>(null);
  const [connectorConfig, setConnectorConfig] = useState<Record<string, any>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [pastRfpFile, setPastRfpFile] = useState<File | null>(null);
  const [isUploadingPastRfp, setIsUploadingPastRfp] = useState(false);
  const [pastRfpUploadResult, setPastRfpUploadResult] = useState<any | null>(null);

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

  const loadConnectors = async () => {
    setLoadingConnectors(true);
    try {
      const data = await apiListConnectors();
      setConnectors(data);
    } catch (err) {
      console.warn("Could not load connectors:", err);
    } finally {
      setLoadingConnectors(false);
    }
  };

  useEffect(() => {
    loadDocs();
    loadMemories();
    loadConnectors();
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

  const handleOpenConnector = (c: any) => {
    setSelectedConnector(c);
    setConnectorConfig({});
    setTestResult(null);
    setSyncResult(null);
  };

  const handleTestConnector = async () => {
    if (!selectedConnector) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiTestConnector(selectedConnector.id, connectorConfig);
      setTestResult({ success: true, message: res.message || "Connection verified successfully!" });
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || "Connection test failed." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncConnector = async () => {
    if (!selectedConnector) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiSyncConnector(selectedConnector.id, connectorConfig);
      setSyncResult(res);
      loadMemories(); // Refresh learned memories count
    } catch (err: any) {
      setSyncResult({ status: "ERROR", message: err?.message || "Sync failed." });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUploadPastRfp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastRfpFile) return;
    setIsUploadingPastRfp(true);
    setPastRfpUploadResult(null);
    try {
      const res = await apiUploadPastRfp(pastRfpFile);
      setPastRfpUploadResult(res);
      setPastRfpFile(null);
      loadMemories();
    } catch (err: any) {
      setPastRfpUploadResult({ status: "ERROR", message: err?.message || "Failed to parse past RFP." });
    } finally {
      setIsUploadingPastRfp(false);
    }
  };

  const getConnectorIcon = (id: string) => {
    switch (id) {
      case "web_documentation":
        return <Globe className="w-6 h-6 text-indigo-600" />;
      case "google_drive":
        return <HardDrive className="w-6 h-6 text-amber-600" />;
      case "notion":
        return <FileText className="w-6 h-6 text-slate-800" />;
      case "confluence":
        return <Layers className="w-6 h-6 text-blue-600" />;
      case "sharepoint":
        return <Cloud className="w-6 h-6 text-sky-600" />;
      case "past_rfp_workbook":
        return <FileSpreadsheet className="w-6 h-6 text-emerald-600" />;
      default:
        return <Link2 className="w-6 h-6 text-blue-600" />;
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
              <span>Mem0 Memory ({memories.length})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("connectors");
                loadConnectors();
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "connectors"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Link2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Connectors ({connectors.length})</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 space-y-8">
        {activeTab === "docs" && (
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
        )}

        {activeTab === "memory" && (
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
                    Powered by Mem0. The AI automatically memorizes approved answers, reviewer edits, and imported past RFPs to ensure consistency across future proposals.
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
                  Memories are automatically created whenever you approve an answer, sync enterprise connectors, or add company facts above.
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
                          {m.metadata?.type === "approved_rfp_answer"
                            ? "Approved RFP Answer"
                            : m.metadata?.type === "past_approved_rfp"
                            ? "Historical RFP Q&A"
                            : "Enterprise Standard"}
                        </span>
                        {m.score !== undefined && (
                          <span className="text-[11px] font-mono text-emerald-600">
                            Match: {(m.score * 100).toFixed(0)}%
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

        {activeTab === "connectors" && (
          /* Enterprise Connectors Tab */
          <div className="space-y-8">
            {/* Direct Past RFP Importer Card */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    <h2 className="font-bold text-slate-900 text-sm">Import Past Completed RFP Workbook (.xlsx)</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Upload your company&apos;s previously filled RFP spreadsheets. The parser automatically detects Question and Response columns and ingests all approved answers into Mem0 memory.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[11px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Instant Q&A Ingestion
                </span>
              </div>

              <form onSubmit={handleUploadPastRfp} className="flex flex-col sm:flex-row gap-4 items-center pt-2">
                <div className="flex-1 w-full border-2 border-dashed border-slate-300 hover:border-emerald-400 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setPastRfpFile(e.target.files[0]);
                    }}
                    className="hidden"
                    id="past-rfp-upload-input"
                  />
                  <label htmlFor="past-rfp-upload-input" className="cursor-pointer flex items-center justify-center gap-2 text-xs font-medium text-emerald-700">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>{pastRfpFile ? pastRfpFile.name : "Select past filled RFP Excel (.xlsx) file"}</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={!pastRfpFile || isUploadingPastRfp}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                >
                  {isUploadingPastRfp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{isUploadingPastRfp ? "Extracting Q&A Pairs..." : "Ingest Past RFP"}</span>
                </button>
              </form>

              {pastRfpUploadResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    pastRfpUploadResult.status === "SUCCESS"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  {pastRfpUploadResult.status === "SUCCESS" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <span>{pastRfpUploadResult.message}</span>
                </div>
              )}
            </div>

            {/* Enterprise Connectors Grid */}
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Enterprise Document & Knowledge Connectors</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect where your company teams store reference docs, architecture whitepapers, and wikis.
                </p>
              </div>

              {loadingConnectors ? (
                <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span>Loading available connectors...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {connectors.map((c) => (
                    <div
                      key={c.id}
                      className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                            {getConnectorIcon(c.id)}
                          </div>
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {c.id}
                          </span>
                        </div>

                        <div>
                          <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">
                            {c.name}
                          </h4>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-3 leading-relaxed">
                            {c.description}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {c.fields?.length || 0} fields
                        </span>
                        <button
                          onClick={() => handleOpenConnector(c)}
                          className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-medium text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <span>Configure & Sync</span>
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Slide-over / Modal for Active Connector Configuration */}
            {selectedConnector && (
              <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        {getConnectorIcon(selectedConnector.id)}
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-900">{selectedConnector.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Configure authentication & trigger ingestion into Mem0.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedConnector(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Dynamic Fields Form */}
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                    {selectedConnector.fields?.map((f: any) => (
                      <div key={f.name} className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                          <span>{f.label}</span>
                          {f.required && <span className="text-red-500 text-[10px]">*Required</span>}
                        </label>
                        {f.type === "textarea" ? (
                          <textarea
                            rows={4}
                            value={connectorConfig[f.name] || ""}
                            onChange={(e) =>
                              setConnectorConfig({ ...connectorConfig, [f.name]: e.target.value })
                            }
                            placeholder={f.placeholder}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                          />
                        ) : (
                          <input
                            type={f.type || "text"}
                            value={connectorConfig[f.name] || ""}
                            onChange={(e) =>
                              setConnectorConfig({ ...connectorConfig, [f.name]: e.target.value })
                            }
                            placeholder={f.placeholder}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                          />
                        )}
                        {f.description && (
                          <p className="text-[11px] text-slate-400">{f.description}</p>
                        )}
                      </div>
                    ))}

                    {/* Test Result Feedback */}
                    {testResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                          testResult.success
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-red-50 border-red-200 text-red-800"
                        }`}
                      >
                        {testResult.success ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        )}
                        <span>{testResult.message}</span>
                      </div>
                    )}

                    {/* Sync Result Feedback */}
                    {syncResult && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                          syncResult.status === "SUCCESS"
                            ? "bg-blue-50 border-blue-200 text-blue-800"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}
                      >
                        {syncResult.status === "SUCCESS" ? (
                          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        )}
                        <span>{syncResult.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleTestConnector}
                      disabled={isTesting || isSyncing}
                      className="px-4 py-2 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                      <span>Test Connection</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedConnector(null)}
                        className="px-3.5 py-2 text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleSyncConnector}
                        disabled={isSyncing || isTesting}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>{isSyncing ? "Syncing into Mem0..." : "Sync to Mem0"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
