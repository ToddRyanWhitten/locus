export interface UserBrief {
  id: number;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  storage_used_mb: number;
  storage_quota_mb: number;
}

export interface TagMediaItem {
  id: string;
  media_type: "IMAGE" | "AUDIO" | "VIDEO";
  file_url: string;
  caption: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  display_order: number;
  created_at: string;
}

export interface Tag {
  id: string;
  creator: UserBrief;
  circle_ids: string[];
  title: string;
  teaser_hint: string;
  address_label: string;
  latitude: number;
  longitude: number;
  unlock_radius_meters: number;
  visibility: "TEASER" | "HIDDEN";
  recorded_year: number | null;
  is_creator: boolean;
  is_unlocked: boolean;
  unlocked_at: string | null;
  distance_meters: number | null;
  can_unlock_now: boolean;
  media_summary: {
    total: number;
    images: number;
    audio: number;
    video: number;
  };
  story_text: string | null;
  media_items: TagMediaItem[];
  unlock_count: number;
  created_at: string;
  updated_at: string;
}

export interface Circle {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_by: UserBrief;
  tag_count: number;
  created_at: string;
}

export interface CircleMessage {
  id: string;
  circle: string;
  sender: UserBrief;
  tag: string | null;
  tag_title: string | null;
  text: string;
  is_system_event: boolean;
  created_at: string;
}
