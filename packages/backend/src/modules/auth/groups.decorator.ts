import { SetMetadata } from "@nestjs/common";

export const GROUPS_KEY = "groups";
export const Groups = (...groups: string[]) => SetMetadata(GROUPS_KEY, groups);
