# Transport Art

This project is a wall-mounted transport map artwork.

The physical idea is:
- a black acrylic front layer cut as the outline of local streets
- rigid LED PCB sections mounted behind the acrylic
- flexible PCB links between sections at joints
- wall standoffs that space the whole assembly off the wall so the LEDs throw light onto the wall behind

The intent is to show live bus and light rail positions as light moving through the street network.

## Current Repository Layout

### Active work

- `CustomisableLEDStraight/`
  - Current straight LED PCB design work.
  - Uses WS2812-style addressable LEDs and connector-based chaining.

- `adaptor board/`
  - Adapter / interconnect board work related to the PCB connection system.

- `testingstencil/`
  - Stencil-related PCB project for assembly/testing.

- `transportmapwebhelper/`
  - Map planning assets and helper tooling.
  - Contains the street SVG and a React webapp used to inspect and edit the map layout, PCB placement, joints, and LED chains.

- `code/rust-realtime-vehicle/`
  - Rust service that fetches NSW GTFS realtime vehicle positions and exposes them over HTTP.
  - Currently serves `/positions` on port `3000`.

- `code/grpc-realtime-node/`
  - Earlier Node prototype for fetching GTFS realtime data.

### Old testing projects

These folders are old test projects and not the current design direction:

- `3332_16mm/`
- `3332_25mm_v2/`
- `5050_16mm/`
- `5050_20mm/`
- `5050_25mm/`
- `ConnectorsTesting/`

## Map / Planning Workflow

The map geometry appears to flow like this:

1. Street and layout artwork is created in Illustrator / DXF / SVG form.
2. `transportmapwebhelper/streetsv2consistentangles.svg` is parsed by `transportmapwebhelper/webapp/scripts/parse-svg.ts`.
3. That script generates `transportmapwebhelper/webapp/public/map_data.json`.
4. The React webapp loads that JSON and lets you inspect:
   - streets selected for LEDs
   - PCB segments
   - LED positions
   - joints between segments
   - logical LED chain routing
5. Chain assignments are saved to `transportmapwebhelper/webapp/public/chain_config.json`.

Based on the current saved data:

- `317` street paths are present
- `21` streets are marked as LED streets
- `86` PCB segments are defined
- `86` joints are defined
- `228` total LEDs are planned
- PCB segment sizes currently span `1` to `5` LEDs
- `9` logical LED chains are currently configured

## Webapp

The planning webapp lives in `transportmapwebhelper/webapp/`.

It has two parts:

- Vite/React frontend
- small Express API used to save `map_data.json` and `chain_config.json`

Useful files:

- `transportmapwebhelper/webapp/src/components/TransportMap.tsx`
- `transportmapwebhelper/webapp/src/hooks/useMapData.ts`
- `transportmapwebhelper/webapp/src/hooks/useChainConfig.ts`
- `transportmapwebhelper/webapp/server.js`

Typical local run:

```bash
cd transportmapwebhelper/webapp
npm install
npm run dev
```

That starts:

- the frontend dev server
- the local save/load API on port `3001`

## Realtime Vehicle Data

The most complete realtime data service currently in the repo is:

- `code/rust-realtime-vehicle/`

It:

- fetches NSW GTFS realtime vehicle positions
- currently requests both buses and CBD/South East light rail
- returns a simplified JSON list of vehicles with:
  - vehicle type
  - latitude / longitude
  - speed
  - bearing
  - route id

Typical local run:

```bash
cd code/rust-realtime-vehicle
cargo run
```

## CAD / Artwork Files

Top-level art and export files include:

- `streets.ai`
- `streets.dxf`
- `streetsv2consistentangles.ai`
- `streetsv2consistentangles.dxf`
- `final-lines.dxf`
- `final-linesv2.dxf`

There are also QGIS sidecar files:

- `lines-1.qmd`
- `lines-2.qmd`

## Current Gaps

From the current repo state, a few parts still appear to be incomplete or external to this repository:

- final controller firmware that drives the installed LEDs
- the mapping layer from live vehicle positions to specific PCB/LED indices
- 3D models for wall standoffs / mounting hardware
- final flexible PCB designs for all inter-joint links

## Notes

- Some transport API credentials are currently hardcoded in the prototype/realtime code and should eventually be moved to environment variables.
- The webapp and generated JSON files are currently the clearest representation of the planned wall layout.
