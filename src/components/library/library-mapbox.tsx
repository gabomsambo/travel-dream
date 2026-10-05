"use client"

import * as React from "react"
import Map, { Layer, NavigationControl, Source, type LayerProps, type MapMouseEvent, type MapRef } from "react-map-gl/mapbox"
import type mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { useTheme } from "next-themes"
import type { LibraryItem } from "@/lib/library/types"

/** A theme token ("221.2 83.2% 53.3%") as a colour Mapbox's paint properties accept. */
function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/\s+/)
  return parts.length === 3 ? `hsl(${parts.join(", ")})` : fallback
}

/**
 * The Library's places on the app's existing Mapbox map (same token and
 * react-map-gl stack as /map): pins coloured by shelf, clusters that zoom in,
 * and a click on a pin opens the quick-look sheet.
 */
export default function LibraryMapbox({ items, onOpen }: { items: LibraryItem[]; onOpen: (id: string) => void }) {
  const ref = React.useRef<MapRef>(null)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  const data = React.useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: "FeatureCollection",
      features: items
        .filter((p) => p.lat !== null && p.lon !== null)
        .map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon!, p.lat!] },
          properties: { id: p.id, name: p.name, status: p.visitStatus },
        })),
    }),
    [items]
  )

  const bounds = React.useMemo(() => {
    const pts = data.features.map((f) => f.geometry.coordinates)
    if (pts.length < 2) return null
    const lons = pts.map((c) => c[0])
    const lats = pts.map((c) => c[1])
    return [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ] as [[number, number], [number, number]]
  }, [data])

  // Read the theme's colours after the theme class lands on <html>.
  const [colors, setColors] = React.useState({ primary: "#3b82f6", fg: "#0f172a", bg: "#ffffff", accent: "#f59e0b" })
  React.useEffect(() => {
    setColors({
      primary: token("--primary", "#3b82f6"),
      fg: token("--foreground", "#0f172a"),
      bg: token("--background", "#ffffff"),
      accent: token("--accent", "#f59e0b"),
    })
  }, [resolvedTheme])

  const clusters: LayerProps = {
    id: "library-clusters",
    type: "circle",
    source: "library",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": colors.fg,
      "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 23],
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.bg,
    },
  }
  const clusterCount: LayerProps = {
    id: "library-cluster-count",
    type: "symbol",
    source: "library",
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"], "text-size": 12 },
    paint: { "text-color": colors.bg },
  }
  const pins: LayerProps = {
    id: "library-pins",
    type: "circle",
    source: "library",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["match", ["get", "status"], "visited", colors.primary, "planned", colors.accent, colors.fg],
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.bg,
    },
  }

  const onClick = (e: MapMouseEvent) => {
    const f = e.features?.[0]
    if (!f) return
    const clusterId = f.properties?.cluster_id
    if (clusterId !== undefined) {
      const src = ref.current?.getSource("library") as mapboxgl.GeoJSONSource | undefined
      src?.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
        ref.current?.easeTo({ center: [lng, lat], zoom: zoom ?? 8, duration: 500 })
      })
      return
    }
    if (f.properties?.id) onOpen(String(f.properties.id))
  }

  return (
    <Map
      ref={ref}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={bounds ? { bounds, fitBoundsOptions: { padding: 48, maxZoom: 9 } } : { longitude: data.features[0]?.geometry.coordinates[0] ?? 10, latitude: data.features[0]?.geometry.coordinates[1] ?? 25, zoom: data.features.length ? 8 : 1.2 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
      interactiveLayerIds={["library-clusters", "library-pins"]}
      onClick={onClick}
      onMouseEnter={() => ref.current && (ref.current.getCanvas().style.cursor = "pointer")}
      onMouseLeave={() => ref.current && (ref.current.getCanvas().style.cursor = "")}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="library" type="geojson" data={data} cluster clusterMaxZoom={12} clusterRadius={44}>
        <Layer {...clusters} />
        <Layer {...clusterCount} />
        <Layer {...pins} />
      </Source>
    </Map>
  )
}
