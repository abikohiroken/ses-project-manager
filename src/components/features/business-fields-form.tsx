"use client";

import type { ReactNode, RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { isAiValueChanged } from "@/lib/ui/ai-diff";
import {
  businessFieldLabels,
  toBusinessPayload,
  type BusinessFormState,
  type MergeableBusinessField,
} from "@/lib/ui/business-fields";

function aiDisplay(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join("、") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function BusinessFieldsForm({
  value,
  onChange,
  readOnly,
  errors = {},
  aiSnapshot,
  showAi = false,
  projectNameRef,
}: {
  value: BusinessFormState;
  onChange: (value: BusinessFormState) => void;
  readOnly: boolean;
  errors?: Record<string, string>;
  aiSnapshot?: Record<string, unknown>;
  showAi?: boolean;
  projectNameRef?: RefObject<HTMLInputElement | null>;
}) {
  const comparison = toBusinessPayload(value);

  function set<K extends keyof BusinessFormState>(field: K, next: BusinessFormState[K]) {
    onChange({ ...value, [field]: next });
  }

  function field(fieldName: MergeableBusinessField, control: ReactNode) {
    const changed = aiSnapshot
      ? isAiValueChanged(aiSnapshot, fieldName, comparison[fieldName])
      : false;
    return (
      <div>
        {control}
        {changed ? (
          <div className="mt-1">
            <Badge tone="amber">AI値から修正済み</Badge>
          </div>
        ) : null}
        {showAi && aiSnapshot ? (
          <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            AI初期値: {aiDisplay(aiSnapshot[fieldName])}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="basic-fields-heading">
        <h2 id="basic-fields-heading" className="mb-4 text-lg font-bold text-slate-900">
          基本情報
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            {field(
              "projectName",
              <Input
                ref={projectNameRef}
                id="projectName"
                label={businessFieldLabels.projectName}
                value={value.projectName}
                readOnly={readOnly}
                error={errors.projectName}
                onChange={(event) => set("projectName", event.target.value)}
              />,
            )}
          </div>
          <div className="sm:col-span-2">
            {field(
              "projectSummary",
              <Textarea
                id="projectSummary"
                label={businessFieldLabels.projectSummary}
                value={value.projectSummary}
                readOnly={readOnly}
                error={errors.projectSummary}
                onChange={(event) => set("projectSummary", event.target.value)}
              />,
            )}
          </div>
          {field(
            "requiredSkills",
            <TagInput
              id="requiredSkills"
              label={businessFieldLabels.requiredSkills}
              value={value.requiredSkills}
              readOnly={readOnly}
              onChange={(next) => set("requiredSkills", next)}
            />,
          )}
          {field(
            "preferredSkills",
            <TagInput
              id="preferredSkills"
              label={businessFieldLabels.preferredSkills}
              value={value.preferredSkills}
              readOnly={readOnly}
              onChange={(next) => set("preferredSkills", next)}
            />,
          )}
          {field(
            "role",
            <Input id="role" label={businessFieldLabels.role} value={value.role} readOnly={readOnly} error={errors.role} onChange={(event) => set("role", event.target.value)} />,
          )}
          {field(
            "process",
            <Input id="process" label={businessFieldLabels.process} value={value.process} readOnly={readOnly} error={errors.process} onChange={(event) => set("process", event.target.value)} />,
          )}
        </div>
      </section>

      <section aria-labelledby="price-fields-heading">
        <h2 id="price-fields-heading" className="mb-4 text-lg font-bold text-slate-900">
          単価・期間
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field(
            "unitPriceMinMan",
            <Input id="unitPriceMinMan" label={businessFieldLabels.unitPriceMinMan} type="number" min="0" step="1" value={value.unitPriceMinMan} readOnly={readOnly} error={errors.unitPriceMinMan} onChange={(event) => set("unitPriceMinMan", event.target.value)} />,
          )}
          {field(
            "unitPriceMaxMan",
            <Input id="unitPriceMaxMan" label={businessFieldLabels.unitPriceMaxMan} type="number" min="0" step="1" value={value.unitPriceMaxMan} readOnly={readOnly} error={errors.unitPriceMaxMan} onChange={(event) => set("unitPriceMaxMan", event.target.value)} />,
          )}
          {field(
            "settlementRange",
            <Input id="settlementRange" label={businessFieldLabels.settlementRange} maxLength={100} value={value.settlementRange} readOnly={readOnly} error={errors.settlementRange} onChange={(event) => set("settlementRange", event.target.value)} />,
          )}
          {field(
            "startMonth",
            <Input id="startMonth" label={businessFieldLabels.startMonth} type="month" value={value.startMonth} readOnly={readOnly} error={errors.startMonth} onChange={(event) => set("startMonth", event.target.value)} />,
          )}
          {field(
            "endMonth",
            <Input id="endMonth" label={businessFieldLabels.endMonth} type="month" min={value.startMonth || undefined} value={value.endMonth} readOnly={readOnly} error={errors.endMonth} onChange={(event) => set("endMonth", event.target.value)} />,
          )}
          {field(
            "workDaysPerWeek",
            <Input id="workDaysPerWeek" label={businessFieldLabels.workDaysPerWeek} type="number" min="1" max="7" step="1" value={value.workDaysPerWeek} readOnly={readOnly} error={errors.workDaysPerWeek} onChange={(event) => set("workDaysPerWeek", event.target.value)} />,
          )}
        </div>
      </section>

      <section aria-labelledby="work-fields-heading">
        <h2 id="work-fields-heading" className="mb-4 text-lg font-bold text-slate-900">
          勤務条件
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "location",
            <Input id="location" label={businessFieldLabels.location} value={value.location} readOnly={readOnly} error={errors.location} onChange={(event) => set("location", event.target.value)} />,
          )}
          {field(
            "nearestStation",
            <Input id="nearestStation" label={businessFieldLabels.nearestStation} value={value.nearestStation} readOnly={readOnly} error={errors.nearestStation} onChange={(event) => set("nearestStation", event.target.value)} />,
          )}
          {field(
            "remoteStyle",
            <Select id="remoteStyle" label={businessFieldLabels.remoteStyle} value={value.remoteStyle} disabled={readOnly} error={errors.remoteStyle} onChange={(event) => set("remoteStyle", event.target.value)}>
              <option value="">未設定</option>
              <option value="full">フルリモート</option>
              <option value="hybrid">ハイブリッド</option>
              <option value="onsite">常駐</option>
              <option value="unknown">不明</option>
            </Select>,
          )}
          <div className="sm:col-span-2">
            {field(
              "remoteNote",
              <Textarea id="remoteNote" label={businessFieldLabels.remoteNote} value={value.remoteNote} readOnly={readOnly} error={errors.remoteNote} onChange={(event) => set("remoteNote", event.target.value)} />,
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="other-fields-heading">
        <h2 id="other-fields-heading" className="mb-4 text-lg font-bold text-slate-900">
          その他条件
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "recruitmentCount",
            <Input id="recruitmentCount" label={businessFieldLabels.recruitmentCount} type="number" min="1" step="1" value={value.recruitmentCount} readOnly={readOnly} error={errors.recruitmentCount} onChange={(event) => set("recruitmentCount", event.target.value)} />,
          )}
          {field(
            "interviewCount",
            <Input id="interviewCount" label={businessFieldLabels.interviewCount} type="number" min="0" step="1" value={value.interviewCount} readOnly={readOnly} error={errors.interviewCount} onChange={(event) => set("interviewCount", event.target.value)} />,
          )}
          <div className="sm:col-span-2">
            {field(
              "commercialFlow",
              <Textarea id="commercialFlow" label={businessFieldLabels.commercialFlow} value={value.commercialFlow} readOnly={readOnly} error={errors.commercialFlow} onChange={(event) => set("commercialFlow", event.target.value)} />,
            )}
          </div>
          {field(
            "foreignerAllowed",
            <Select id="foreignerAllowed" label={businessFieldLabels.foreignerAllowed} value={value.foreignerAllowed} disabled={readOnly} error={errors.foreignerAllowed} onChange={(event) => set("foreignerAllowed", event.target.value)}>
              <option value="">未設定</option>
              <option value="allowed">可</option>
              <option value="not_allowed">不可</option>
              <option value="conditional">条件付き</option>
              <option value="unknown">不明</option>
            </Select>,
          )}
          {field(
            "ageLimit",
            <Input id="ageLimit" label={businessFieldLabels.ageLimit} value={value.ageLimit} readOnly={readOnly} error={errors.ageLimit} onChange={(event) => set("ageLimit", event.target.value)} />,
          )}
          <div className="sm:col-span-2">
            {field(
              "nationalityNote",
              <Textarea id="nationalityNote" label={businessFieldLabels.nationalityNote} value={value.nationalityNote} readOnly={readOnly} error={errors.nationalityNote} onChange={(event) => set("nationalityNote", event.target.value)} />,
            )}
          </div>
          <div className="sm:col-span-2">
            {field(
              "employmentCondition",
              <Textarea id="employmentCondition" label={businessFieldLabels.employmentCondition} value={value.employmentCondition} readOnly={readOnly} error={errors.employmentCondition} onChange={(event) => set("employmentCondition", event.target.value)} />,
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
