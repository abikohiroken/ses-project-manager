"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BusinessFieldsForm } from "@/components/features/business-fields-form";
import { RawTextView } from "@/components/features/raw-text-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { apiRequest, ApiRequestError, errorMessage, fieldErrors } from "@/lib/api/client";
import { formatJstDateTime, displayValue } from "@/lib/format/display";
import {
  businessFieldLabels,
  mergeableBusinessFields,
  toBusinessFormState,
  toBusinessPayload,
  type MergeableBusinessField,
} from "@/lib/ui/business-fields";
import { warningLabels } from "@/lib/ui/labels";
import type {
  ApiDetailResponse,
  ApiListResponse,
  IntakeEditorView,
  ProjectSearchItem,
} from "@/lib/ui/models";

type Dialog = "create" | "merge" | "reject" | null;

export function IntakeEditor({ intake, canEdit }: { intake: IntakeEditorView; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toBusinessFormState(intake));
  const [updatedAt, setUpdatedAt] = useState(intake.updatedAt);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showAi, setShowAi] = useState(false);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectSearchItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSearchItem | null>(null);
  const [applyFields, setApplyFields] = useState<MergeableBusinessField[]>([]);
  const projectNameRef = useRef<HTMLInputElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const mergeButtonRef = useRef<HTMLButtonElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);

  function handleFailure(error: unknown) {
    setErrors(fieldErrors(error));
    if (error instanceof ApiRequestError && error.status === 409) {
      setConflict(true);
      setApiError("この案件は別の操作で更新されています。最新情報を再読み込みしてください。");
      return;
    }
    setApiError(errorMessage(error));
  }

  async function saveCurrent(showSuccess = true): Promise<string | null> {
    setPending(true);
    setApiError(null);
    setErrors({});
    try {
      const response = await apiRequest<ApiDetailResponse<{ updatedAt: string }>>(
        `/api/project-intakes/${intake.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ updatedAt, ...toBusinessPayload(form) }),
        },
      );
      setUpdatedAt(response.data.updatedAt);
      if (showSuccess) setToast("保存しました。");
      return response.data.updatedAt;
    } catch (error) {
      handleFailure(error);
      return null;
    } finally {
      setPending(false);
    }
  }

  async function createProject() {
    if (!form.projectName.trim()) {
      setErrors({ projectName: "案件名を入力してください。" });
      setDialog(null);
      projectNameRef.current?.focus();
      return;
    }
    const savedAt = await saveCurrent(false);
    if (!savedAt) return;
    setPending(true);
    try {
      const response = await apiRequest<ApiDetailResponse<{ id: string }>>(
        `/api/project-intakes/${intake.id}/create-project`,
        { method: "POST", body: JSON.stringify({ updatedAt: savedAt, projectStatus: "OPEN" }) },
      );
      router.push(`/projects/${response.data.id}`);
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  async function searchProjects() {
    setPending(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({ q: projectQuery, pageSize: "20", sort: "updatedAt:desc" });
      const response = await apiRequest<ApiListResponse<ProjectSearchItem>>(`/api/projects?${params}`);
      setProjectResults(response.data);
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  async function mergeProject() {
    if (!selectedProject) {
      setApiError("統合先の案件を選択してください。");
      return;
    }
    const savedAt = await saveCurrent(false);
    if (!savedAt) return;
    setPending(true);
    try {
      await apiRequest(`/api/project-intakes/${intake.id}/merge`, {
        method: "POST",
        body: JSON.stringify({
          updatedAt: savedAt,
          targetProjectId: selectedProject.id,
          targetProjectUpdatedAt: selectedProject.updatedAt,
          applyFields,
        }),
      });
      router.push(`/projects/${selectedProject.id}`);
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  async function rejectIntake() {
    setPending(true);
    setApiError(null);
    try {
      await apiRequest(`/api/project-intakes/${intake.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ updatedAt }),
      });
      const next = await apiRequest<ApiListResponse<{ id: string }>>(
        "/api/project-intakes?reviewStatus=PENDING&pageSize=1&sort=receivedAt%3Adesc",
      );
      router.push(next.data[0] ? `/project-intakes/${next.data[0].id}` : "/project-intakes");
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  function openMerge() {
    setSelectedProject(null);
    setApplyFields([]);
    setProjectResults([]);
    setProjectQuery("");
    setDialog("merge");
  }

  const nameMissing = !form.projectName.trim();
  return (
    <div className="mx-auto max-w-[110rem] space-y-6">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-blue-700">SCR-003</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">案件確認</h1>
          <p className="mt-2 font-mono text-xs text-slate-500">{intake.receptionId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {intake.warningCodes.map((code) => (
            <Badge key={code} tone="amber">⚠ {warningLabels[code] ?? code}</Badge>
          ))}
          <Badge tone={intake.reviewStatus === "PENDING" ? "blue" : "slate"}>{intake.reviewStatus}</Badge>
        </div>
      </div>

      {apiError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{apiError}</p>
          {conflict ? (
            <Button className="mt-3" type="button" variant="secondary" onClick={() => window.location.reload()}>
              最新情報を再読み込み
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">受信日時: {formatJstDateTime(intake.receivedAt)}</p>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={showAi} onChange={(event) => setShowAi(event.target.checked)} />
              AI初期値を表示
            </label>
          </div>
          <BusinessFieldsForm
            value={form}
            onChange={setForm}
            readOnly={!canEdit}
            errors={errors}
            aiSnapshot={intake.aiSnapshot}
            showAi={showAi}
            projectNameRef={projectNameRef}
          />
        </section>

        <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">LINE原文</h2>
          <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-2 text-sm">
            <dt className="text-slate-500">送信元</dt><dd>{displayValue(intake.source?.sourceCompany)}</dd>
            <dt className="text-slate-500">担当者</dt><dd>{displayValue(intake.source?.sourceContact)}</dd>
            <dt className="text-slate-500">受信日時</dt><dd>{formatJstDateTime(intake.source?.receivedAt)}</dd>
          </dl>
          <div className="mt-5">
            {intake.source ? <RawTextView text={intake.source.rawText} /> : <p className="text-sm text-slate-500">原文がありません。</p>}
          </div>
        </aside>
      </div>

      {canEdit ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <Button type="button" disabled={pending} onClick={() => void saveCurrent()}>{pending ? "処理中..." : "保存"}</Button>
          <Button
            ref={createButtonRef}
            type="button"
            variant="secondary"
            disabled={pending}
            aria-disabled={nameMissing || pending}
            className={nameMissing ? "opacity-50" : ""}
            onClick={() => {
              if (nameMissing) {
                setErrors({ projectName: "案件名を入力してください。" });
                projectNameRef.current?.focus();
                return;
              }
              setDialog("create");
            }}
          >
            正式案件として登録
          </Button>
          <Button ref={mergeButtonRef} type="button" variant="secondary" disabled={pending} onClick={openMerge}>既存案件へ統合</Button>
          <Button ref={rejectButtonRef} type="button" variant="danger" disabled={pending} onClick={() => setDialog("reject")}>対象外にする</Button>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">閲覧モードです。更新操作はできません。</p>
      )}

      <Modal open={dialog === "create"} title="正式案件として登録" onClose={() => setDialog(null)} returnFocusRef={createButtonRef}>
        <p className="text-sm leading-6 text-slate-700">この内容で正式案件を登録します。<br />登録後、この確認待ち案件は編集できません。</p>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>キャンセル</Button><Button type="button" disabled={pending} onClick={() => void createProject()}>登録する</Button></div>
      </Modal>

      <Modal open={dialog === "reject"} title="対象外にする" onClose={() => setDialog(null)} returnFocusRef={rejectButtonRef}>
        <p className="text-sm text-slate-700">この確認待ち案件を対象外にします。</p>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>キャンセル</Button><Button type="button" variant="danger" disabled={pending} onClick={() => void rejectIntake()}>対象外にする</Button></div>
      </Modal>

      <Modal open={dialog === "merge"} title="既存案件へ統合" onClose={() => setDialog(null)} returnFocusRef={mergeButtonRef}>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Input id="project-search" label="既存案件を検索" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} /></div>
          <Button type="button" disabled={pending} onClick={() => void searchProjects()}>検索</Button>
        </div>
        <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
          {projectResults.map((project) => (
            <label key={project.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${project.projectStatus === "ARCHIVED" ? "cursor-not-allowed bg-slate-100 opacity-60" : "border-slate-200"}`}>
              <input type="radio" name="target-project" disabled={project.projectStatus === "ARCHIVED"} checked={selectedProject?.id === project.id} onChange={() => setSelectedProject(project)} />
              <span><span className="block text-sm font-semibold">{project.projectCode} {project.projectName}</span><span className="text-xs text-slate-500">{project.projectStatus}</span></span>
            </label>
          ))}
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-slate-800">反映する項目（初期状態は未選択）</legend>
          <p className="mt-1 text-xs text-slate-500">原文は選択にかかわらず関連付けられます。</p>
          <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
            {mergeableBusinessFields.map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applyFields.includes(field)} onChange={(event) => setApplyFields(event.target.checked ? [...applyFields, field] : applyFields.filter((item) => item !== field))} />{businessFieldLabels[field]}</label>
            ))}
          </div>
        </fieldset>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>キャンセル</Button><Button type="button" disabled={pending || !selectedProject} onClick={() => void mergeProject()}>統合する</Button></div>
      </Modal>
    </div>
  );
}
