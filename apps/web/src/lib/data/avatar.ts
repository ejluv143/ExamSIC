// A player's own avatar (students and guests).
import "server-only";
import type { Avatar } from "@examinus/contract";
import { requirePermission } from "../auth/dal";
import { read, write } from "./api";

export async function getMyAvatar() {
  await requirePermission({ avatar: ["update"] });
  return read((api) => api["avatar.mine"]());
}

export async function saveAvatar(avatar: Avatar) {
  await requirePermission({ avatar: ["update"] });
  return write((api) => api["avatar.save"]({ avatar }));
}
