import { useEffect, useState } from 'react'
import { TransportMap } from './components/TransportMap'
import type { MapData } from './types/map-data'

function App() {
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/map_data.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load map data')
        return res.json()
      })
      .then((data: MapData) => {
        // Ensure joints array exists for backwards compatibility
        if (!data.joints) {
          data.joints = [];
        }
        setMapData(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading map data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center text-destructive">
          <p className="text-xl font-semibold mb-2">Error loading map</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!mapData) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">No map data available</p>
      </div>
    )
  }

  return <TransportMap data={mapData} />
}

export default App
