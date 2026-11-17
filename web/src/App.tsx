import React, { useState, useEffect } from "react";
import { api, getAuthToken, setAuthToken } from "./api";
import { Circle, CircleMessage, Tag, UserBrief } from "./types";
import { LocusMapView } from "./components/LocusMapView";
import { TagEditorModal } from "./components/TagEditorModal";
import { TagDetailPanel } from "./components/TagDetailPanel";

export const App: React.FC = () => {
  const [user, setUser] = useState<UserBrief | null>(null);
  const [usernameInput, setUsernameInput] = useState("dad");
  const [passwordInput, setPasswordInput] = useState("locus123");
  const [authError, setAuthError] = useState<string | null>(null);

  const [circles, setCircles] = useState<Circle[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string>("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // Creator / Editor state
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number }>({
    lat: 38.8951,
    lng: -77.0364,
  });

  // Group Chat state
  const [messages, setMessages] = useState<CircleMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState<"memories" | "chat">("memories");

  // Invite code modal state
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (getAuthToken()) {
      loadInitialData();
    }
  }, []);

  useEffect(() => {
    if (user && activeCircleId) {
      refreshCircleTagsAndChat(activeCircleId);
    }
  }, [activeCircleId, user]);

  const loadInitialData = async () => {
    try {
      const me = await api.getMe();
      setUser(me);
      const userCircles = await api.getCircles();
      setCircles(userCircles);
      if (userCircles.length > 0) {
        setActiveCircleId(userCircles[0].id);
      }
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  };

  const refreshCircleTagsAndChat = async (circleId: string) => {
    const [circleTags, circleMsgs] = await Promise.all([
      api.getTags({ circleId }),
      api.getCircleMessages(circleId),
    ]);
    setTags(circleTags);
    setMessages(circleMsgs);
    if (circleTags.length > 0 && !selectedTag) {
      setSelectedTag(circleTags[0]);
    } else if (selectedTag) {
      const updated = circleTags.find((t) => t.id === selectedTag.id) || null;
      setSelectedTag(updated);
    }
  };

  const handleLogin = async (u: string, p: string) => {
    setAuthError(null);
    try {
      const res = await api.login(u, p);
      setAuthToken(res.access);
      setUser(res.user);
      const userCircles = await api.getCircles();
      setCircles(userCircles);
      if (userCircles.length > 0) {
        setActiveCircleId(userCircles[0].id);
      }
    } catch (err: any) {
      setAuthError(err.message || "Login failed");
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setTags([]);
    setSelectedTag(null);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeCircleId) return;
    const msg = await api.postCircleMessage(
      activeCircleId,
      chatInput.trim(),
      selectedTag?.id
    );
    setMessages((prev) => [...prev, msg]);
    setChatInput("");
  };

  const handleJoinCircle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    try {
      const joined = await api.joinCircle(joinCode.trim());
      const updatedCircles = await api.getCircles();
      setCircles(updatedCircles);
      setActiveCircleId(joined.id);
      setJoinCode("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ fontSize: "36px", marginBottom: 8 }}>🧭</div>
          <h1 style={{ margin: "0 0 6px 0" }}>Locus</h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: 20 }}>
            Leave your mark on the landscape. Anchor your stories, photos, and voice to the places
            that matter most.
          </p>

          {authError && <div className="alert-error">{authError}</div>}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin(usernameInput, passwordInput);
            }}
            className="tag-form"
          >
            <label>
              Username
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              Sign In to Locus Web Portal
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #334155",
              fontSize: "12.5px",
            }}
          >
            <div style={{ color: "#cbd5e1", marginBottom: 8, fontWeight: 600 }}>
              ⚡ Quick Demo Role Switcher:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleLogin("dad", "locus123")}
              >
                👨‍👧 Sign in as Dad (Recorder)
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleLogin("daughter", "locus123")}
              >
                🚶‍♀️ Sign in as Daughter (Viewer)
              </button>
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <a
                href="http://localhost:8000/admin/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#38bdf8", textDecoration: "none", fontSize: "12px" }}
              >
                🛠️ Open Django Administrative Portal (Port 8000) →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeCircle = circles.find((c) => c.id === activeCircleId);

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: "22px", fontWeight: 800, color: "#38bdf8" }}>
            🧭 LOCUS
          </span>
          <select
            value={activeCircleId}
            onChange={(e) => setActiveCircleId(e.target.value)}
            className="circle-select"
          >
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                ⭕ {c.name} (Invite: {c.invite_code})
              </option>
            ))}
          </select>
          <form onSubmit={handleJoinCircle} style={{ display: "flex", gap: 6 }}>
            <input
              type="text"
              placeholder="Invite code..."
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              style={{
                padding: "5px 8px",
                borderRadius: 6,
                border: "1px solid #334155",
                background: "#0f172a",
                color: "white",
                fontSize: "12px",
                width: 110,
              }}
            />
            <button type="submit" className="btn btn-secondary" style={{ padding: "5px 10px" }}>
              Join
            </button>
          </form>
        </div>

        {/* Quick Persona Switcher + Admin Portal Link */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "12.5px", color: "#cbd5e1" }}>
            Signed in as <strong>{user.display_name}</strong> ({user.storage_used_mb}/
            {user.storage_quota_mb} MB)
          </span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "12px", padding: "5px 10px" }}
            onClick={() =>
              handleLogin(user.username === "dad" ? "daughter" : "dad", "locus123")
            }
          >
            🔄 Switch to {user.username === "dad" ? "Daughter (Viewer)" : "Dad (Recorder)"}
          </button>
          <a
            href="http://localhost:8000/admin/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: "12px", padding: "5px 10px", textDecoration: "none" }}
          >
            🛠️ Admin Portal
          </a>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "12px", padding: "5px 10px" }}
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Split View: Left Sidebar (Memories + Creator + Group Chat) & Right Interactive Map */}
      <div className="main-workspace">
        <aside className="sidebar">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className={`btn ${activeTab === "memories" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("memories")}
              >
                📍 Memories ({tags.length})
              </button>
              <button
                className={`btn ${activeTab === "chat" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setActiveTab("chat")}
              >
                💬 Circle Chat ({messages.length})
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingTag(null);
                setIsCreatingTag(true);
                setActiveTab("memories");
              }}
            >
              + New Tag
            </button>
          </div>

          {activeTab === "memories" ? (
            <div className="sidebar-scroll">
              {(isCreatingTag || editingTag) && (
                <TagEditorModal
                  initialCoords={draftCoords}
                  circleId={activeCircleId}
                  editingTag={editingTag}
                  onSaved={(saved) => {
                    setIsCreatingTag(false);
                    setEditingTag(null);
                    refreshCircleTagsAndChat(activeCircleId);
                    setSelectedTag(saved);
                  }}
                  onCancel={() => {
                    setIsCreatingTag(false);
                    setEditingTag(null);
                  }}
                />
              )}

              {selectedTag && !editingTag && (
                <TagDetailPanel
                  tag={selectedTag}
                  onEdit={(t) => setEditingTag(t)}
                  onDeleted={() => {
                    setSelectedTag(null);
                    refreshCircleTagsAndChat(activeCircleId);
                  }}
                  onUnlocked={(updated) => {
                    setSelectedTag(updated);
                    refreshCircleTagsAndChat(activeCircleId);
                  }}
                />
              )}

              <h4 style={{ margin: "16px 0 8px 0", fontSize: "12px", textTransform: "uppercase", color: "#94a3b8" }}>
                All Shared Tags in {activeCircle?.name || "Circle"}
              </h4>
              <div style={{ display: "grid", gap: 8 }}>
                {tags.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTag(t)}
                    className={`tag-list-item ${selectedTag?.id === t.id ? "active" : ""}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>
                        {t.is_creator ? "✍️" : t.is_unlocked ? "🔓" : "🔒"} {t.title}
                      </strong>
                      {t.recorded_year && (
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>{t.recorded_year}</span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: 2 }}>
                      {t.address_label || `${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-panel">
              <div className="chat-messages">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.is_system_event ? "system" : ""}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8" }}>
                      <strong>{m.sender.display_name}</strong>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: "13px" }}>{m.text}</div>
                    {m.tag_title && (
                      <div style={{ marginTop: 4, fontSize: "11px", color: "#38bdf8" }}>
                        📍 Linked Tag: {m.tag_title}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendChat} style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Message ${activeCircle?.name || "circle"}...`}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #334155",
                    background: "#0f172a",
                    color: "white",
                  }}
                />
                <button type="submit" className="btn btn-primary">
                  Send
                </button>
              </form>
            </div>
          )}
        </aside>

        <main className="map-stage">
          <LocusMapView
            tags={tags}
            selectedTag={selectedTag}
            onSelectTag={(t) => setSelectedTag(t)}
            draftCoords={
              isCreatingTag || editingTag
                ? {
                    lat: draftCoords.lat,
                    lng: draftCoords.lng,
                    radius: editingTag?.unlock_radius_meters || 75,
                  }
                : null
            }
            onMapClick={(lat, lng) => {
              setDraftCoords({ lat, lng });
              if (!isCreatingTag && !editingTag) {
                setIsCreatingTag(true);
              }
            }}
          />
        </main>
      </div>
    </div>
  );
};
