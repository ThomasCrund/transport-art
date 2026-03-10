import { useState, useCallback, useEffect } from 'react';
import type { MapData, Joint, PCB } from '@/types/map-data';

const API_URL = 'http://localhost:3001';

export function useMapData(initialData: MapData) {
  const [data, setData] = useState<MapData>(initialData);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Update data when initial data changes
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Reload data from server
  const reloadData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/map-data`);
      if (!response.ok) throw new Error('Failed to load map data');
      const freshData = await response.json() as MapData;
      if (!freshData.joints) freshData.joints = [];
      setData(freshData);
      setHasChanges(false);
      return true;
    } catch (error) {
      console.error('Failed to reload map data:', error);
      return false;
    }
  }, []);

  // Save data to server
  const saveData = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/map-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setHasChanges(false);
      setLastSaved(new Date());
      return true;
    } catch (error) {
      console.error('Failed to save map data:', error);
      return false;
    } finally {
      setSaving(false);
    }
  }, [data]);

  // Create a new joint at a position
  const createJoint = useCallback((x: number, y: number, name?: string): Joint => {
    const newJoint: Joint = {
      id: `joint-${Date.now()}`,
      x,
      y,
      name,
      connections: [],
    };

    setData(prev => ({
      ...prev,
      joints: [...prev.joints, newJoint],
    }));
    setHasChanges(true);

    return newJoint;
  }, []);

  // Delete a joint
  const deleteJoint = useCallback((jointId: string) => {
    setData(prev => {
      // Remove joint references from PCBs
      const updatedPcbs = prev.pcbs.map(pcb => ({
        ...pcb,
        startJointId: pcb.startJointId === jointId ? null : pcb.startJointId,
        endJointId: pcb.endJointId === jointId ? null : pcb.endJointId,
      }));

      return {
        ...prev,
        pcbs: updatedPcbs,
        joints: prev.joints.filter(j => j.id !== jointId),
      };
    });
    setHasChanges(true);
  }, []);

  // Update joint position
  const updateJointPosition = useCallback((jointId: string, x: number, y: number) => {
    setData(prev => ({
      ...prev,
      joints: prev.joints.map(j =>
        j.id === jointId ? { ...j, x, y } : j
      ),
    }));
    setHasChanges(true);
  }, []);

  // Update joint name
  const updateJointName = useCallback((jointId: string, name: string) => {
    setData(prev => ({
      ...prev,
      joints: prev.joints.map(j =>
        j.id === jointId ? { ...j, name: name || undefined } : j
      ),
    }));
    setHasChanges(true);
  }, []);

  // Connect a PCB end to a joint
  const connectPcbToJoint = useCallback((pcbId: string, end: 'start' | 'end', jointId: string) => {
    setData(prev => {
      // Update PCB
      const updatedPcbs = prev.pcbs.map(pcb => {
        if (pcb.id !== pcbId) return pcb;
        return {
          ...pcb,
          [end === 'start' ? 'startJointId' : 'endJointId']: jointId,
        };
      });

      // Update joint connections
      const updatedJoints = prev.joints.map(joint => {
        if (joint.id !== jointId) return joint;

        // Remove existing connection for this PCB end if any
        const filteredConnections = joint.connections.filter(
          c => !(c.pcbId === pcbId && c.end === end)
        );

        return {
          ...joint,
          connections: [...filteredConnections, { pcbId, end }],
        };
      });

      // Remove from old joint if was connected elsewhere
      const pcb = prev.pcbs.find(p => p.id === pcbId);
      const oldJointId = end === 'start' ? pcb?.startJointId : pcb?.endJointId;
      if (oldJointId && oldJointId !== jointId) {
        const oldJointIndex = updatedJoints.findIndex(j => j.id === oldJointId);
        if (oldJointIndex >= 0) {
          updatedJoints[oldJointIndex] = {
            ...updatedJoints[oldJointIndex],
            connections: updatedJoints[oldJointIndex].connections.filter(
              c => !(c.pcbId === pcbId && c.end === end)
            ),
          };
        }
      }

      return {
        ...prev,
        pcbs: updatedPcbs,
        joints: updatedJoints,
      };
    });
    setHasChanges(true);
  }, []);

  // Disconnect a PCB end from its joint
  const disconnectPcbFromJoint = useCallback((pcbId: string, end: 'start' | 'end') => {
    setData(prev => {
      const pcb = prev.pcbs.find(p => p.id === pcbId);
      const jointId = end === 'start' ? pcb?.startJointId : pcb?.endJointId;

      if (!jointId) return prev;

      // Update PCB
      const updatedPcbs = prev.pcbs.map(p => {
        if (p.id !== pcbId) return p;
        return {
          ...p,
          [end === 'start' ? 'startJointId' : 'endJointId']: null,
        };
      });

      // Update joint
      const updatedJoints = prev.joints.map(joint => {
        if (joint.id !== jointId) return joint;
        return {
          ...joint,
          connections: joint.connections.filter(
            c => !(c.pcbId === pcbId && c.end === end)
          ),
        };
      });

      return {
        ...prev,
        pcbs: updatedPcbs,
        joints: updatedJoints,
      };
    });
    setHasChanges(true);
  }, []);

  // Get joint by ID
  const getJoint = useCallback((jointId: string): Joint | undefined => {
    return data.joints.find(j => j.id === jointId);
  }, [data.joints]);

  // Get PCB by ID
  const getPcb = useCallback((pcbId: string): PCB | undefined => {
    return data.pcbs.find(p => p.id === pcbId);
  }, [data.pcbs]);

  // Find joints near a position
  const findNearbyJoints = useCallback((x: number, y: number, radius: number = 50): Joint[] => {
    return data.joints.filter(joint => {
      const dist = Math.sqrt(Math.pow(joint.x - x, 2) + Math.pow(joint.y - y, 2));
      return dist <= radius;
    });
  }, [data.joints]);

  // Export data as JSON string
  const exportData = useCallback((): string => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  // Import data from JSON string
  const importData = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as MapData;
      setData(parsed);
      setHasChanges(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    data,
    hasChanges,
    saving,
    lastSaved,
    saveData,
    reloadData,
    createJoint,
    deleteJoint,
    updateJointPosition,
    updateJointName,
    connectPcbToJoint,
    disconnectPcbFromJoint,
    getJoint,
    getPcb,
    findNearbyJoints,
    exportData,
    importData,
  };
}
