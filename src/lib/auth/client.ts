"use client";
import { createAuthClient } from "@neon/auth/next";

// Fala com o proxy same-origin em /api/auth.
export const authClient = createAuthClient();
