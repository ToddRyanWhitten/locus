import { Circle, CircleMessage, Tag, TagMediaItem, UserBrief } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

let authToken: string | null = localStorage.getItem("locus_token");

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("locus_token", token);
  } else {
    localStorage.removeItem("locus_token");
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return {} as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.detail || `API Error (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    apiRequest<{ user: UserBrief; access: string; refresh: string }>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMe: () => apiRequest<UserBrief>("/auth/me/"),

  getCircles: () => apiRequest<Circle[]>("/circles/"),

  createCircle: (name: string, description: string) =>
    apiRequest<Circle>("/circles/", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    }),

  joinCircle: (invite_code: string) =>
    apiRequest<Circle>("/circles/join/", {
      method: "POST",
      body: JSON.stringify({ invite_code }),
    }),

  getCircleMessages: (circleId: string) =>
    apiRequest<CircleMessage[]>(`/circles/${circleId}/messages/`),

  postCircleMessage: (circleId: string, text: string, tagId?: string | null) =>
    apiRequest<CircleMessage>(`/circles/${circleId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ text, tag_id: tagId || null }),
    }),

  getTags: (params?: { circleId?: string; lat?: number; lng?: number }) => {
    const query = new URLSearchParams();
    if (params?.circleId) query.set("circle_id", params.circleId);
    if (params?.lat !== undefined) query.set("lat", String(params.lat));
    if (params?.lng !== undefined) query.set("lng", String(params.lng));
    const qs = query.toString() ? `?${query.toString()}` : "";
    return apiRequest<Tag[]>(`/tags/${qs}`);
  },

  createTag: (payload: Partial<Tag>) =>
    apiRequest<Tag>("/tags/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTag: (tagId: string, payload: Partial<Tag>) =>
    apiRequest<Tag>(`/tags/${tagId}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteTag: (tagId: string) =>
    apiRequest<void>(`/tags/${tagId}/`, {
      method: "DELETE",
    }),

  uploadTagMedia: (
    tagId: string,
    file: File,
    caption: string,
    mediaType?: "IMAGE" | "AUDIO" | "VIDEO"
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("caption", caption);
    if (mediaType) form.append("media_type", mediaType);
    return apiRequest<TagMediaItem>(`/tags/${tagId}/upload_media/`, {
      method: "POST",
      body: form,
    });
  },

  deleteTagMedia: (tagId: string, mediaId: string) =>
    apiRequest<void>(`/tags/${tagId}/media/${mediaId}/`, {
      method: "DELETE",
    }),

  unlockTagWithGps: (tagId: string, latitude: number, longitude: number) =>
    apiRequest<{
      unlocked: boolean;
      newly_unlocked: boolean;
      distance_meters: number;
      tag: Tag;
    }>(`/tags/${tagId}/unlock/`, {
      method: "POST",
      body: JSON.stringify({ latitude, longitude }),
    }),
};
