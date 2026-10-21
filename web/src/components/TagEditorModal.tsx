import React, { useState, useRef } from "react";
import { api } from "../api";
import { Tag } from "../types";

interface VoiceRecorderButtonProps {
  onRecorded: (file: File) => void;
}

const BrowserVoiceRecorder: React.FC<VoiceRecorderButtonProps> = ({ onRecorded }) => {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-memory-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        onRecorded(file);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      alert("Microphone access was denied or is unavailable in this browser.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <button
      type="button"
      onClick={recording ? stopRecording : startRecording}
      className={recording ? "btn btn-danger" : "btn btn-secondary"}
      style={{ fontSize: "12px" }}
    >
      {recording ? "⏹ Stop Voice Recording" : "🎙️ Record Voice Story in Browser"}
    </button>
  );
};

interface TagEditorModalProps {
  initialCoords: { lat: number; lng: number };
  circleId: string;
  editingTag?: Tag | null;
  onSaved: (tag: Tag) => void;
  onCancel: () => void;
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({
  initialCoords,
  circleId,
  editingTag,
  onSaved,
  onCancel,
}) => {
  const [title, setTitle] = useState(editingTag?.title || "");
  const [teaserHint, setTeaserHint] = useState(editingTag?.teaser_hint || "");
  const [addressLabel, setAddressLabel] = useState(editingTag?.address_label || "");
  const [latitude, setLatitude] = useState(editingTag?.latitude ?? initialCoords.lat);
  const [longitude, setLongitude] = useState(editingTag?.longitude ?? initialCoords.lng);
  const [unlockRadius, setUnlockRadius] = useState(
    editingTag?.unlock_radius_meters ?? 75
  );
  const [visibility, setVisibility] = useState<"TEASER" | "HIDDEN">(
    editingTag?.visibility || "TEASER"
  );
  const [recordedYear, setRecordedYear] = useState<string>(
    editingTag?.recorded_year ? String(editingTag.recorded_year) : ""
  );
  const [storyText, setStoryText] = useState(editingTag?.story_text || "");
  const [pendingFiles, setPendingFiles] = useState<
    { file: File; caption: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync coordinates if the user clicks a new spot on the map while the modal is open
  React.useEffect(() => {
    if (!editingTag) {
      setLatitude(initialCoords.lat);
      setLongitude(initialCoords.lng);
    }
  }, [initialCoords.lat, initialCoords.lng, editingTag]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const added = Array.from(e.target.files).map((file) => ({
      file,
      caption: file.name.replace(/\.[^/.]+$/, ""),
    }));
    setPendingFiles((prev) => [...prev, ...added]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        teaser_hint: teaserHint,
        address_label: addressLabel,
        latitude: Number(latitude),
        longitude: Number(longitude),
        unlock_radius_meters: Number(unlockRadius),
        visibility,
        recorded_year: recordedYear ? Number(recordedYear) : null,
        story_text: storyText,
        circle_ids: circleId ? [circleId] : [],
      };

      const savedTag = editingTag
        ? await api.updateTag(editingTag.id, payload)
        : await api.createTag(payload);

      for (const item of pendingFiles) {
        await api.uploadTagMedia(savedTag.id, item.file, item.caption);
      }

      // Refresh full tag with uploaded media
      const refreshedTags = await api.getTags({ circleId });
      const updated = refreshedTags.find((t) => t.id === savedTag.id) || savedTag;
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || "Failed to save tag.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ border: "1px solid #0284c7" }}>
      <h3 style={{ margin: "0 0 12px 0", color: "#38bdf8" }}>
        {editingTag ? `✏️ Edit Tag: ${editingTag.title}` : "📍 Create New Location Tag"}
      </h3>
      {error && <div className="alert-error">{error}</div>}
      <form onSubmit={handleSubmit} className="tag-form">
        <label>
          Tag Title (Shown on the Map Pin) *
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., The House I Grew Up In"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <label>
            Latitude *
            <input
              type="number"
              step="any"
              required
              value={latitude}
              onChange={(e) => setLatitude(Number(e.target.value))}
            />
          </label>
          <label>
            Longitude *
            <input
              type="number"
              step="any"
              required
              value={longitude}
              onChange={(e) => setLongitude(Number(e.target.value))}
            />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <label>
            Unlock Radius (Meters)
            <input
              type="number"
              min={15}
              max={5000}
              value={unlockRadius}
              onChange={(e) => setUnlockRadius(Number(e.target.value))}
            />
          </label>
          <label>
            Year of Memory
            <input
              type="number"
              placeholder="e.g. 1986"
              value={recordedYear}
              onChange={(e) => setRecordedYear(e.target.value)}
            />
          </label>
        </div>

        <label>
          Scavenger Hunt Visibility Mode
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "TEASER" | "HIDDEN")}
          >
            <option value="TEASER">
              Option A (Default): Teaser Pin on Map — shows title & location, locks content until visited
            </option>
            <option value="HIDDEN">
              Option B: Hidden Surprise — invisible on map until viewer walks nearby
            </option>
          </select>
        </label>

        <label>
          Landmark / Street Address Label
          <input
            type="text"
            value={addressLabel}
            onChange={(e) => setAddressLabel(e.target.value)}
            placeholder="e.g., 742 Evergreen Terrace"
          />
        </label>

        <label>
          Teaser Hint (Visible to your daughter before she unlocks the pin)
          <input
            type="text"
            value={teaserHint}
            onChange={(e) => setTeaserHint(e.target.value)}
            placeholder="e.g., Stand by the old maple tree out front"
          />
        </label>

        <label>
          Full Story / Memory (Locked until she stands at this location!) *
          <textarea
            rows={4}
            required
            value={storyText}
            onChange={(e) => setStoryText(e.target.value)}
            placeholder="Write the story of what happened here so she can read it while standing in your footsteps..."
          />
        </label>

        <div className="media-upload-box">
          <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "6px" }}>
            📎 Attach Photos, Audio/Songs, or Videos
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="file"
              multiple
              accept="image/*,audio/*,video/*"
              onChange={handleFileChange}
              style={{ fontSize: "12px" }}
            />
            <BrowserVoiceRecorder
              onRecorded={(voiceFile) =>
                setPendingFiles((prev) => [
                  ...prev,
                  { file: voiceFile, caption: "Recorded Voice Story" },
                ])
              }
            />
          </div>

          {pendingFiles.length > 0 && (
            <ul style={{ margin: "8px 0 0 0", paddingLeft: "18px", fontSize: "12px" }}>
              {pendingFiles.map((pf, idx) => (
                <li key={idx} style={{ marginBottom: "4px" }}>
                  <strong>{pf.file.name}</strong> ({Math.round(pf.file.size / 1024)} KB)
                  <input
                    type="text"
                    value={pf.caption}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingFiles((list) =>
                        list.map((item, i) => (i === idx ? { ...item, caption: val } : item))
                      );
                    }}
                    placeholder="Caption..."
                    style={{ marginLeft: "8px", padding: "2px 6px", fontSize: "11px" }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : editingTag ? "💾 Save Changes" : "📍 Drop Memory Tag"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
