"use client";

import { useRef, useState } from "react";

import { BusinessFieldsForm } from "@/components/features/business-fields-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { apiRequest, ApiRequestError, errorMessage, fieldErrors } from "@/lib/api/client";
import { toBusinessFormState, toBusinessPayload } from "@/lib/ui/business-fields";
import { projectStatusLabels, projectStatusTone } from "@/lib/ui/labels";
import type { ApiDetailResponse, PendingProjectAction, ProjectEditorView } from "@/lib/ui/models";
import { projectActionsForStatus, type UiProjectStatus } from "@/lib/ui/project-actions";

export function ProjectEditor({ project, canEdit }: { project: ProjectEditorView; canEdit: boolean }) {
  const [form, setForm] = useState(() => toBusinessFormState(project));
  const [savedForm, setSavedForm] = useState(() => toBusinessFormState(project));
  const [updatedAt, setUpdatedAt] = useState(project.updatedAt);
  const [status, setStatus] = useState<UiProjectStatus>(project.projectStatus);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<PendingProjectAction | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);

  function handleFailure(error: unknown) {
    setErrors(fieldErrors(error));
    if (error instanceof ApiRequestError && error.status === 409) {
      setConflict(true);
      setApiError("この案件は別の操作で更新されています。最新情報を再読み込みしてください。");
    } else {
      setApiError(errorMessage(error));
    }
  }

  async function save() {
    const payload = toBusinessPayload(form);
    if (!form.projectName.trim()) {
      setErrors({ projectName: "案件名を入力してください。" });
      projectNameRef.current?.focus();
      return;
    }
    setPending(true);
    setApiError(null);
    setErrors({});
    try {
      const response = await apiRequest<ApiDetailResponse<{ updatedAt: string }>>(
        `/api/projects/${project.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...payload, projectName: form.projectName.trim(), updatedAt }),
        },
      );
      setUpdatedAt(response.data.updatedAt);
      setSavedForm(form);
      setEditing(false);
      setToast("保存しました。");
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  async function runAction() {
    if (!action) return;
    setPending(true);
    setApiError(null);
    try {
      const response = await apiRequest<ApiDetailResponse<{ updatedAt: string; projectStatus: UiProjectStatus }>>(
        `/api/projects/${project.id}/${action.action}`,
        { method: "POST", body: JSON.stringify({ updatedAt }) },
      );
      setUpdatedAt(response.data.updatedAt);
      setStatus(response.data.projectStatus);
      setAction(null);
      setToast(`${action.label}に変更しました。`);
    } catch (error) {
      handleFailure(error);
    } finally {
      setPending(false);
    }
  }

  const availableActions = projectActionsForStatus(status);
  return (
    <section className="space-y-6">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold text-blue-700">SCR-005</p><h1 className="mt-1 text-2xl font-bold text-slate-950">正式案件詳細・編集</h1><p className="mt-2 font-mono text-xs text-slate-500">{project.projectCode}</p></div>
        <Badge tone={projectStatusTone(status)}>{projectStatusLabels[status]}</Badge>
      </div>

      {apiError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{apiError}</p>{conflict ? <Button className="mt-3" type="button" variant="secondary" onClick={() => window.location.reload()}>最新情報を再読み込み</Button> : null}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-6 flex flex-wrap justify-end gap-2">
          {canEdit && !editing ? <Button type="button" onClick={() => setEditing(true)}>編集</Button> : null}
          {canEdit && editing ? <><Button type="button" disabled={pending} onClick={() => void save()}>{pending ? "処理中..." : "保存"}</Button><Button type="button" variant="secondary" disabled={pending} onClick={() => { setForm(savedForm); setErrors({}); setApiError(null); setEditing(false); }}>キャンセル</Button></> : null}
        </div>
        <BusinessFieldsForm value={form} onChange={setForm} readOnly={!editing} errors={errors} projectNameRef={projectNameRef} />
      </div>

      {canEdit && availableActions.length > 0 ? (
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          {availableActions.map((option) => <Button key={option.action} type="button" variant={option.action === "archive" ? "danger" : "secondary"} onClick={(event) => { actionButtonRef.current = event.currentTarget; setAction(option); }}>{option.label}</Button>)}
        </div>
      ) : null}

      <Modal open={Boolean(action)} title="状態を変更" onClose={() => setAction(null)} returnFocusRef={actionButtonRef}>
        <p className="text-sm text-slate-700">この案件を「{action?.label}」へ変更します。</p>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAction(null)}>キャンセル</Button><Button type="button" variant={action?.action === "archive" ? "danger" : "primary"} disabled={pending} onClick={() => void runAction()}>変更する</Button></div>
      </Modal>
    </section>
  );
}
