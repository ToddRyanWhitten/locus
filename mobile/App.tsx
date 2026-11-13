import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Circle as MapCircle, Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
} from "expo-audio";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://10.0.2.2:8000/api";

interface TagMediaItem {
  id: string;
  media_type: "IMAGE" | "AUDIO" | "VIDEO";
  file_url: string;
  caption: string;
}

interface Tag {
  id: string;
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
  distance_meters: number | null;
  can_unlock_now: boolean;
  story_text: string | null;
  media_items: TagMediaItem[];
  creator: {
    username: string;
    display_name: string;
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [username, setUsername] = useState("daughter");
  const [password, setPassword] = useState("locus123");

  const [userCoords, setUserCoords] = useState<{
    latitude: number;
    longitude: number;
  }>({
    latitude: 38.8951,
    longitude: -77.0364,
  });

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(false);

  // Field Recorder Modal State
  const [showRecorderModal, setShowRecorderModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newHint, setNewHint] = useState("");
  const [newStory, setNewStory] = useState("");
  const [newRadius, setNewRadius] = useState("75");
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [recordedAudioUri, setRecordedAudioUri] = useState<string | null>(null);
  // Hook-managed player: expo-audio releases it automatically on unmount.
  const player = useAudioPlayer();

  useEffect(() => {
    requestLocationTracker();
  }, []);

  useEffect(() => {
    if (token) {
      fetchNearbyTags(userCoords.latitude, userCoords.longitude);
    }
  }, [token, userCoords.latitude, userCoords.longitude]);

  const requestLocationTracker = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch {
      // Fallback to demo coordinates in simulator
    }
  };

  const signIn = async (u: string, p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      setToken(data.access);
      setCurrentUser(data.user);
    } catch (err: any) {
      Alert.alert("Login Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchNearbyTags = async (lat: number, lng: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/tags/?lat=${lat}&lng=${lng}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: Tag[] = await res.json();
      setTags(data);
      if (selectedTag) {
        const refreshed = data.find((t) => t.id === selectedTag.id);
        if (refreshed) setSelectedTag(refreshed);
      }
    } catch (err) {
      console.warn("Failed to load tags:", err);
    }
  };

  const handleUnlockTag = async (tag: Tag) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/tags/${tag.id}/unlock/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude: userCoords.latitude,
          longitude: userCoords.longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Still Locked 🔒", data.error || "Walk closer to unlock!");
        return;
      }
      Alert.alert(
        "Memory Unlocked! 🔓",
        `You stood within ${data.distance_meters}m of "${tag.title}". This memory is now permanently unlocked on your phone and the web portal!`
      );
      setSelectedTag(data.tag);
      fetchNearbyTags(userCoords.latitude, userCoords.longitude);
    } catch (err: any) {
      Alert.alert("Unlock Failed", err.message);
    }
  };

  // Field Audio Recording (expo-audio)
  const toggleVoiceRecording = async () => {
    if (recording) {
      await recorder.stop();
      setRecordedAudioUri(recorder.uri);
      setRecording(false);
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Microphone permission is needed to record audio.");
      return;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const playAudioUrl = async (url: string) => {
    player.replace({ uri: url });
    player.play();
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });
    if (!res.canceled && res.assets.length > 0) {
      setPickedImageUri(res.assets[0].uri);
    }
  };

  const handleCreateFieldTag = async () => {
    if (!token || !newTitle.trim() || !newStory.trim()) {
      Alert.alert("Missing Fields", "Please enter a title and story.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/tags/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          teaser_hint: newHint.trim(),
          latitude: userCoords.latitude,
          longitude: userCoords.longitude,
          unlock_radius_meters: Number(newRadius) || 75,
          visibility: "TEASER",
          story_text: newStory.trim(),
        }),
      });
      const createdTag: Tag = await res.json();

      // Upload attached photo if selected
      if (pickedImageUri) {
        const form = new FormData();
        form.append("file", {
          uri: pickedImageUri,
          name: "field-photo.jpg",
          type: "image/jpeg",
        } as any);
        form.append("media_type", "IMAGE");
        form.append("caption", "Captured on location");
        await fetch(`${API_BASE}/tags/${createdTag.id}/upload_media/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      }

      // Upload attached voice story if recorded
      if (recordedAudioUri) {
        const form = new FormData();
        form.append("file", {
          uri: recordedAudioUri,
          name: "field-voice.m4a",
          type: "audio/m4a",
        } as any);
        form.append("media_type", "AUDIO");
        form.append("caption", "Voice story recorded on location");
        await fetch(`${API_BASE}/tags/${createdTag.id}/upload_media/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      }

      setShowRecorderModal(false);
      setNewTitle("");
      setNewHint("");
      setNewStory("");
      setPickedImageUri(null);
      setRecordedAudioUri(null);
      fetchNearbyTags(userCoords.latitude, userCoords.longitude);
    } catch (err: any) {
      Alert.alert("Error Creating Tag", err.message);
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <Text style={styles.logo}>🧭 LOCUS</Text>
        <Text style={styles.subtitle}>
          Stand where your loved ones stood & unlock their stories, photos, and voice.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#64748b"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => signIn(username, password)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <View style={styles.quickRoleRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => signIn("daughter", "locus123")}
          >
            <Text style={styles.secondaryBtnText}>🚶‍♀️ Daughter (Viewer)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => signIn("todd", "locus123")}
          >
            <Text style={styles.secondaryBtnText}>👨‍👧 Dad (Recorder)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🧭 Locus Scavenger Map</Text>
          <Text style={styles.headerSub}>
            Signed in as {currentUser?.display_name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.recordBtn}
            onPress={() => setShowRecorderModal(true)}
          >
            <Text style={styles.recordBtnText}>+ Tag Here</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setToken(null)}
          >
            <Text style={styles.logoutBtnText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Native iOS / Android Google Map */}
      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: userCoords.latitude,
            longitude: userCoords.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          }}
          showsUserLocation
        >
          {/* Current User / Simulated Walker Pin */}
          <Marker
            coordinate={userCoords}
            title="Your Current Position"
            pinColor="#38bdf8"
          />

          {tags.map((tag) => (
            <React.Fragment key={tag.id}>
              <Marker
                coordinate={{ latitude: tag.latitude, longitude: tag.longitude }}
                title={`${tag.is_unlocked ? "🔓" : "🔒"} ${tag.title}`}
                description={tag.teaser_hint}
                pinColor={
                  tag.is_creator ? "#0284c7" : tag.is_unlocked ? "#10b981" : "#f59e0b"
                }
                onPress={() => setSelectedTag(tag)}
              />
              <MapCircle
                center={{ latitude: tag.latitude, longitude: tag.longitude }}
                radius={tag.unlock_radius_meters}
                strokeColor={tag.is_unlocked ? "#10b981" : "#f59e0b"}
                fillColor={
                  tag.is_unlocked
                    ? "rgba(16, 185, 129, 0.18)"
                    : "rgba(245, 158, 11, 0.18)"
                }
              />
            </React.Fragment>
          ))}
        </MapView>
      </View>

      {/* Bottom Sheet: Selected Memory or Tag Scavenger List */}
      <View style={styles.bottomSheet}>
        {selectedTag ? (
          <ScrollView>
            <View style={styles.tagHeaderRow}>
              <Text style={styles.tagTitle}>
                {selectedTag.is_unlocked ? "🔓" : "🔒"} {selectedTag.title}
              </Text>
              <TouchableOpacity onPress={() => setSelectedTag(null)}>
                <Text style={{ color: "#38bdf8", fontWeight: "700" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.distanceText}>
              📍 {selectedTag.distance_meters ?? "—"}m away • Unlock Radius:{" "}
              {selectedTag.unlock_radius_meters}m
            </Text>

            {selectedTag.teaser_hint ? (
              <Text style={styles.hintBox}>🧭 Clue: {selectedTag.teaser_hint}</Text>
            ) : null}

            {selectedTag.is_unlocked ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.storyBox}>{selectedTag.story_text}</Text>
                {selectedTag.media_items.map((m) => (
                  <View key={m.id} style={{ marginTop: 10 }}>
                    {m.media_type === "IMAGE" && (
                      <Image
                        source={{ uri: m.file_url }}
                        style={{ width: "100%", height: 190, borderRadius: 8 }}
                      />
                    )}
                    {m.media_type === "AUDIO" && (
                      <TouchableOpacity
                        style={styles.audioBtn}
                        onPress={() => playAudioUrl(m.file_url)}
                      >
                        <Text style={styles.primaryBtnText}>
                          🔊 Play Voice Story ({m.caption || "Audio"})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.lockedPanel}>
                <Text style={styles.lockedText}>
                  Walk within {selectedTag.unlock_radius_meters}m of this pin to unlock{" "}
                  {selectedTag.creator.display_name}'s memory!
                </Text>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => handleUnlockTag(selectedTag)}
                  >
                    <Text style={styles.primaryBtnText}>🔓 Unlock Here</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => {
                      // Dev helper to walk directly to the tag's coordinates in emulator
                      setUserCoords({
                        latitude: selectedTag.latitude,
                        longitude: selectedTag.longitude,
                      });
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>🚶 Walk to Pin (Sim)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            data={tags}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.listRow}
                onPress={() => setSelectedTag(item)}
              >
                <Text style={styles.listRowTitle}>
                  {item.is_unlocked ? "🔓" : "🔒"} {item.title}
                </Text>
                <Text style={styles.listRowDist}>
                  {item.distance_meters !== null ? `${item.distance_meters}m` : ""}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Field Recorder Modal */}
      <Modal visible={showRecorderModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <Text style={styles.tagTitle}>📍 Record New Tag at Current Location</Text>
          <Text style={styles.distanceText}>
            GPS: {userCoords.latitude.toFixed(5)}, {userCoords.longitude.toFixed(5)}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Tag Title (e.g., Childhood Porch)"
            placeholderTextColor="#64748b"
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Teaser Hint for Viewer"
            placeholderTextColor="#64748b"
            value={newHint}
            onChangeText={setNewHint}
          />
          <TextInput
            style={styles.input}
            placeholder="Unlock Radius in Meters (default 75)"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
            value={newRadius}
            onChangeText={setNewRadius}
          />
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: "top" }]}
            placeholder="Write the story of this place..."
            placeholderTextColor="#64748b"
            multiline
            value={newStory}
            onChangeText={setNewStory}
          />

          <View style={{ flexDirection: "row", gap: 8, marginVertical: 10 }}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={pickPhoto}>
              <Text style={styles.secondaryBtnText}>
                {pickedImageUri ? "📷 Photo Attached" : "📷 Attach Photo"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={toggleVoiceRecording}
            >
              <Text style={styles.secondaryBtnText}>
                {recording
                  ? "⏹ Stop Recording"
                  : recordedAudioUri
                  ? "🎙️ Voice Recorded"
                  : "🎙️ Record Voice"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreateFieldTag}
          >
            <Text style={styles.primaryBtnText}>💾 Save Memory Tag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 10 }]}
            onPress={() => setShowRecorderModal(false)}
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  authContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    padding: 24,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 20,
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    color: "#38bdf8",
    textAlign: "center",
  },
  subtitle: {
    color: "#94a3b8",
    textAlign: "center",
    marginVertical: 12,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 10,
  },
  primaryBtn: {
    backgroundColor: "#0284c7",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#334155",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  secondaryBtnText: { color: "#f8fafc", fontWeight: "600", fontSize: 12 },
  quickRoleRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1e293b",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#38bdf8", fontWeight: "800", fontSize: 16 },
  headerSub: { color: "#94a3b8", fontSize: 12 },
  recordBtn: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  recordBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  logoutBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  logoutBtnText: { color: "#cbd5e1", fontSize: 12 },
  mapWrapper: { flex: 1 },
  map: { width: "100%", height: "100%" },
  bottomSheet: {
    height: 250,
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  tagHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagTitle: { color: "#f8fafc", fontSize: 17, fontWeight: "700" },
  distanceText: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  hintBox: {
    backgroundColor: "#0f172a",
    color: "#bae6fd",
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    fontSize: 12,
  },
  storyBox: {
    backgroundColor: "#0f172a",
    color: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
  audioBtn: {
    backgroundColor: "#10b981",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  lockedPanel: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "#f59e0b",
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  lockedText: { color: "#fde68a", fontSize: 13 },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  listRowTitle: { color: "#f8fafc", fontWeight: "600" },
  listRowDist: { color: "#38bdf8", fontWeight: "700" },
});
