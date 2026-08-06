export type UiRole = "ADMIN" | "OPERATOR" | "VIEWER";

export type UiCapabilities = {
  canEditProjects: boolean;
  canManageUsers: boolean;
};

export function capabilitiesForRole(role: UiRole): UiCapabilities {
  return {
    canEditProjects: role === "ADMIN" || role === "OPERATOR",
    canManageUsers: role === "ADMIN",
  };
}
