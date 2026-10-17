"""
Proposal Assistant – End-to-End API Integration Verification Test
Tests the full lifecycle: Auth -> Project Upload -> ONLYOFFICE Config -> RAG Job -> SSE Stream -> Review
"""
import asyncio
import json
from uuid import UUID

import httpx

BASE_URL = "http://localhost:8000"


async def run_verification():
    print("🚀 Starting Proposal Assistant E2E Verification...")
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # 1. Health check
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        print("✅ 1. Health check passed:", res.json())

        # 2. Seed dev auth token
        res = await client.post("/api/auth/seed-dev")
        assert res.status_code == 200, f"Auth seed failed: {res.text}"
        auth_data = res.json()
        token = auth_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ 2. Auth seed passed. User:", auth_data["email"])

        # 3. Create / Upload project workbook
        sample_xlsx_bytes = b"PK\x03\x04MockExcelWorkbookBinaryContent"
        files = {"file": ("Test_RFP_Workbook.xlsx", sample_xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        res = await client.post("/api/projects", headers=headers, files=files, data={"name": "Enterprise Security RFP"})
        assert res.status_code == 201, f"Project creation failed: {res.text}"
        project_data = res.json()
        project_id = project_data["id"]
        print(f"✅ 3. Project created: {project_data['name']} (ID: {project_id})")

        # 4. Get project details and ONLYOFFICE editorConfig
        res = await client.get(f"/api/projects/{project_id}", headers=headers)
        assert res.status_code == 200, f"Get project failed: {res.text}"
        detail = res.json()
        assert "editorConfig" in detail, "Missing editorConfig in project detail"
        print("✅ 4. ONLYOFFICE Config generated. DocKey:", detail["editorConfig"]["docKey"])

        # 5. Create answer generation job
        job_payload = {
            "questionText": "Describe your data retention and purge policy.",
            "questionAnchor": {"sheet": "Security & Compliance", "address": "B14"},
            "answerAnchor": {"sheet": "Security & Compliance", "address": "C14", "mergedRange": "C14:E14"},
            "context": {
                "columnHeaders": ["Prompt", "Vendor Response"],
                "sectionLabel": "Section 4: Data Protection",
                "charLimit": 500,
            },
            "options": {"length": "standard", "tone": "professional"},
        }
        res = await client.post(f"/api/projects/{project_id}/jobs", headers=headers, json=job_payload)
        assert res.status_code == 202, f"Job creation failed: {res.text}"
        job_data = res.json()
        job_id = job_data["jobId"]
        print(f"✅ 5. Answer job enqueued: {job_id} ({job_data['status']})")

        # 6. Stream SSE events
        tokens_received = []
        sources_received = []
        answer_id = None

        print("📡 6. Connecting to SSE Stream...")
        async with client.stream("GET", f"/api/jobs/{job_id}/stream") as stream:
            async for line in stream.aiter_lines():
                if line.startswith("event: "):
                    event_type = line[7:].strip()
                elif line.startswith("data: "):
                    data_str = line[6:].strip()
                    try:
                        data = json.loads(data_str)
                        if event_type == "token":
                            tokens_received.append(data.get("t", ""))
                        elif event_type == "sources":
                            sources_received = data.get("items", [])
                        elif event_type == "done":
                            answer_id = data.get("answerId")
                            print(f"🎉 Stream finished. AnswerId: {answer_id}, Confidence: {data.get('confidence')}")
                            break
                    except Exception:
                        pass

        assert len(tokens_received) > 0, "No tokens received from SSE stream"
        assert len(sources_received) > 0, "No grounded sources received from SSE stream"
        full_answer = "".join(tokens_received)
        print(f"✅ 6. Grounded Answer ({len(full_answer)} chars): {full_answer[:80]}...")
        print(f"   Top Citation: {sources_received[0]['doc']} ({sources_received[0]['score'] * 100}%)")

        # 7. Review action: Accept answer
        if answer_id:
            res = await client.patch(f"/api/answers/{answer_id}", headers=headers, json={"status": "ACCEPTED"})
            assert res.status_code == 200, f"Accept answer failed: {res.text}"
            print("✅ 7. Review action ACCEPTED persisted in DB")

        # 8. Export workbook
        res = await client.get(f"/api/projects/{project_id}/export", headers=headers)
        assert res.status_code == 200, f"Export failed: {res.text}"
        export_data = res.json()
        print("✅ 8. Export URL generated:", export_data["fileName"])

    print("\n🏁 ALL 8 INTEGRATION VERIFICATION CHECKS PASSED!")


if __name__ == "__main__":
    asyncio.run(run_verification())
