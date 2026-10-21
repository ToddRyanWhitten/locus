import React, { useState } from "react";
import { api } from "../api";
import { Tag } from "../types";

interface TagDetailPanelProps {
  tag: Tag;
  onEdit: (tag: Tag) => void;
  onDeleted: (tagId: string) => void;
  onUnlocked: (updatedTag: Tag) => void;
}

export const TagDetailPanel: React.FC<TagDetailPanelProps> = ({
  tag,
  onEdit,
  onDeleted,
  onUnlocked,
}) => {
  const [simulatingWalk, setSimulatingWalk] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!window.confirm(`Delete tag "${tag.title}"?`)) return;
    await api.deleteTag(tag.id);
    onDeleted(tag.id);
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!window.confirm("Remove this media attachment?")) return;
    await api.deleteTagMedia(tag.id, mediaId);
    const refreshed = await api.getTags();
    const updated = refreshed.find((t) => t.id === tag.id);
    if (updated) onUnlocked(updated);
  };

  // Allows testing the mobile geofence unlock flow directly from your browser
  const handleSimulatePhysicalVisit = async () => {
    setSimulatingWalk(true);
    setStatusMsg(null);
    try {
      const res = await api.unlockTagWithGps(tag.id, tag.latitude, tag.longitude);
      setStatusMsg(
        `🎉 Geofence verified (${res.distance_meters}m from pin)! This memory is now permanently unlocked on Web & Mobile.`
      );
      onUnlocked(res.tag);
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setSimulatingWalk(false);
    }
  };

  return (
    <div className="card" style={{ borderLeft: `4px solid ${tag.is_unlocked ? "#10b981" : "#f59e0b"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <span
            className="badge"
            style={{
              background: tag.is_creator
                ? "#0284c7"
                : tag.is_unlocked
                ? "#10b981"
                : "#f59e0b",
            }}
          >
            {tag.is_creator
              ? "✍️ Created by You"
              : tag.is_unlocked
              ? "🔓 Visited & Permanently Unlocked"
              : `🔒 Locked Memory (${tag.unlock_radius_meters}m radius)`}
          </span>
          {tag.recorded_year && (
            <span className="badge" style={{ background: "#334155", marginLeft: 6 }}>
              📅 Year: {tag.recorded_year}
            </span>
          )}
          <h3 style={{ margin: "8px 0 4px 0", fontSize: "18px" }}>{tag.title}</h3>
          {tag.address_label && (
            <div style={{ fontSize: "12px", color: "#94a3b8" }}>📍 {tag.address_label}</div>
          )}
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
            Coordinates: {tag.latitude.toFixed(5)}, {tag.longitude.toFixed(5)} • Recorded by{" "}
            <strong>{tag.creator.display_name}</strong>
          </div>
        </div>

        {tag.is_creator && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button className="btn btn-secondary" onClick={() => onEdit(tag)}>
              ✏️ Edit
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              🗑️
            </button>
          </div>
        )}
      </div>

      {tag.teaser_hint && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "#1e293b",
            borderRadius: 6,
            fontSize: "13px",
            color: "#bae6fd",
          }}
        >
          🧭 <strong>Location Clue:</strong> {tag.teaser_hint}
        </div>
      )}

      {statusMsg && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "rgba(16, 185, 129, 0.18)",
            border: "1px solid #10b981",
            borderRadius: 6,
            fontSize: "12.5px",
            color: "#a7f3d0",
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* UNLOCKED PAYLOAD vs LOCKED SCAVENGER HUNT STATE */}
      {tag.is_unlocked ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              background: "#0f172a",
              padding: "14px",
              borderRadius: 8,
              border: "1px solid #334155",
              lineHeight: 1.65,
              fontSize: "14px",
              whiteSpace: "pre-wrap",
              color: "#f1f5f9",
            }}
          >
            {tag.story_text || "No text story attached."}
          </div>

          {tag.media_items.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#94a3b8" }}>
                🎞️ Attached Photos, Voice & Video ({tag.media_items.length})
              </h4>
              <div style={{ display: "grid", gap: "10px" }}>
                {tag.media_items.map((media) => (
                  <div
                    key={media.id}
                    style={{
                      background: "#0f172a",
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid #1e293b",
                    }}
                  >
                    {media.media_type === "IMAGE" && (
                      <img
                        src={media.file_url}
                        alt={media.caption || tag.title}
                        style={{
                          width: "100%",
                          maxHeight: 280,
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    )}
                    {media.media_type === "AUDIO" && (
                      <audio controls src={media.file_url} style={{ width: "100%" }} />
                    )}
                    {media.media_type === "VIDEO" && (
                      <video
                        controls
                        src={media.file_url}
                        style={{ width: "100%", maxHeight: 280, borderRadius: 6 }}
                      />
                    )}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 6,
                        fontSize: "12px",
                        color: "#cbd5e1",
                      }}
                    >
                      <span>{media.caption || media.media_type}</span>
                      {tag.is_creator && (
                        <button
                          onClick={() => handleDeleteMedia(media.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: "11px",
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            marginTop: 14,
            padding: "16px",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px dashed #f59e0b",
            borderRadius: 8,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "26px", marginBottom: 6 }}>🔒</div>
          <div style={{ fontWeight: 700, color: "#fde68a", fontSize: "14px" }}>
            Stand Where {tag.creator.display_name} Stood to Unlock This Memory
          </div>
          <p style={{ fontSize: "12.5px", color: "#cbd5e1", margin: "6px 0 12px 0" }}>
            Visit within <strong>{tag.unlock_radius_meters} meters</strong> of this location with the{" "}
            <strong>Locus Mobile App</strong> to unlock the story
            {tag.media_summary.total > 0 &&
              ` and ${tag.media_summary.total} media attachment(s) (${tag.media_summary.images} photo, ${tag.media_summary.audio} audio, ${tag.media_summary.video} video)`}
            . Once visited, it will remain unlocked here on the web forever!
          </p>
          <button
            className="btn btn-primary"
            onClick={handleSimulatePhysicalVisit}
            disabled={simulatingWalk}
            title="For development/testing: sends the tag's GPS coordinates to /api/tags/{id}/unlock/"
          >
            {simulatingWalk
              ? "Verifying Geofence..."
              : "🧪 Dev Simulator: Simulate Standing at Location Now"}
          </button>
        </div>
      )}
    </div>
  );
};
