import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import fetch from "node-fetch";


(async () => {
  try {
    const response = await fetch("https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/lightrail/cbdandsoutheast", {
      headers: {
        "Authorization": "apikey eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJqdGkiOiIwLU5jUE9GZ3dmUDZGdnEtbEFMR2xxQkZXYzNPS20xVXk0RUFJckFNYVBjIiwiaWF0IjoxNzQzOTEyOTE2fQ.JX4u__K4HsVhsIKbFIC2hU6x3R_14Fo5m8GTGVOX8eY",
      },
    });

    if (!response.ok) {
      const error = new Error(`${response.url}: ${response.status} ${response.statusText}`);
      error.response = response;
      throw error;
      process.exit(1);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );
    feed.entity.forEach((entity) => {
      if (entity.vehicle) {
        console.log(entity.vehicle);
      }
    });
  }
  catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
