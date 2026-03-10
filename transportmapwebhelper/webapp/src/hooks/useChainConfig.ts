import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Chain, PCBConnection, PCB, Joint, PCBSlotAssignment } from '@/types/map-data';
import { CHAIN_COLORS, CHAIN_START_POINTS, MAIN_CONTROLLER_JOINTS, BRIDGE_CONTROLLER_JOINTS } from '@/types/map-data';

const API_URL = 'http://localhost:3001';

export interface ChainState {
  chains: Chain[];
  pcbSlots: Record<string, PCBSlotAssignment>;
  selectedChainId: string | null;
  selectedPcbId: string | null;  // For showing slot panel
}

export function useChainConfig(pcbs: PCB[], joints: Joint[]) {
  const [state, setState] = useState<ChainState>({
    chains: [],
    pcbSlots: {},
    selectedChainId: null,
    selectedPcbId: null,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load chain config from server
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/chain-config`);
      const data = await res.json() as { chains: Chain[]; pcbSlots?: Record<string, PCBSlotAssignment> };
      setState(prev => ({
        ...prev,
        chains: data.chains || [],
        pcbSlots: data.pcbSlots || {},
      }));
      setHasChanges(false);
      return true;
    } catch (err) {
      console.error('Failed to load chain config:', err);
      return false;
    }
  }, []);

  // Load on mount
  useEffect(() => {
    if (loaded) return;
    loadConfig().then(() => setLoaded(true));
  }, [loaded, loadConfig]);

  // Save chain config to server
  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/chain-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chains: state.chains, pcbSlots: state.pcbSlots }),
      });
      if (!response.ok) throw new Error('Failed to save chain config');
      setHasChanges(false);
      setLastSaved(new Date());
      return true;
    } catch (error) {
      console.error('Failed to save chain config:', error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [state.chains, state.pcbSlots]);

  // Helper to mark data as changed
  const markChanged = useCallback(() => setHasChanges(true), []);

  // Check if a joint is a bridge controller joint
  const isBridgeJoint = useCallback((jointId: string): boolean => {
    return (BRIDGE_CONTROLLER_JOINTS as readonly string[]).includes(jointId);
  }, []);

  // Check if a joint is a main controller joint
  const isMainControllerJoint = useCallback((jointId: string): boolean => {
    return (MAIN_CONTROLLER_JOINTS as readonly string[]).includes(jointId);
  }, []);

  // Get PCBs connected to a specific joint
  const getPcbsAtJoint = useCallback((jointId: string): { pcb: PCB; end: 'start' | 'end' }[] => {
    const joint = joints.find(j => j.id === jointId);
    if (!joint) return [];

    return joint.connections
      .map(conn => {
        const pcb = pcbs.find(p => p.id === conn.pcbId);
        return pcb ? { pcb, end: conn.end } : null;
      })
      .filter((item): item is { pcb: PCB; end: 'start' | 'end' } => item !== null);
  }, [joints, pcbs]);

  // Get PCBs connected to the main controller (valid first PCBs for chains)
  const getValidFirstPcbs = useCallback((): PCB[] => {
    const validPcbs: PCB[] = [];
    const seenIds = new Set<string>();

    for (const jointId of MAIN_CONTROLLER_JOINTS) {
      const pcbsAtJoint = getPcbsAtJoint(jointId);
      for (const { pcb } of pcbsAtJoint) {
        if (!seenIds.has(pcb.id)) {
          seenIds.add(pcb.id);
          validPcbs.push(pcb);
        }
      }
    }

    return validPcbs;
  }, [getPcbsAtJoint]);

  // Get the exit joint ID for a connection
  const getExitJointId = useCallback((connection: PCBConnection): string | null => {
    const pcb = pcbs.find(p => p.id === connection.pcbId);
    if (!pcb) return null;
    return connection.exitEnd === 'start' ? pcb.startJointId : pcb.endJointId;
  }, [pcbs]);

  // Get PCBs connected to a specific joint (excluding a given PCB)
  const getPcbsAtJointExcluding = useCallback((jointId: string, excludePcbId?: string): { pcb: PCB; end: 'start' | 'end' }[] => {
    const pcbsAtJoint = getPcbsAtJoint(jointId);
    return excludePcbId
      ? pcbsAtJoint.filter(({ pcb }) => pcb.id !== excludePcbId)
      : pcbsAtJoint;
  }, [getPcbsAtJoint]);

  // Get destinations reachable via bridge controller from a joint
  const getBridgeDestinations = useCallback((fromJointId: string): { pcb: PCB; viaJoint: string; end: 'start' | 'end' }[] => {
    if (!isBridgeJoint(fromJointId)) return [];

    const destinations: { pcb: PCB; viaJoint: string; end: 'start' | 'end' }[] = [];
    const seenIds = new Set<string>();

    // Get PCBs at the origin joint to exclude them
    const originPcbs = getPcbsAtJoint(fromJointId);
    for (const { pcb } of originPcbs) {
      seenIds.add(pcb.id);
    }

    // Get PCBs connected to other bridge controller joints
    for (const jointId of BRIDGE_CONTROLLER_JOINTS) {
      if (jointId === fromJointId) continue;

      const pcbsAtJoint = getPcbsAtJoint(jointId);
      for (const { pcb, end } of pcbsAtJoint) {
        if (!seenIds.has(pcb.id)) {
          seenIds.add(pcb.id);
          destinations.push({ pcb, viaJoint: jointId, end });
        }
      }
    }

    return destinations;
  }, [isBridgeJoint, getPcbsAtJoint]);

  // Get destinations reachable via main controller from a joint (all main controller joints are interconnected)
  const getMainControllerDestinations = useCallback((fromJointId: string): { pcb: PCB; viaJoint: string; end: 'start' | 'end' }[] => {
    if (!isMainControllerJoint(fromJointId)) return [];

    const destinations: { pcb: PCB; viaJoint: string; end: 'start' | 'end' }[] = [];
    const seenIds = new Set<string>();

    // Get PCBs at the origin joint to exclude them
    const originPcbs = getPcbsAtJoint(fromJointId);
    for (const { pcb } of originPcbs) {
      seenIds.add(pcb.id);
    }

    // Get PCBs connected to other main controller joints
    for (const jointId of MAIN_CONTROLLER_JOINTS) {
      if (jointId === fromJointId) continue;

      const pcbsAtJoint = getPcbsAtJoint(jointId);
      for (const { pcb, end } of pcbsAtJoint) {
        if (!seenIds.has(pcb.id)) {
          seenIds.add(pcb.id);
          destinations.push({ pcb, viaJoint: jointId, end });
        }
      }
    }

    return destinations;
  }, [isMainControllerJoint, getPcbsAtJoint]);

  // Get valid next PCBs for a chain (directional — only from exit end of last PCB)
  const getValidNextPcbs = useCallback((chainId: string): PCB[] => {
    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return [];

    // If chain is empty, return valid first PCBs
    if (chain.connections.length === 0) {
      return getValidFirstPcbs();
    }

    // Get the last connection and its exit joint
    const lastConnection = chain.connections[chain.connections.length - 1];
    const exitJointId = getExitJointId(lastConnection);
    if (!exitJointId) return [];

    const lastPcb = pcbs.find(p => p.id === lastConnection.pcbId);
    if (!lastPcb) return [];

    const validPcbs: PCB[] = [];
    const seenIds = new Set<string>();

    // Get PCBs at the exit joint (excluding the last PCB itself for direct connections)
    const pcbsAtExit = getPcbsAtJointExcluding(exitJointId, lastPcb.id);
    for (const { pcb } of pcbsAtExit) {
      if (!seenIds.has(pcb.id)) {
        seenIds.add(pcb.id);
        validPcbs.push(pcb);
      }
    }

    // Check for bridge destinations if exit joint is a bridge joint
    if (isBridgeJoint(exitJointId)) {
      const bridgeDestinations = getBridgeDestinations(exitJointId);
      for (const { pcb: bridgePcb } of bridgeDestinations) {
        if (!seenIds.has(bridgePcb.id)) {
          seenIds.add(bridgePcb.id);
          validPcbs.push(bridgePcb);
        }
      }
    }

    // Check for main controller destinations (all main controller joints are interconnected)
    if (isMainControllerJoint(exitJointId)) {
      const mainDestinations = getMainControllerDestinations(exitJointId);
      for (const { pcb: mainPcb } of mainDestinations) {
        if (!seenIds.has(mainPcb.id)) {
          seenIds.add(mainPcb.id);
          validPcbs.push(mainPcb);
        }
      }
    }

    // Allow go-back: the last PCB itself is valid if it has an available slot
    // (entering from exitEnd, exiting from entryEnd — reverse direction)
    if (!seenIds.has(lastPcb.id)) {
      seenIds.add(lastPcb.id);
      validPcbs.push(lastPcb);
    }

    return validPcbs;
  }, [state.chains, pcbs, getValidFirstPcbs, getExitJointId, getPcbsAtJointExcluding, isBridgeJoint, getBridgeDestinations, isMainControllerJoint, getMainControllerDestinations]);

  // Get slot assignments for a PCB
  const getPcbSlots = useCallback((pcbId: string): PCBSlotAssignment => {
    return state.pcbSlots[pcbId] || { slotA: null, slotB: null, slotC: null };
  }, [state.pcbSlots]);

  // Get all chains running through a PCB
  const getPcbChains = useCallback((pcbId: string): Chain[] => {
    return state.chains.filter(chain =>
      chain.connections.some(conn => conn.pcbId === pcbId)
    );
  }, [state.chains]);

  // Get next available slot for a PCB
  const getNextAvailableSlot = useCallback((pcbId: string): 'slotA' | 'slotB' | 'slotC' | null => {
    const slots = getPcbSlots(pcbId);
    if (!slots.slotA) return 'slotA';
    if (!slots.slotB) return 'slotB';
    if (!slots.slotC) return 'slotC';
    return null;
  }, [getPcbSlots]);

  // Set slot assignment for a PCB
  const setSlotAssignment = useCallback((pcbId: string, slot: 'slotA' | 'slotB' | 'slotC', chainId: string | null) => {
    setState(prev => ({
      ...prev,
      pcbSlots: {
        ...prev.pcbSlots,
        [pcbId]: {
          ...prev.pcbSlots[pcbId] || { slotA: null, slotB: null, slotC: null },
          [slot]: chainId,
        },
      },
    }));
    markChanged();
  }, [markChanged]);

  // Swap two slot assignments for a PCB
  const swapSlots = useCallback((pcbId: string, slotA: 'slotA' | 'slotB' | 'slotC', slotB: 'slotA' | 'slotB' | 'slotC') => {
    setState(prev => {
      const currentSlots = prev.pcbSlots[pcbId] || { slotA: null, slotB: null, slotC: null };
      const tempA = currentSlots[slotA];
      const tempB = currentSlots[slotB];

      return {
        ...prev,
        pcbSlots: {
          ...prev.pcbSlots,
          [pcbId]: {
            ...currentSlots,
            [slotA]: tempB,
            [slotB]: tempA,
          },
        },
      };
    });
    markChanged();
  }, [markChanged]);

  // Create a new chain
  const createChain = useCallback((name: string, startPointId: string, colorId: string) => {
    const startPoint = CHAIN_START_POINTS.find(sp => sp.id === startPointId);
    const color = CHAIN_COLORS.find(c => c.id === colorId);

    if (!startPoint || !color) return;

    const newChain: Chain = {
      id: `chain-${Date.now()}`,
      name,
      color: color.color,
      startPoint: { x: startPoint.x, y: startPoint.y },
      connections: [],
    };

    setState(prev => ({
      ...prev,
      chains: [...prev.chains, newChain],
      selectedChainId: newChain.id,
    }));
    markChanged();

    return newChain.id;
  }, [markChanged]);

  // Delete a chain
  const deleteChain = useCallback((chainId: string) => {
    setState(prev => {
      // Clear slot assignments for this chain
      const newPcbSlots = { ...prev.pcbSlots };
      for (const pcbId in newPcbSlots) {
        const slots = newPcbSlots[pcbId];
        if (slots.slotA === chainId) slots.slotA = null;
        if (slots.slotB === chainId) slots.slotB = null;
        if (slots.slotC === chainId) slots.slotC = null;
        // Clean up empty slot objects
        if (!slots.slotA && !slots.slotB && !slots.slotC) {
          delete newPcbSlots[pcbId];
        }
      }

      return {
        ...prev,
        chains: prev.chains.filter(c => c.id !== chainId),
        pcbSlots: newPcbSlots,
        selectedChainId: prev.selectedChainId === chainId ? null : prev.selectedChainId,
      };
    });
    markChanged();
  }, [markChanged]);

  // Select a chain
  const selectChain = useCallback((chainId: string | null) => {
    setState(prev => ({ ...prev, selectedChainId: chainId, selectedPcbId: null }));
  }, []);

  // Select a PCB (for slot panel)
  const selectPcb = useCallback((pcbId: string | null) => {
    setState(prev => ({ ...prev, selectedPcbId: pcbId }));
  }, []);

  // Determine entry end for the first PCB in a chain (which end connects to a main controller joint)
  const getFirstPcbEntryEnd = useCallback((pcbId: string): 'start' | 'end' => {
    const pcb = pcbs.find(p => p.id === pcbId);
    if (!pcb) return 'start';

    // Check which end connects to a main controller joint
    if (pcb.startJointId && isMainControllerJoint(pcb.startJointId)) return 'start';
    if (pcb.endJointId && isMainControllerJoint(pcb.endJointId)) return 'end';

    // Fallback: default to 'start'
    return 'start';
  }, [pcbs, isMainControllerJoint]);

  // Determine entry end for a subsequent PCB based on the shared joint with the previous connection's exit
  const getSubsequentPcbEntryEnd = useCallback((pcbId: string, prevExitJointId: string): 'start' | 'end' => {
    const pcb = pcbs.find(p => p.id === pcbId);
    if (!pcb) return 'start';

    // The entry end is whichever end shares the joint with the previous PCB's exit
    if (pcb.startJointId === prevExitJointId) return 'start';
    if (pcb.endJointId === prevExitJointId) return 'end';

    // For bridge connections, check if the entry end connects to any bridge joint
    // (the previous exit was a bridge joint, so any bridge joint on this PCB is the entry)
    if (isBridgeJoint(prevExitJointId)) {
      if (pcb.startJointId && isBridgeJoint(pcb.startJointId)) return 'start';
      if (pcb.endJointId && isBridgeJoint(pcb.endJointId)) return 'end';
    }

    return 'start';
  }, [pcbs, isBridgeJoint]);

  // Add PCB to chain with joint connectivity validation and directional entry/exit
  const addPcbToChain = useCallback((chainId: string, pcbId: string): boolean => {
    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return false;

    // Validate joint connectivity
    const validNextPcbs = getValidNextPcbs(chainId);
    if (!validNextPcbs.some(p => p.id === pcbId)) {
      return false;
    }

    // Determine if this is a go-back (same PCB as the last connection)
    const lastConnection = chain.connections.length > 0
      ? chain.connections[chain.connections.length - 1]
      : null;
    const isGoBack = lastConnection !== null && lastConnection.pcbId === pcbId;

    // Check for available slot
    const nextSlot = getNextAvailableSlot(pcbId);
    if (!nextSlot) {
      return false; // All slots full
    }

    // Determine entry and exit ends
    let entryEnd: 'start' | 'end';
    let exitEnd: 'start' | 'end';

    if (isGoBack) {
      // Go-back: reverse direction from the last connection
      entryEnd = lastConnection.exitEnd;
      exitEnd = lastConnection.entryEnd;
    } else if (chain.connections.length === 0) {
      // First PCB: entry end is the end connecting to main controller
      entryEnd = getFirstPcbEntryEnd(pcbId);
      exitEnd = entryEnd === 'start' ? 'end' : 'start';
    } else {
      // Subsequent PCB: entry end is the end sharing a joint with previous exit
      const prevExitJointId = getExitJointId(lastConnection!);
      if (!prevExitJointId) return false;
      entryEnd = getSubsequentPcbEntryEnd(pcbId, prevExitJointId);
      exitEnd = entryEnd === 'start' ? 'end' : 'start';
    }

    setState(prev => {
      const targetChain = prev.chains.find(c => c.id === chainId);
      if (!targetChain) return prev;

      const inputFrom = lastConnection?.pcbId ?? null;

      // Update the previous PCB's outputTo
      const updatedConnections = targetChain.connections.map((conn, idx) => {
        if (idx === targetChain.connections.length - 1) {
          return { ...conn, outputTo: pcbId };
        }
        return conn;
      });

      const newConnection: PCBConnection = {
        pcbId,
        entryEnd,
        exitEnd,
        inputFrom,
        outputPath: 2,
        outputTo: null,
      };

      // Update slot assignment
      const currentSlots = prev.pcbSlots[pcbId] || { slotA: null, slotB: null, slotC: null };

      return {
        ...prev,
        chains: prev.chains.map(c =>
          c.id === chainId
            ? { ...c, connections: [...updatedConnections, newConnection] }
            : c
        ),
        pcbSlots: {
          ...prev.pcbSlots,
          [pcbId]: {
            ...currentSlots,
            [nextSlot]: chainId,
          },
        },
      };
    });
    markChanged();

    return true;
  }, [state.chains, getValidNextPcbs, getNextAvailableSlot, getExitJointId, getFirstPcbEntryEnd, getSubsequentPcbEntryEnd, markChanged]);

  // Remove PCB from chain
  const removePcbFromChain = useCallback((chainId: string, pcbId: string) => {
    setState(prev => {
      const chain = prev.chains.find(c => c.id === chainId);
      if (!chain) return prev;

      const pcbIndex = chain.connections.findIndex(c => c.pcbId === pcbId);
      if (pcbIndex === -1) return prev;

      // Remove the PCB and update connections
      const newConnections = chain.connections.filter(c => c.pcbId !== pcbId);

      // Update the previous PCB's outputTo
      if (pcbIndex > 0 && newConnections.length > 0) {
        const prevIdx = pcbIndex - 1;
        if (prevIdx < newConnections.length) {
          newConnections[prevIdx] = {
            ...newConnections[prevIdx],
            outputTo: pcbIndex < chain.connections.length - 1
              ? chain.connections[pcbIndex + 1].pcbId
              : null,
          };
        }
      }

      // Update inputFrom for the next PCB
      if (pcbIndex < newConnections.length) {
        newConnections[pcbIndex] = {
          ...newConnections[pcbIndex],
          inputFrom: pcbIndex > 0 ? newConnections[pcbIndex - 1].pcbId : null,
        };
      }

      // Clear slot assignment for this chain
      const currentSlots = prev.pcbSlots[pcbId] || { slotA: null, slotB: null, slotC: null };
      const newSlots = { ...currentSlots };
      if (newSlots.slotA === chainId) newSlots.slotA = null;
      if (newSlots.slotB === chainId) newSlots.slotB = null;
      if (newSlots.slotC === chainId) newSlots.slotC = null;

      const newPcbSlots = { ...prev.pcbSlots };
      if (!newSlots.slotA && !newSlots.slotB && !newSlots.slotC) {
        delete newPcbSlots[pcbId];
      } else {
        newPcbSlots[pcbId] = newSlots;
      }

      return {
        ...prev,
        chains: prev.chains.map(c =>
          c.id === chainId ? { ...c, connections: newConnections } : c
        ),
        pcbSlots: newPcbSlots,
      };
    });
    markChanged();
  }, [markChanged]);

  // Set output path for a PCB in a chain
  const setOutputPath = useCallback((chainId: string, pcbId: string, outputPath: 2 | 3) => {
    setState(prev => ({
      ...prev,
      chains: prev.chains.map(chain =>
        chain.id === chainId
          ? {
              ...chain,
              connections: chain.connections.map(conn =>
                conn.pcbId === pcbId ? { ...conn, outputPath } : conn
              ),
            }
          : chain
      ),
    }));
    markChanged();
  }, [markChanged]);

  // Get the nth PCBConnection for a given PCB within a chain (handles go-back duplicates)
  const getConnectionForPcbInChain = useCallback((pcbId: string, chainId: string, occurrenceIndex: number): PCBConnection | null => {
    const chain = state.chains.find(c => c.id === chainId);
    if (!chain) return null;

    let count = 0;
    for (const conn of chain.connections) {
      if (conn.pcbId === pcbId) {
        if (count === occurrenceIndex) return conn;
        count++;
      }
    }
    return null;
  }, [state.chains]);

  // Get chain info for a specific PCB (returns info for first chain found)
  const getPcbChainInfo = useCallback((pcbId: string) => {
    for (const chain of state.chains) {
      const connection = chain.connections.find(c => c.pcbId === pcbId);
      if (connection) {
        const index = chain.connections.findIndex(c => c.pcbId === pcbId);
        return {
          chain,
          connection,
          index,
          isFirst: index === 0,
          isLast: index === chain.connections.length - 1,
        };
      }
    }
    return null;
  }, [state.chains]);

  // Check if a PCB is a valid next step for the selected chain
  const isValidNextPcb = useCallback((pcbId: string): boolean => {
    if (!state.selectedChainId) return false;
    const validPcbs = getValidNextPcbs(state.selectedChainId);
    return validPcbs.some(p => p.id === pcbId);
  }, [state.selectedChainId, getValidNextPcbs]);

  // Get the LED color for a PCB based on slot A assignment
  const getPcbLedColor = useCallback((pcbId: string): string | null => {
    const slots = getPcbSlots(pcbId);
    if (!slots.slotA) return null;

    const chain = state.chains.find(c => c.id === slots.slotA);
    return chain?.color || null;
  }, [getPcbSlots, state.chains]);

  // Export chain config as JSON
  const exportConfig = useCallback(() => {
    return JSON.stringify({ chains: state.chains, pcbSlots: state.pcbSlots }, null, 2);
  }, [state.chains, state.pcbSlots]);

  // Import chain config from JSON
  const importConfig = useCallback((json: string) => {
    try {
      const data = JSON.parse(json) as { chains: Chain[]; pcbSlots?: Record<string, PCBSlotAssignment> };
      setState(prev => ({
        ...prev,
        chains: data.chains,
        pcbSlots: data.pcbSlots || {},
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Memoized list of valid first PCBs
  const validFirstPcbs = useMemo(() => getValidFirstPcbs(), [getValidFirstPcbs]);

  return {
    ...state,
    hasChanges,
    saving,
    lastSaved,
    saveConfig,
    loadConfig,
    createChain,
    deleteChain,
    selectChain,
    selectPcb,
    addPcbToChain,
    removePcbFromChain,
    setOutputPath,
    getPcbChainInfo,
    getConnectionForPcbInChain,
    getValidNextPcbs,
    getValidFirstPcbs,
    validFirstPcbs,
    isValidNextPcb,
    getPcbSlots,
    getPcbChains,
    setSlotAssignment,
    swapSlots,
    getPcbLedColor,
    isBridgeJoint,
    isMainControllerJoint,
    exportConfig,
    importConfig,
  };
}
