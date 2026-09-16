"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";
import type { LeafletMapProps } from "./LeafletMap";

const Inner = dynamic(() => import("./LeafletMap"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

/** Leaflet + OSM/CARTO tiles, no API key (PRD §9). Client-only. */
export function Map(props: LeafletMapProps & { height?: number | string }) {
  const { height = 320, ...rest } = props;
  return (
    <div className="overflow-hidden rounded-2xl border bg-muted" style={{ height }}>
      <Inner {...rest} />
    </div>
  );
}
export type { MapPin } from "./LeafletMap";
