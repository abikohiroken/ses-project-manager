"use client";

import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Table, TableContainer, Td, Th } from "@/components/ui/table";
import { Toast } from "@/components/ui/toast";
import { apiRequest, ApiRequestError, errorMessage, fieldErrors } from "@/lib/api/client";
import { formatJstDateTime } from "@/lib/format/display";
import { roleLabels } from "@/lib/ui/labels";
import type { ApiDetailResponse, UserView } from "@/lib/ui/models";

type Role = UserView["role"];

export function UserManager({ initialUsers }: { initialUsers: UserView[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("OPERATOR");
  const [editing, setEditing] = useState<UserView | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Role>("OPERATOR");
  const [editActive, setEditActive] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  function handleFailure(cause: unknown) {
    setErrors(fieldErrors(cause));
    if (cause instanceof ApiRequestError && cause.status === 409) {
      setError(cause.message || "最後の有効な管理者は降格・無効化できません。");
    } else {
      setError(errorMessage(cause));
    }
  }

  async function createUser() {
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const response = await apiRequest<ApiDetailResponse<UserView>>("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, name, role }),
      });
      setUsers((current) => [...current, response.data].sort((left, right) => left.email.localeCompare(right.email)));
      setEmail(""); setName(""); setRole("OPERATOR");
      setToast("ユーザーを登録しました。");
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setPending(false);
    }
  }

  function openEdit(user: UserView, button: HTMLButtonElement) {
    editButtonRef.current = button;
    setEditing(user);
    setEditName(user.name);
    setEditRole(user.role);
    setEditActive(user.isActive);
    setError(null);
    setErrors({});
  }

  async function updateUser() {
    if (!editing) return;
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const response = await apiRequest<ApiDetailResponse<UserView>>(`/api/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editName, role: editRole, isActive: editActive, updatedAt: editing.updatedAt }),
      });
      setUsers((current) => current.map((user) => user.id === editing.id ? response.data : user));
      setEditing(null);
      setToast("ユーザーを更新しました。");
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Toast message={toast} onDismiss={() => setToast(null)} />
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p> : null}
      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="new-user-heading">
        <h2 id="new-user-heading" className="text-lg font-bold text-slate-900">新規登録</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_auto]">
          <Input id="new-user-email" label="メール" type="email" value={email} error={errors.email} onChange={(event) => setEmail(event.target.value)} />
          <Input id="new-user-name" label="名前" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
          <Select id="new-user-role" label="ロール" value={role} error={errors.role} onChange={(event) => setRole(event.target.value as Role)}><option value="ADMIN">管理者</option><option value="OPERATOR">担当者</option><option value="VIEWER">閲覧者</option></Select>
          <div className="flex items-end"><Button type="button" disabled={pending} onClick={() => void createUser()}>{pending ? "処理中..." : "登録"}</Button></div>
        </div>
      </section>

      {users.length === 0 ? <EmptyState message="ユーザーが登録されていません。" /> : (
        <TableContainer><Table><thead><tr><Th>名前</Th><Th>メール</Th><Th>ロール</Th><Th>有効</Th><Th>最終ログイン</Th><Th>更新日時</Th><Th>操作</Th></tr></thead><tbody className="divide-y divide-slate-100">{users.map((user) => <tr key={user.id}><Td className="font-medium">{user.name}</Td><Td>{user.email}</Td><Td><Badge tone={user.role === "ADMIN" ? "blue" : "slate"}>{roleLabels[user.role]}</Badge></Td><Td><Badge tone={user.isActive ? "green" : "red"}>{user.isActive ? "有効" : "無効"}</Badge></Td><Td className="whitespace-nowrap">{formatJstDateTime(user.lastLoginAt)}</Td><Td className="whitespace-nowrap">{formatJstDateTime(user.updatedAt)}</Td><Td><Button type="button" variant="secondary" onClick={(event) => openEdit(user, event.currentTarget)}>編集</Button></Td></tr>)}</tbody></Table></TableContainer>
      )}

      <Modal open={Boolean(editing)} title="ユーザーを編集" onClose={() => setEditing(null)} returnFocusRef={editButtonRef}>
        <div className="space-y-4">
          <Input id="edit-user-name" label="名前" value={editName} error={errors.name} onChange={(event) => setEditName(event.target.value)} />
          <Select id="edit-user-role" label="ロール" value={editRole} error={errors.role} onChange={(event) => setEditRole(event.target.value as Role)}><option value="ADMIN">管理者</option><option value="OPERATOR">担当者</option><option value="VIEWER">閲覧者</option></Select>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />有効</label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button><Button type="button" disabled={pending} onClick={() => void updateUser()}>更新する</Button></div>
      </Modal>
    </div>
  );
}
