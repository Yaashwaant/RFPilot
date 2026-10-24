"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { EditorHost } from "@/components/document-box/EditorHost";
import { apiGetProject, apiExportProject } from "@/lib/api/client";
import { Loader2 } from "lucide-react";

function ProjectEditorContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("proposal_assistant_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (projectId) {
      apiGetProject(projectId)
        .then(setProject)
        .catch((err) => {
          console.error("Failed to load project:", err);
          router.replace("/projects");
        })
        .finally(() => setLoading(false));
    }
  }, [projectId, router]);

  const handleExport = async () => {
    try {
      const res = await apiExportProject(projectId, false);
      if (res.downloadUrl) {
        let url = res.downloadUrl;
        if (url.includes("localhost:8000") && typeof window !== "undefined" && window.location.hostname !== "localhost") {
          url = url.replace(/^http:\/\/localhost:8000/, "");
        }
        const a = document.createElement("a");
        a.href = url;
        a.setAttribute("download", res.fileName || "filled_proposal.xlsx");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      alert(`Export failed: ${err?.message || "Unknown error"}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-100 gap-3 text-slate-600 font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Opening ONLYOFFICE document session...</span>
      </div>
    );
  }

  return (
    <EditorHost
      projectId={projectId}
      projectName={project?.name || "Proposal Spreadsheet.xlsx"}
      editorConfig={project?.editorConfig}
      onExport={handleExport}
    />
  );
}

export default function ProjectEditorPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-slate-100 gap-3 text-slate-600 font-sans">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="text-sm font-medium">Loading proposal session...</span>
        </div>
      }
    >
      <ProjectEditorContent params={props.params} />
    </Suspense>
  );
}
