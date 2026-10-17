"use client";

import React, { useEffect, useState, use, Suspense } from "react";
import { EditorHost } from "@/components/document-box/EditorHost";
import { apiGetProject, apiExportProject } from "@/lib/api/client";
import { Loader2 } from "lucide-react";

function ProjectEditorContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      apiGetProject(projectId)
        .then(setProject)
        .catch((err) => {
          console.warn("Using local project harness:", err);
          setProject({
            id: projectId,
            name: "Enterprise RFP Q4.xlsx",
            status: "active",
          });
        })
        .finally(() => setLoading(false));
    }
  }, [projectId]);

  const handleExport = async () => {
    try {
      const res = await apiExportProject(projectId, false);
      if (res.downloadUrl) {
        const a = document.createElement("a");
        a.href = res.downloadUrl;
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
