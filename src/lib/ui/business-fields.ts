export type BusinessValues = {
  projectName: string | null;
  projectSummary: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  role: string | null;
  process: string | null;
  unitPriceMinMan: number | null;
  unitPriceMaxMan: number | null;
  settlementRange: string | null;
  startMonth: string | null;
  endMonth: string | null;
  workDaysPerWeek: number | null;
  location: string | null;
  nearestStation: string | null;
  remoteStyle: string | null;
  remoteNote: string | null;
  recruitmentCount: number | null;
  commercialFlow: string | null;
  interviewCount: number | null;
  foreignerAllowed: string | null;
  ageLimit: string | null;
  nationalityNote: string | null;
  employmentCondition: string | null;
};

export type BusinessFormState = Omit<
  BusinessValues,
  | "unitPriceMinMan"
  | "unitPriceMaxMan"
  | "workDaysPerWeek"
  | "recruitmentCount"
  | "interviewCount"
> & {
  projectName: string;
  projectSummary: string;
  role: string;
  process: string;
  unitPriceMinMan: string;
  unitPriceMaxMan: string;
  settlementRange: string;
  startMonth: string;
  endMonth: string;
  workDaysPerWeek: string;
  location: string;
  nearestStation: string;
  remoteStyle: string;
  remoteNote: string;
  recruitmentCount: string;
  commercialFlow: string;
  interviewCount: string;
  foreignerAllowed: string;
  ageLimit: string;
  nationalityNote: string;
  employmentCondition: string;
};

export const mergeableBusinessFields = [
  "projectName",
  "projectSummary",
  "requiredSkills",
  "preferredSkills",
  "role",
  "process",
  "unitPriceMinMan",
  "unitPriceMaxMan",
  "settlementRange",
  "startMonth",
  "endMonth",
  "workDaysPerWeek",
  "location",
  "nearestStation",
  "remoteStyle",
  "remoteNote",
  "recruitmentCount",
  "commercialFlow",
  "interviewCount",
  "foreignerAllowed",
  "ageLimit",
  "nationalityNote",
  "employmentCondition",
] as const;

export type MergeableBusinessField = (typeof mergeableBusinessFields)[number];

export const businessFieldLabels: Record<MergeableBusinessField, string> = {
  projectName: "案件名",
  projectSummary: "案件概要",
  requiredSkills: "必須スキル",
  preferredSkills: "尚可スキル",
  role: "ロール",
  process: "工程",
  unitPriceMinMan: "単価下限",
  unitPriceMaxMan: "単価上限",
  settlementRange: "精算幅",
  startMonth: "開始月",
  endMonth: "終了月",
  workDaysPerWeek: "週稼働日数",
  location: "勤務地",
  nearestStation: "最寄駅",
  remoteStyle: "勤務形態",
  remoteNote: "勤務形態補足",
  recruitmentCount: "募集人数",
  commercialFlow: "商流",
  interviewCount: "面談回数",
  foreignerAllowed: "外国籍可否",
  ageLimit: "年齢条件",
  nationalityNote: "国籍条件",
  employmentCondition: "所属条件",
};

function formText(value: string | null): string {
  return value ?? "";
}

function formNumber(value: number | null): string {
  return value == null ? "" : String(value);
}

function nullableText(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function nullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

export function toBusinessFormState(value: BusinessValues): BusinessFormState {
  return {
    projectName: formText(value.projectName),
    projectSummary: formText(value.projectSummary),
    requiredSkills: value.requiredSkills,
    preferredSkills: value.preferredSkills,
    role: formText(value.role),
    process: formText(value.process),
    unitPriceMinMan: formNumber(value.unitPriceMinMan),
    unitPriceMaxMan: formNumber(value.unitPriceMaxMan),
    settlementRange: formText(value.settlementRange),
    startMonth: formText(value.startMonth),
    endMonth: formText(value.endMonth),
    workDaysPerWeek: formNumber(value.workDaysPerWeek),
    location: formText(value.location),
    nearestStation: formText(value.nearestStation),
    remoteStyle: formText(value.remoteStyle),
    remoteNote: formText(value.remoteNote),
    recruitmentCount: formNumber(value.recruitmentCount),
    commercialFlow: formText(value.commercialFlow),
    interviewCount: formNumber(value.interviewCount),
    foreignerAllowed: formText(value.foreignerAllowed),
    ageLimit: formText(value.ageLimit),
    nationalityNote: formText(value.nationalityNote),
    employmentCondition: formText(value.employmentCondition),
  };
}

export function toBusinessPayload(value: BusinessFormState): BusinessValues {
  return {
    projectName: nullableText(value.projectName),
    projectSummary: nullableText(value.projectSummary),
    requiredSkills: value.requiredSkills,
    preferredSkills: value.preferredSkills,
    role: nullableText(value.role),
    process: nullableText(value.process),
    unitPriceMinMan: nullableNumber(value.unitPriceMinMan),
    unitPriceMaxMan: nullableNumber(value.unitPriceMaxMan),
    settlementRange: nullableText(value.settlementRange),
    startMonth: nullableText(value.startMonth),
    endMonth: nullableText(value.endMonth),
    workDaysPerWeek: nullableNumber(value.workDaysPerWeek),
    location: nullableText(value.location),
    nearestStation: nullableText(value.nearestStation),
    remoteStyle: nullableText(value.remoteStyle),
    remoteNote: nullableText(value.remoteNote),
    recruitmentCount: nullableNumber(value.recruitmentCount),
    commercialFlow: nullableText(value.commercialFlow),
    interviewCount: nullableNumber(value.interviewCount),
    foreignerAllowed: nullableText(value.foreignerAllowed),
    ageLimit: nullableText(value.ageLimit),
    nationalityNote: nullableText(value.nationalityNote),
    employmentCondition: nullableText(value.employmentCondition),
  };
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
