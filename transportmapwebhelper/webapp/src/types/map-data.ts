export interface PCB {
  id: string;
  x: number;
  y: number;
  angle: number;
  ledCount: number;
  width: number;
  height: number;
  outlinePath: string;  // Pre-transformed path in screen coordinates
  ledPositions: { x: number; y: number; id: string }[];
  // Joint connections at each end
  startJointId: string | null;
  endJointId: string | null;
  // Calculated endpoints
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
}

export interface Street {
  id: string;
  d: string;  // Pre-transformed path in screen coordinates
  color: string;
  hasLeds: boolean;
}

export interface Layer4Path {
  id: string;
  d: string;  // Pre-transformed path in screen coordinates
  color: string;
}

// Joint where PCBs connect
export interface Joint {
  id: string;
  x: number;
  y: number;
  name?: string;
  // Which PCBs connect at this joint and at which end
  connections: {
    pcbId: string;
    end: 'start' | 'end';
  }[];
}

export interface MapData {
  viewBox: { width: number; height: number };
  streets: Street[];
  pcbs: PCB[];
  layer4: Layer4Path[];
  joints: Joint[];
}

// Chain configuration types
export interface PCBConnection {
  pcbId: string;
  entryEnd: 'start' | 'end';    // Which end the chain enters this PCB
  exitEnd: 'start' | 'end';     // Which end the chain exits this PCB
  inputFrom: string | null;
  outputPath: 2 | 3;
  outputTo: string | null;
}

export interface Chain {
  id: string;
  name: string;
  color: string;
  startPoint: { x: number; y: number };
  connections: PCBConnection[];
}

// Slot assignment for a PCB - up to 3 chains can pass through
export interface PCBSlotAssignment {
  slotA: string | null;  // chainId - controls LED color
  slotB: string | null;  // chainId
  slotC: string | null;  // chainId
}

export interface ChainConfig {
  chains: Chain[];
  pcbSlots: Record<string, PCBSlotAssignment>;  // pcbId -> slots
}

// Controller configuration - joints connected to main controller
export const MAIN_CONTROLLER_JOINTS = [
  'joint-63', 'joint-61', 'joint-78', 'joint-71', 'joint-67'
] as const;

// Bridge controller joints - allows crossing between sections
export const BRIDGE_CONTROLLER_JOINTS = [
  'joint-24', 'joint-20', 'joint-16', 'joint-81', 'joint-84'
] as const;

// Starting points for chains (custom PCBs)
export const CHAIN_START_POINTS = [
  { id: 'custom-pcb-1', x: 1915, y: 1735, name: 'Main Controller' },
  { id: 'custom-pcb-2', x: 958, y: 2270, name: 'Secondary Controller' },
] as const;

// Default chain colors matching Layer 4
export const CHAIN_COLORS = [
  { id: 'blue', color: '#0c71ce', name: 'Blue' },
  { id: 'yellow', color: '#fcee21', name: 'Yellow' },
  { id: 'red', color: '#ff1d25', name: 'Red' },
  { id: 'green', color: '#7ac943', name: 'Green' },
  { id: 'pink', color: '#ff7bac', name: 'Pink' },
  { id: 'darkblue', color: '#0000ff', name: 'Dark Blue' },
  { id: 'orange', color: '#f7931e', name: 'Orange' },
  { id: 'brown', color: '#8c6239', name: 'Brown' },
  { id: 'gray', color: '#666666', name: 'Gray' },
] as const;
