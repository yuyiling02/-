import { MutableRefObject } from "react";

export enum HandType {
  LEFT = "Left",
  RIGHT = "Right"
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface DetectedHand {
  landmarks: HandLandmark[];
  worldLandmarks: HandLandmark[];
  handedness: HandType;
  score: number;
}

export interface EarthControlState {
  rotation: { x: number; y: number };
  scale: number;
  position: { x: number; y: number };
  activeRegion: string;
}

export interface PanelState {
  x: number;
  y: number;
  isDragging: boolean;
}

// Prop types for components
export interface HolographicEarthProps {
  controlRef: MutableRefObject<EarthControlState>;
  setContinent: (region: string) => void;
}

export interface HUDOverlayProps {
  handDetected: boolean;
  activeRegion: string;
  fps: number;
  panelRef: MutableRefObject<HTMLDivElement | null>;
  panelState: PanelState;
  gestureStatus: string;
}