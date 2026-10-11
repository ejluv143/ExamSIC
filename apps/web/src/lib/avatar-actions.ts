"use server";

import { getMyAvatar, saveAvatar } from "@/lib/data/avatar";

// What the avatar editor calls. Each one re-checks the role on the server.
export const getMyAvatarAction = getMyAvatar;
export const saveAvatarAction = saveAvatar;
