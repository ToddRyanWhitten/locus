import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle as LeafletCircle,
  useMapEvents,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { APIProvider, Map as GoogleMap, AdvancedMarker } from "@vis.gl/react-google-maps";
import { Tag } from "../types";

// Custom HTML pin icons so Locked Teaser Pins vs Unlocked Memories vs Creator Pins are unmistakable
function createPinIcon(tag: Tag, isSelected: boolean) {
  const bg = tag.is_creator
    ? "#0284c7" // Creator blue
    : tag.is_unlocked
    ? "#10b981" // Unlocked emerald green
    : "#f59e0b"; // Locked amber treasure pin

  const glyph = tag.is_creator ? "✍️" : tag.is_unlocked ? "🔓" : "🔒";
  const ring = isSelected ? "0 0 0 4px rgba(56, 189, 248, 0.55)" : "0 3px 8px rgba(0,0,0,0.4)";

  return L.divIcon({
    className: "locus-custom-pin",
    html: `<div style="
      background: ${bg};
      color: white;
      width: 36px;
      height: 36px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: ${ring};
    ">
      <span style="transform: rotate(45deg); font-size: 16px;">${glyph}</span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
}

const draftPinIcon = L.divIcon({
  className: "locus-draft-pin",
  html: `<div style="
    background: #ec4899;
    color: white;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px dashed white;
    box-shadow: 0 4px 12px rgba(236,72,153,0.6);
    font-size: 18px;
  ">📍</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

interface MapClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
}

function LeafletClickEvents({ onMapClick }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      onMapClick(
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6))
      );
    },
  });
  return null;
}

function FlyToSelectedTag({ selectedTag }: { selectedTag: Tag | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (selectedTag) {
      map.flyTo([selectedTag.latitude, selectedTag.longitude], 16, {
        duration: 0.8,
      });
    }
  }, [selectedTag, map]);
  return null;
}

interface LocusMapViewProps {
  tags: Tag[];
  selectedTag: Tag | null;
  onSelectTag: (tag: Tag) => void;
  draftCoords: { lat: number; lng: number; radius: number } | null;
  onMapClick: (lat: number, lng: number) => void;
}

export const LocusMapView: React.FC<LocusMapViewProps> = ({
  tags,
  selectedTag,
  onSelectTag,
  draftCoords,
  onMapClick,
}) => {
  const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  const defaultCenter =
    tags.length > 0
      ? { lat: tags[0].latitude, lng: tags[0].longitude }
      : { lat: 38.8951, lng: -77.0364 };

  // If user configured a Google Maps API key in .env, render native Google Maps JS SDK
  if (googleMapsApiKey) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <APIProvider apiKey={googleMapsApiKey}>
          <GoogleMap
            defaultCenter={defaultCenter}
            defaultZoom={14}
            mapId="LOCUS_MEMORY_MAP"
            style={{ width: "100%", height: "100%" }}
            onClick={(ev) => {
              if (ev.detail.latLng) {
                onMapClick(
                  Number(ev.detail.latLng.lat.toFixed(6)),
                  Number(ev.detail.latLng.lng.toFixed(6))
                );
              }
            }}
          >
            {tags.map((tag) => (
              <AdvancedMarker
                key={tag.id}
                position={{ lat: tag.latitude, lng: tag.longitude }}
                onClick={() => onSelectTag(tag)}
                title={tag.title}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: "20px",
                    background: tag.is_creator
                      ? "#0284c7"
                      : tag.is_unlocked
                      ? "#10b981"
                      : "#f59e0b",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "2px solid #fff",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                    cursor: "pointer",
                  }}
                >
                  {tag.is_creator ? "✍️" : tag.is_unlocked ? "🔓" : "🔒"} {tag.title}
                </div>
              </AdvancedMarker>
            ))}
          </GoogleMap>
        </APIProvider>
      </div>
    );
  }

  // Fallback interactive map (works out-of-the-box before adding a Google Maps billing key)
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lng]}
        zoom={14}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LeafletClickEvents onMapClick={onMapClick} />
        <FlyToSelectedTag selectedTag={selectedTag} />

        {tags.map((tag) => (
          <React.Fragment key={tag.id}>
            <Marker
              position={[tag.latitude, tag.longitude]}
              icon={createPinIcon(tag, selectedTag?.id === tag.id)}
              eventHandlers={{
                click: () => onSelectTag(tag),
              }}
            >
              <Popup>
                <strong>{tag.title}</strong>
                <br />
                <span style={{ fontSize: "12px", color: "#475569" }}>
                  {tag.is_unlocked
                    ? "🔓 Unlocked Memory"
                    : `🔒 Locked — Visit within ${tag.unlock_radius_meters}m on mobile`}
                </span>
              </Popup>
            </Marker>
            <LeafletCircle
              center={[tag.latitude, tag.longitude]}
              radius={tag.unlock_radius_meters}
              pathOptions={{
                color: tag.is_unlocked ? "#10b981" : "#f59e0b",
                fillColor: tag.is_unlocked ? "#10b981" : "#f59e0b",
                fillOpacity: selectedTag?.id === tag.id ? 0.22 : 0.08,
                weight: selectedTag?.id === tag.id ? 2 : 1,
              }}
            />
          </React.Fragment>
        ))}

        {draftCoords && (
          <>
            <Marker
              position={[draftCoords.lat, draftCoords.lng]}
              icon={draftPinIcon}
            />
            <LeafletCircle
              center={[draftCoords.lat, draftCoords.lng]}
              radius={draftCoords.radius}
              pathOptions={{
                color: "#ec4899",
                fillColor: "#ec4899",
                fillOpacity: 0.2,
                dashArray: "4 4",
              }}
            />
          </>
        )}
      </MapContainer>

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          zIndex: 999,
          background: "rgba(15, 23, 42, 0.88)",
          color: "#f8fafc",
          padding: "8px 12px",
          borderRadius: "8px",
          fontSize: "12px",
          backdropFilter: "blur(6px)",
          border: "1px solid #334155",
        }}
      >
        💡 <strong>Tip:</strong> Click anywhere on the map to set coordinates for a new Tag.
        {!googleMapsApiKey && (
          <span style={{ color: "#94a3b8", marginLeft: 8 }}>
            (Add <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env</code> to switch to Google Maps tiles)
          </span>
        )}
      </div>
    </div>
  );
};
