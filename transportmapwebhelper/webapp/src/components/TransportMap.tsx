import { useState, useRef, useEffect } from "react"
import type { MapData, Street, PCB, Layer4Path, Joint } from "@/types/map-data"
import { CHAIN_START_POINTS, CHAIN_COLORS } from "@/types/map-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useChainConfig } from "@/hooks/useChainConfig"
import { useMapData } from "@/hooks/useMapData"

interface TransportMapProps {
  data: MapData
}

interface LayerVisibility {
  streetsWithLeds: boolean
  streetsWithoutLeds: boolean
  pcbs: boolean
  leds: boolean
  slotLines: boolean
  chainIndicators: boolean
  layer4: boolean
  chainPaths: boolean
  startPoints: boolean
  joints: boolean
  pcbEndpoints: boolean
}

type SelectedItem =
  | { type: 'street'; item: Street }
  | { type: 'pcb'; item: PCB }
  | { type: 'layer4'; item: Layer4Path }
  | { type: 'joint'; item: Joint }
  | null

// Slot Panel Component for viewing/editing PCB slot assignments
function PCBSlotPanel({
  pcb,
  chainConfig,
  onClose,
}: {
  pcb: PCB
  chainConfig: ReturnType<typeof useChainConfig>
  onClose: () => void
}) {
  const slots = chainConfig.getPcbSlots(pcb.id)
  const pcbChains = chainConfig.getPcbChains(pcb.id)

  const getChainForSlot = (chainId: string | null) => {
    if (!chainId) return null
    return chainConfig.chains.find(c => c.id === chainId)
  }

  const slotData = [
    { key: 'slotA' as const, label: 'A', chainId: slots.slotA, isController: true },
    { key: 'slotB' as const, label: 'B', chainId: slots.slotB, isController: false },
    { key: 'slotC' as const, label: 'C', chainId: slots.slotC, isController: false },
  ]

  const handleMoveUp = (slotKey: 'slotB' | 'slotC') => {
    const targetSlot = slotKey === 'slotB' ? 'slotA' : 'slotB'
    chainConfig.swapSlots(pcb.id, slotKey, targetSlot)
  }

  const handleMoveDown = (slotKey: 'slotA' | 'slotB') => {
    const targetSlot = slotKey === 'slotA' ? 'slotB' : 'slotC'
    chainConfig.swapSlots(pcb.id, slotKey, targetSlot)
  }

  const handleRemoveFromChain = (chainId: string) => {
    chainConfig.removePcbFromChain(chainId, pcb.id)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">PCB Slots: {pcb.id}</CardTitle>
          <Button size="sm" variant="ghost" onClick={onClose}>
            &times;
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{pcb.ledCount} LED{pcb.ledCount !== 1 ? 's' : ''}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {slotData.map((slot, idx) => {
          const chain = getChainForSlot(slot.chainId)
          return (
            <div
              key={slot.key}
              className={`flex items-center gap-2 p-2 rounded border ${
                slot.isController ? 'border-primary bg-primary/10' : 'border-border'
              }`}
            >
              <span className="font-bold w-6">{slot.label}</span>
              {chain ? (
                <>
                  <div
                    className="w-4 h-4 rounded-full border border-white/50"
                    style={{ backgroundColor: chain.color }}
                  />
                  <span className="flex-1 text-sm truncate">{chain.name}</span>
                  <div className="flex gap-1">
                    {idx > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleMoveUp(slot.key as 'slotB' | 'slotC')}
                      >
                        &uarr;
                      </Button>
                    )}
                    {idx < 2 && slotData[idx + 1].chainId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleMoveDown(slot.key as 'slotA' | 'slotB')}
                      >
                        &darr;
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Empty</span>
              )}
              {slot.isController && chain && (
                <span className="text-xs text-primary">(LED)</span>
              )}
            </div>
          )
        })}

        {pcbChains.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-xs text-muted-foreground mb-2">Remove from chain:</p>
            <div className="space-y-1">
              {pcbChains.map(chain => (
                <Button
                  key={chain.id}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleRemoveFromChain(chain.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: chain.color }}
                  />
                  Remove from {chain.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// PCB Slot Lines Component - draws 3 parallel lines through each PCB showing slot occupancy
function PCBSlotLines({
  pcb,
  chainConfig,
}: {
  pcb: PCB
  chainConfig: ReturnType<typeof useChainConfig>
}) {
  const slots = chainConfig.getPcbSlots(pcb.id)

  // Direction vector from startPoint to endPoint
  const dx = pcb.endPoint.x - pcb.startPoint.x
  const dy = pcb.endPoint.y - pcb.startPoint.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return null

  // Unit vectors: along the PCB and perpendicular
  const ux = dx / len
  const uy = dy / len
  // Perpendicular (rotated 90 degrees clockwise)
  const px = -uy
  const py = ux

  const SLOT_SPACING = 6 // pixels between slot lines

  // Slot order: B (left, -1), A (center, 0), C (right, +1)
  const slotDefs = [
    { key: 'slotB' as const, offset: -1, lineWidth: 1.5, arrowSize: 5 },
    { key: 'slotA' as const, offset: 0, lineWidth: 3, arrowSize: 7 },
    { key: 'slotC' as const, offset: 1, lineWidth: 1.5, arrowSize: 5 },
  ]

  // Track occurrence index per chain for go-back support
  const chainOccurrenceCounts: Record<string, number> = {}

  return (
    <g>
      {slotDefs.map(({ key, offset, lineWidth, arrowSize }) => {
        const chainId = slots[key]
        const chain = chainId ? chainConfig.chains.find(c => c.id === chainId) : null

        // Calculate perpendicular offset for this slot line
        const ox = px * offset * SLOT_SPACING
        const oy = py * offset * SLOT_SPACING

        const x1 = pcb.startPoint.x + ox
        const y1 = pcb.startPoint.y + oy
        const x2 = pcb.endPoint.x + ox
        const y2 = pcb.endPoint.y + oy

        const color = chain ? chain.color : '#555'

        // Determine arrow direction for occupied slots
        let arrowFlip = false // false = startPoint→endPoint, true = endPoint→startPoint
        if (chain && chainId) {
          const occIdx = chainOccurrenceCounts[chainId] || 0
          chainOccurrenceCounts[chainId] = occIdx + 1

          const connection = chainConfig.getConnectionForPcbInChain(pcb.id, chainId, occIdx)
          if (connection && connection.entryEnd === 'end') {
            arrowFlip = true
          }
        }

        // Arrow positions along the line (30%, 50%, 70%)
        const arrowPositions = [0.3, 0.5, 0.7]
        const angle = Math.atan2(dy, dx) * (180 / Math.PI) + (arrowFlip ? 180 : 0)

        return (
          <g key={key}>
            <line
              x1={x1} y1={y1}
              x2={x2} y2={y2}
              stroke={color}
              strokeWidth={lineWidth}
              strokeLinecap="round"
              opacity={chain ? 0.9 : 0.4}
            />
            {chain && arrowPositions.map((t) => {
              const ax = x1 + (x2 - x1) * t
              const ay = y1 + (y2 - y1) * t
              const s = arrowSize
              return (
                <polygon
                  key={`${key}-arrow-${t}`}
                  points={`0,${-s / 2} ${s},0 0,${s / 2}`}
                  fill={color}
                  transform={`translate(${ax}, ${ay}) rotate(${angle})`}
                  opacity={0.9}
                />
              )
            })}
          </g>
        )
      })}
    </g>
  )
}

export function TransportMap({ data: initialData }: TransportMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Map data management with save capability
  const mapData = useMapData(initialData)
  const { data } = mapData

  const [visibility, setVisibility] = useState<LayerVisibility>({
    streetsWithLeds: true,
    streetsWithoutLeds: true,
    pcbs: true,
    leds: true,
    slotLines: true,
    chainIndicators: true,
    layer4: true,
    chainPaths: true,
    startPoints: true,
    joints: true,
    pcbEndpoints: true,
  })

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  const [selected, setSelected] = useState<SelectedItem>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)

  // Edit modes
  const [editMode, setEditMode] = useState<'none' | 'joints' | 'chains'>('none')
  const [creatingJoint, setCreatingJoint] = useState(false)
  const [connectingPcb, setConnectingPcb] = useState<{ pcbId: string; end: 'start' | 'end' } | null>(null)

  // Chain configuration - now passes joints as well
  const chainConfig = useChainConfig(data.pcbs, data.joints)
  const [newChainName, setNewChainName] = useState('')
  const [newChainStart, setNewChainStart] = useState<string>(CHAIN_START_POINTS[0].id)
  const [newChainColor, setNewChainColor] = useState<string>(CHAIN_COLORS[0].id)

  // Joint editing
  const [editingJointName, setEditingJointName] = useState('')

  const { width, height } = data.viewBox

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.min(Math.max(z * delta, 0.1), 10))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.shiftKey) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }

    if (svgRef.current) {
      const svg = svgRef.current
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY

      const ctm = svg.getScreenCTM()
      if (ctm) {
        const inverseCTM = ctm.inverse()
        const svgPoint = pt.matrixTransform(inverseCTM)
        setCursorPos({ x: svgPoint.x, y: svgPoint.y })
      }
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleMouseLeave = () => {
    setIsPanning(false)
    setCursorPos(null)
  }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const containerHeight = containerRef.current.clientHeight
      const scaleX = containerWidth / width
      const scaleY = containerHeight / height
      const scale = Math.min(scaleX, scaleY) * 0.95
      setZoom(scale)
    }
  }, [width, height])

  const streetsWithLeds = data.streets.filter(s => s.hasLeds)
  const streetsWithoutLeds = data.streets.filter(s => !s.hasLeds)

  // Calculate statistics
  const totalLeds = data.pcbs.reduce((sum, pcb) => sum + pcb.ledCount, 0)

  // Handle SVG click for creating joints
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!creatingJoint || !cursorPos) return

    e.stopPropagation()
    const newJoint = mapData.createJoint(cursorPos.x, cursorPos.y)
    setSelected({ type: 'joint', item: newJoint })
    setCreatingJoint(false)
  }

  // Handle PCB click
  const handlePcbClick = (pcb: PCB, e: React.MouseEvent) => {
    e.stopPropagation()

    if (editMode === 'chains') {
      if (chainConfig.selectedChainId) {
        // Check if PCB is already in the selected chain
        const selectedChain = chainConfig.chains.find(c => c.id === chainConfig.selectedChainId)
        const isInSelectedChain = selectedChain?.connections.some(c => c.pcbId === pcb.id)

        if (isInSelectedChain) {
          const isValidNext = validNextPcbIds.has(pcb.id)

          if (isValidNext) {
            // Valid next PCB — go-back or revisit after a go-back
            const added = chainConfig.addPcbToChain(chainConfig.selectedChainId, pcb.id)
            if (!added) {
              console.log('Cannot add PCB to chain - slots full')
            }
          } else {
            // Already in this chain and not a valid next step - show slot panel
            chainConfig.selectPcb(pcb.id)
          }
        } else {
          // Try to add to the selected chain (works even if PCB has other chains)
          const added = chainConfig.addPcbToChain(chainConfig.selectedChainId, pcb.id)
          if (!added) {
            console.log('Cannot add PCB to chain - not connected via joints or slots full')
          }
        }
      } else {
        // No chain selected - show slot panel if PCB has chains
        const pcbChains = chainConfig.getPcbChains(pcb.id)
        if (pcbChains.length > 0) {
          chainConfig.selectPcb(pcb.id)
        }
      }
    } else {
      setSelected({ type: 'pcb', item: pcb })
    }
  }

  // Handle PCB endpoint click (for connecting to joints)
  const handleEndpointClick = (pcb: PCB, end: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation()

    if (editMode === 'joints') {
      if (connectingPcb?.pcbId === pcb.id && connectingPcb?.end === end) {
        // Cancel connecting
        setConnectingPcb(null)
      } else {
        // Start connecting
        setConnectingPcb({ pcbId: pcb.id, end })
      }
    }
  }

  // Handle joint click
  const handleJointClick = (joint: Joint, e: React.MouseEvent) => {
    e.stopPropagation()

    if (connectingPcb) {
      // Connect PCB to this joint
      mapData.connectPcbToJoint(connectingPcb.pcbId, connectingPcb.end, joint.id)
      setConnectingPcb(null)
    } else {
      setSelected({ type: 'joint', item: joint })
      setEditingJointName(joint.name || '')
    }
  }

  // Create new chain
  const handleCreateChain = () => {
    if (newChainName.trim()) {
      chainConfig.createChain(newChainName.trim(), newChainStart, newChainColor)
      setNewChainName('')
    }
  }

  // Draw flow arrow between two points
  const FlowArrow = ({ from, to, color }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string }) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    const arrowSize = 15

    return (
      <g>
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={color}
          strokeWidth={3}
          strokeDasharray="8,4"
          opacity={0.8}
        />
        <polygon
          points={`0,${-arrowSize / 2} ${arrowSize},0 0,${arrowSize / 2}`}
          fill={color}
          transform={`translate(${midX}, ${midY}) rotate(${angle})`}
        />
      </g>
    )
  }

  // Get connected PCBs for a joint
  const getJointConnectedPcbs = (joint: Joint) => {
    return joint.connections.map(conn => {
      const pcb = data.pcbs.find(p => p.id === conn.pcbId)
      return { pcb, end: conn.end }
    }).filter(({ pcb }) => pcb)
  }

  // Get valid next PCBs for highlighting
  const validNextPcbIds = new Set(
    chainConfig.selectedChainId
      ? chainConfig.getValidNextPcbs(chainConfig.selectedChainId).map(p => p.id)
      : []
  )

  // Get the selected PCB for slot panel
  const selectedPcbForSlots = chainConfig.selectedPcbId
    ? data.pcbs.find(p => p.id === chainConfig.selectedPcbId)
    : null

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <div className="w-96 bg-muted/50 p-4 overflow-y-auto border-r flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Transport Map PCB Helper</h2>
          <div className="flex gap-1">
            {(mapData.hasChanges || chainConfig.hasChanges) && (
              <Button
                size="sm"
                onClick={async () => {
                  const results = await Promise.all([
                    mapData.hasChanges ? mapData.saveData() : Promise.resolve(true),
                    chainConfig.hasChanges ? chainConfig.saveConfig() : Promise.resolve(true),
                  ])
                  if (!results.every(Boolean)) {
                    console.error('Some saves failed')
                  }
                }}
                disabled={mapData.saving || chainConfig.saving}
              >
                {mapData.saving || chainConfig.saving ? 'Saving...' : 'Save'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await Promise.all([
                  mapData.reloadData(),
                  chainConfig.loadConfig(),
                ])
              }}
            >
              Reload
            </Button>
          </div>
        </div>

        {(mapData.lastSaved || chainConfig.lastSaved) && (
          <p className="text-xs text-muted-foreground">
            Last saved: {(() => {
              const times = [mapData.lastSaved, chainConfig.lastSaved].filter(Boolean) as Date[]
              if (times.length === 0) return ''
              const latest = times.reduce((a, b) => a > b ? a : b)
              return latest.toLocaleTimeString()
            })()}
          </p>
        )}

        {/* Edit Mode Selection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Edit Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={editMode === 'none' ? 'default' : 'outline'}
                onClick={() => { setEditMode('none'); setConnectingPcb(null); setCreatingJoint(false); chainConfig.selectPcb(null) }}
                className="flex-1"
              >
                View
              </Button>
              <Button
                size="sm"
                variant={editMode === 'joints' ? 'default' : 'outline'}
                onClick={() => { setEditMode('joints'); setCreatingJoint(false); chainConfig.selectPcb(null) }}
                className="flex-1"
              >
                Joints
              </Button>
              <Button
                size="sm"
                variant={editMode === 'chains' ? 'default' : 'outline'}
                onClick={() => { setEditMode('chains'); setConnectingPcb(null); setCreatingJoint(false) }}
                className="flex-1"
              >
                Chains
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Layer Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Layers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Streets with LEDs ({streetsWithLeds.length})</span>
              <Switch
                checked={visibility.streetsWithLeds}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, streetsWithLeds: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Streets without LEDs ({streetsWithoutLeds.length})</span>
              <Switch
                checked={visibility.streetsWithoutLeds}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, streetsWithoutLeds: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">PCBs ({data.pcbs.length})</span>
              <Switch
                checked={visibility.pcbs}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, pcbs: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">LEDs</span>
              <Switch
                checked={visibility.leds}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, leds: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Slot Lines</span>
              <Switch
                checked={visibility.slotLines}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, slotLines: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Chain Indicators</span>
              <Switch
                checked={visibility.chainIndicators}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, chainIndicators: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Joints ({data.joints.length})</span>
              <Switch
                checked={visibility.joints}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, joints: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">PCB Endpoints</span>
              <Switch
                checked={visibility.pcbEndpoints}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, pcbEndpoints: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Planned Paths</span>
              <Switch
                checked={visibility.layer4}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, layer4: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Start Points</span>
              <Switch
                checked={visibility.startPoints}
                onCheckedChange={(checked) => setVisibility((v) => ({ ...v, startPoints: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Joint Edit Panel */}
        {editMode === 'joints' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Joint Editor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                size="sm"
                variant={creatingJoint ? 'destructive' : 'default'}
                onClick={() => setCreatingJoint(!creatingJoint)}
                className="w-full"
              >
                {creatingJoint ? 'Cancel' : 'Create Joint at Click'}
              </Button>

              {connectingPcb && (
                <div className="p-2 bg-primary/10 rounded text-sm">
                  Connecting PCB {connectingPcb.pcbId} ({connectingPcb.end} end)
                  <br />
                  <span className="text-muted-foreground">Click a joint to connect</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => setConnectingPcb(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Click PCB endpoints to connect them to joints. Click joints to select and edit.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Chain Controls */}
        {editMode === 'chains' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Chain Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 border-b pb-3">
                <input
                  type="text"
                  placeholder="Chain name..."
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded bg-background"
                />
                <div className="flex gap-2">
                  <select
                    value={newChainStart}
                    onChange={(e) => setNewChainStart(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background"
                  >
                    {CHAIN_START_POINTS.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                  <select
                    value={newChainColor}
                    onChange={(e) => setNewChainColor(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background"
                  >
                    {CHAIN_COLORS.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" onClick={handleCreateChain} className="w-full">
                  Create Chain
                </Button>
              </div>

              <div className="space-y-2">
                {chainConfig.chains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chains created yet</p>
                ) : (
                  chainConfig.chains.map(chain => (
                    <div
                      key={chain.id}
                      className={`p-2 rounded border cursor-pointer ${
                        chainConfig.selectedChainId === chain.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => chainConfig.selectChain(chain.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: chain.color }} />
                          <span className="text-sm font-medium">{chain.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {chain.connections.length} PCBs
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {chainConfig.selectedChainId && (
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    Click highlighted PCBs to add to chain. Click PCBs with chains to edit slots.
                  </p>
                  <p className="text-xs text-green-400">
                    Valid next: {validNextPcbIds.size} PCBs
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* PCB Slot Panel */}
        {editMode === 'chains' && selectedPcbForSlots && (
          <PCBSlotPanel
            pcb={selectedPcbForSlots}
            chainConfig={chainConfig}
            onClose={() => chainConfig.selectPcb(null)}
          />
        )}

        {/* Selected Item Info */}
        {selected && !selectedPcbForSlots && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Selected {selected.type === 'pcb' ? 'PCB' : selected.type === 'joint' ? 'Joint' : selected.type === 'street' ? 'Street' : 'Path'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">ID:</span> {selected.item.id}</div>

              {selected.type === 'pcb' && (
                <>
                  <div><span className="text-muted-foreground">LEDs:</span> {selected.item.ledCount}</div>
                  <div><span className="text-muted-foreground">Position:</span> ({selected.item.x.toFixed(1)}, {selected.item.y.toFixed(1)})</div>
                  <div><span className="text-muted-foreground">Angle:</span> {selected.item.angle.toFixed(1)}°</div>
                  <div className="border-t pt-2 mt-2">
                    <div className="text-muted-foreground">Joint Connections:</div>
                    <div className="text-xs mt-1">
                      Start: {selected.item.startJointId || 'None'}
                    </div>
                    <div className="text-xs">
                      End: {selected.item.endJointId || 'None'}
                    </div>
                  </div>
                </>
              )}

              {selected.type === 'joint' && (
                <>
                  <div><span className="text-muted-foreground">Position:</span> ({selected.item.x.toFixed(1)}, {selected.item.y.toFixed(1)})</div>

                  {editMode === 'joints' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Joint name..."
                        value={editingJointName}
                        onChange={(e) => setEditingJointName(e.target.value)}
                        onBlur={() => mapData.updateJointName(selected.item.id, editingJointName)}
                        className="w-full px-2 py-1 text-sm border rounded bg-background"
                      />
                    </div>
                  )}

                  <div className="border-t pt-2 mt-2">
                    <div className="text-muted-foreground mb-1">Connected PCBs ({selected.item.connections.length}):</div>
                    {getJointConnectedPcbs(selected.item).map(({ pcb, end }) => (
                      pcb && (
                        <div key={`${pcb.id}-${end}`} className="flex items-center justify-between text-xs py-1">
                          <span>{pcb.id} ({end})</span>
                          <span className="text-muted-foreground">{pcb.ledCount} LEDs</span>
                        </div>
                      )
                    ))}
                  </div>

                  {chainConfig.isBridgeJoint(selected.item.id) && (
                    <div className="text-xs text-orange-400 mt-2">
                      Bridge Controller Joint
                    </div>
                  )}

                  {chainConfig.isMainControllerJoint(selected.item.id) && (
                    <div className="text-xs text-green-400 mt-2">
                      Main Controller Joint
                    </div>
                  )}

                  {editMode === 'joints' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full mt-2"
                      onClick={() => {
                        mapData.deleteJoint(selected.item.id)
                        setSelected(null)
                      }}
                    >
                      Delete Joint
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* View Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">View</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
              <button onClick={resetView} className="text-primary hover:underline text-sm">Reset</button>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>PCBs:</span>
              <span className="font-mono">{data.pcbs.length}</span>
            </div>
            <div className="flex justify-between">
              <span>LEDs:</span>
              <span className="font-mono">{totalLeds}</span>
            </div>
            <div className="flex justify-between">
              <span>Joints:</span>
              <span className="font-mono">{data.joints.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map Canvas */}
      <div
        ref={containerRef}
        className="flex-1 bg-gray-900 overflow-hidden relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Overlays */}
        {cursorPos && (
          <div className="absolute bottom-4 left-4 bg-black/80 text-white px-3 py-2 rounded-lg font-mono text-sm z-10 pointer-events-none">
            X: <span className="text-cyan-400">{cursorPos.x.toFixed(1)}</span>
            {' '}Y: <span className="text-cyan-400">{cursorPos.y.toFixed(1)}</span>
          </div>
        )}

        {creatingJoint && (
          <div className="absolute top-4 left-4 bg-green-600 text-white px-3 py-2 rounded-lg text-sm z-10 pointer-events-none">
            Click on the map to create a joint
          </div>
        )}

        {connectingPcb && (
          <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm z-10 pointer-events-none">
            Click a joint to connect {connectingPcb.pcbId} ({connectingPcb.end})
          </div>
        )}

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            cursor: creatingJoint ? "crosshair" : isPanning ? "grabbing" : "grab",
          }}
          onClick={handleSvgClick}
        >
          {/* Background */}
          <rect x="0" y="0" width={width} height={height} fill="#1a1a2e" />

          {/* Layer 4 */}
          {visibility.layer4 && data.layer4.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill="none"
              stroke={path.color}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.5}
            />
          ))}

          {/* Streets */}
          {visibility.streetsWithoutLeds && streetsWithoutLeds.map((street) => (
            <path
              key={street.id}
              d={street.d}
              fill="none"
              stroke={street.color}
              strokeWidth={28}
              strokeLinecap="round"
              opacity={0.6}
            />
          ))}

          {visibility.streetsWithLeds && streetsWithLeds.map((street) => (
            <path
              key={street.id}
              d={street.d}
              fill="none"
              stroke={street.color}
              strokeWidth={28}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}

          {/* Chain flow lines */}
          {visibility.chainPaths && chainConfig.chains.map(chain => {
            const connections = chain.connections
            if (connections.length === 0) return null

            const firstPcb = data.pcbs.find(p => p.id === connections[0].pcbId)

            return (
              <g key={`chain-flow-${chain.id}`}>
                {firstPcb && (
                  <FlowArrow from={chain.startPoint} to={{ x: firstPcb.x, y: firstPcb.y }} color={chain.color} />
                )}
                {connections.map((conn) => {
                  if (!conn.outputTo) return null
                  const fromPcb = data.pcbs.find(p => p.id === conn.pcbId)
                  const toPcb = data.pcbs.find(p => p.id === conn.outputTo)
                  if (!fromPcb || !toPcb) return null
                  return (
                    <FlowArrow
                      key={`flow-${conn.pcbId}-${conn.outputTo}`}
                      from={{ x: fromPcb.x, y: fromPcb.y }}
                      to={{ x: toPcb.x, y: toPcb.y }}
                      color={chain.color}
                    />
                  )
                })}
              </g>
            )
          })}

          {/* Start Points */}
          {visibility.startPoints && CHAIN_START_POINTS.map(sp => (
            <g key={sp.id}>
              <circle cx={sp.x} cy={sp.y} r={25} fill="#ff0000" stroke="#fff" strokeWidth={3} />
              <circle cx={sp.x} cy={sp.y} r={15} fill="#fff" />
              <circle cx={sp.x} cy={sp.y} r={8} fill="#ff0000" />
              <text x={sp.x} y={sp.y + 45} fill="#fff" fontSize={14} textAnchor="middle" fontWeight="bold">
                {sp.name}
              </text>
            </g>
          ))}

          {/* Joint connection lines (show which PCB ends connect to which joints) */}
          {visibility.joints && data.joints.map(joint => (
            <g key={`joint-lines-${joint.id}`}>
              {joint.connections.map(conn => {
                const pcb = data.pcbs.find(p => p.id === conn.pcbId)
                if (!pcb) return null
                const endpoint = conn.end === 'start' ? pcb.startPoint : pcb.endPoint
                return (
                  <line
                    key={`line-${joint.id}-${conn.pcbId}-${conn.end}`}
                    x1={joint.x}
                    y1={joint.y}
                    x2={endpoint.x}
                    y2={endpoint.y}
                    stroke="#00ffff"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                    opacity={0.5}
                  />
                )
              })}
            </g>
          ))}

          {/* PCBs */}
          {visibility.pcbs && data.pcbs.map((pcb) => {
            const isSelected = selected?.type === 'pcb' && selected.item.id === pcb.id
            const isHovered = hoveredId === pcb.id
            const pcbChains = chainConfig.getPcbChains(pcb.id)
            const isInChain = pcbChains.length > 0
            const isValidNext = editMode === 'chains' && chainConfig.selectedChainId && validNextPcbIds.has(pcb.id)
            const isSelectedForSlots = chainConfig.selectedPcbId === pcb.id

            const pcbFill = isSelected ? "#4444ff" : isHovered ? "#3333cc" : "#2222aa"

            // Determine stroke for valid next PCBs
            const strokeColor = isValidNext ? "#00ff00" : isSelectedForSlots ? "#ff00ff" : isSelected ? "#ffffff" : "#6666ff"
            const strokeWidth = isValidNext || isSelectedForSlots ? 4 : isSelected ? 3 : 2

            return (
              <g
                key={pcb.id}
                style={{ cursor: "pointer" }}
                onClick={(e) => handlePcbClick(pcb, e)}
                onMouseEnter={() => setHoveredId(pcb.id)}
                onMouseLeave={() => setHoveredId(null)}
                opacity={editMode === 'chains' && chainConfig.selectedChainId && !isValidNext && !isInChain ? 0.4 : 1}
              >
                {/* PCB outline */}
                <path
                  d={pcb.outlinePath}
                  fill={pcbFill}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={0.9}
                />

                {/* LED count */}
                <text
                  x={pcb.x}
                  y={pcb.y}
                  fill="#fff"
                  fontSize={12}
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {pcb.ledCount}
                </text>

                {/* PCB endpoints (for joint connections) */}
                {visibility.pcbEndpoints && (
                  <>
                    <circle
                      cx={pcb.startPoint.x}
                      cy={pcb.startPoint.y}
                      r={editMode === 'joints' ? 12 : 8}
                      fill={pcb.startJointId ? "#00ff00" : "#ff6600"}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ cursor: editMode === 'joints' ? 'pointer' : 'default' }}
                      onClick={(e) => handleEndpointClick(pcb, 'start', e)}
                      opacity={connectingPcb?.pcbId === pcb.id && connectingPcb?.end === 'start' ? 1 : 0.8}
                    />
                    <text
                      x={pcb.startPoint.x}
                      y={pcb.startPoint.y + 4}
                      fill="#fff"
                      fontSize={8}
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      S
                    </text>

                    <circle
                      cx={pcb.endPoint.x}
                      cy={pcb.endPoint.y}
                      r={editMode === 'joints' ? 12 : 8}
                      fill={pcb.endJointId ? "#00ff00" : "#ff6600"}
                      stroke="#fff"
                      strokeWidth={2}
                      style={{ cursor: editMode === 'joints' ? 'pointer' : 'default' }}
                      onClick={(e) => handleEndpointClick(pcb, 'end', e)}
                      opacity={connectingPcb?.pcbId === pcb.id && connectingPcb?.end === 'end' ? 1 : 0.8}
                    />
                    <text
                      x={pcb.endPoint.x}
                      y={pcb.endPoint.y + 4}
                      fill="#fff"
                      fontSize={8}
                      textAnchor="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      E
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {/* Slot Lines layer */}
          {visibility.slotLines && visibility.pcbs && data.pcbs.map((pcb) => (
            <PCBSlotLines key={`slot-${pcb.id}`} pcb={pcb} chainConfig={chainConfig} />
          ))}

          {/* LEDs layer */}
          {visibility.leds && data.pcbs.map((pcb) => {
            const ledColor = chainConfig.getPcbLedColor(pcb.id) || '#ffcc00'
            return pcb.ledPositions.map((led, idx) => (
              <circle
                key={`${pcb.id}-led-${idx}`}
                cx={led.x}
                cy={led.y}
                r={6}
                fill={ledColor}
                stroke={ledColor === '#ffcc00' ? '#ff8800' : '#ffffff'}
                strokeWidth={1}
                style={{ pointerEvents: 'none' }}
              />
            ))
          })}

          {/* Chain indicators layer */}
          {visibility.chainIndicators && data.pcbs.map((pcb) => {
            const pcbChains = chainConfig.getPcbChains(pcb.id)
            if (pcbChains.length <= 1) return null
            return (
              <g key={`chain-ind-${pcb.id}`} style={{ pointerEvents: 'none' }}>
                {pcbChains.slice(0, 3).map((chain, idx) => (
                  <circle
                    key={`chain-dot-${pcb.id}-${chain.id}`}
                    cx={pcb.x - 10 + idx * 10}
                    cy={pcb.y - 15}
                    r={4}
                    fill={chain.color}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                ))}
              </g>
            )
          })}

          {/* Joints */}
          {visibility.joints && data.joints.map((joint) => {
            const isSelected = selected?.type === 'joint' && selected.item.id === joint.id
            const isHovered = hoveredId === joint.id
            const connectionCount = joint.connections.length
            const isBridge = chainConfig.isBridgeJoint(joint.id)
            const isMainController = chainConfig.isMainControllerJoint(joint.id)

            // Color coding for special joints
            let jointColor = connectionCount > 1 ? "#00ffff" : "#ffff00"
            if (isBridge) jointColor = "#ff8800"
            if (isMainController) jointColor = "#00ff00"
            if (isSelected) jointColor = "#ff00ff"

            return (
              <g
                key={joint.id}
                style={{ cursor: connectingPcb ? 'pointer' : 'default' }}
                onClick={(e) => handleJointClick(joint, e)}
                onMouseEnter={() => setHoveredId(joint.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Joint marker */}
                <circle
                  cx={joint.x}
                  cy={joint.y}
                  r={isSelected ? 18 : isHovered ? 16 : 14}
                  fill={jointColor}
                  stroke="#fff"
                  strokeWidth={isSelected ? 4 : 2}
                  opacity={0.9}
                />

                {/* Connection count */}
                <text
                  x={joint.x}
                  y={joint.y + 4}
                  fill="#000"
                  fontSize={12}
                  fontWeight="bold"
                  textAnchor="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  {connectionCount}
                </text>

                {/* Joint name */}
                {joint.name && (
                  <text
                    x={joint.x}
                    y={joint.y - 22}
                    fill="#fff"
                    fontSize={10}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {joint.name}
                  </text>
                )}

                {/* Special joint indicator */}
                {(isBridge || isMainController) && (
                  <text
                    x={joint.x}
                    y={joint.y + 28}
                    fill={isBridge ? "#ff8800" : "#00ff00"}
                    fontSize={8}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {isBridge ? "BRIDGE" : "MAIN"}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
