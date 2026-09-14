export const roles = ["supervisor", "watcher", "lead", "peer"] as const;
export type Role = (typeof roles)[number];
export const peerSubroles = ["engineer", "scout", "architect", "reviewer"] as const;
export type PeerSubrole = (typeof peerSubroles)[number];

export const attentionWatchLabel = "slp.attention";
export const attentionWatchValue = "workspace";
export const watcherSupervisorLabel = "slp.watcher.supervisor";
export const watcherScopeLabel = "slp.watcher.workspace";
export const watcherCadenceLabel = "slp.watcher.cadence-minutes";
export const watcherSweepPromptPrefix = "SLP Watcher scheduled sweep — machine route.";
export const watcherTriggerPromptPrefix = "SLP Watcher trigger —";
export const watcherRepairPromptPrefix = "SLP Watcher format repair — machine route.";
export const recoveryLeaseLabel = "slp.recovery";
export const recoveryLeaseValue = "lead";
export const notebookWriterLabel = "slp.notebook";
export const notebookWriterValue = "writer";

export function roleLabel(role: Role | PeerSubrole): string {
  return role[0].toUpperCase() + role.slice(1);
}

function profileTags(notes?: string): string[] {
  const header = notes?.trim().split(/\r?\n/, 1)[0] ?? "";
  const tags = header.split(/\s+/);
  const allowed = new Set([
    ...roles.map((role) => `[slp:${role}]`),
    ...peerSubroles.map((role) => `[slp:peer:${role}]`),
  ]);
  return tags.every((tag) => allowed.has(tag)) ? tags : [];
}

export function stripProfileTags(notes?: string): string {
  const text = notes?.trim() ?? "";
  return profileTags(text).length ? text.split(/\r?\n/).slice(1).join("\n").trim() : text;
}

export function getProfileRoles(notes?: string): Role[] {
  const tags = profileTags(notes);
  return roles.filter((role) =>
    tags.some(
      (tag) => tag === `[slp:${role}]` || (role === "peer" && tag.startsWith("[slp:peer:")),
    ),
  );
}

export function getProfilePeerSubroles(notes?: string): PeerSubrole[] {
  const tags = profileTags(notes);
  // Existing generic Peer profiles remain available to all four specializations.
  if (tags.includes("[slp:peer]")) return [...peerSubroles];
  return peerSubroles.filter((role) => tags.includes(`[slp:peer:${role}]`));
}

export function setProfileRoles(notes: string | undefined, selected: readonly Role[]): string {
  const peerTags = profileTags(notes).filter((tag) => tag.startsWith("[slp:peer:"));
  const tags = roles.flatMap((role) => {
    if (!selected.includes(role)) return [];
    return role === "peer" && peerTags.length ? peerTags : [`[slp:${role}]`];
  });
  return [tags.join(" "), stripProfileTags(notes)].filter(Boolean).join("\n");
}

export function setProfileMembership(
  notes: string | undefined,
  role: Role,
  enabled: boolean,
  subrole?: PeerSubrole,
): string {
  if (role !== "peer" || !subrole) {
    const selected = getProfileRoles(notes).filter((entry) => entry !== role);
    return setProfileRoles(notes, enabled ? [...selected, role] : selected);
  }
  const selected = getProfilePeerSubroles(notes).filter((entry) => entry !== subrole);
  if (enabled) selected.push(subrole);
  const tags = [
    ...getProfileRoles(notes)
      .filter((entry) => entry !== "peer")
      .map((entry) => `[slp:${entry}]`),
    ...peerSubroles
      .filter((entry) => selected.includes(entry))
      .map((entry) => `[slp:peer:${entry}]`),
  ];
  return [tags.join(" "), stripProfileTags(notes)].filter(Boolean).join("\n");
}
