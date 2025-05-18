import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoic3NldHR5IiwiYSI6ImNtYXJ1MWNkNjBhcWoycW9rbWl1cTcwOTgifQ.yPoc0AGYI2s6Qcrq_qZ2ew';
let INPUT_BLUEBIKES_CSV_URL = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'

const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/dark-v11', // Map style
  center: [-71.0710713, 42.3605582], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
}


function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    trips, 
    (v) => v.length, 
    (d) => d.end_station_id
  )
  
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}

map.on('load', async () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });


  // Add the bike lanes layer
  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#66a61e',
      'line-width': 3,
      'line-opacity': 0.4,
    },
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
  });
  map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#66a61e',
      'line-width': 3,
      'line-opacity': 0.4,
    },
  });
  
  const jsonurl = INPUT_BLUEBIKES_CSV_URL;
  const jsonData = await d3.json(jsonurl);
  // console.log('Loaded JSON Data:', jsonData); // Log to verify structure

  let stations = jsonData.data.stations;
  
  /* Departures */
  let trips = await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv", 
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
    return trip;
    }
  );
  stations = computeStationTraffic(stations, trips);

  // resize the radii
  let radiusScale = d3
  .scaleSqrt()
  .domain([0, d3.max(stations, (d) => d.totalTraffic)])
  .range([0, 25]);

  // console.log('Stations Array:', stations);
  const svg = d3.select('#map').select('svg');
  const circles = svg
  .selectAll('circle')
  .data(stations, (d) => d.short_name)
  .enter()
  .append('circle')
  .attr('r', d => radiusScale(d.totalTraffic))
  .attr('fill', 'green') // Circle fill color
  .attr('stroke', 'white') // Circle border color
  .attr('stroke-width', 1) // Circle border thickness
  .attr('opacity', 0.6) // Circle opacity
  .style('--departure-ratio', (d) =>
    stationFlow(d.departures / d.totalTraffic),
  )
  .each(function (d) {
    d3.select(this)
      .append('title')
      .text(
        `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
      );
  });

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) 
      .attr('cy', (d) => getCoords(d).cy);
  }
  map.on('move', updatePositions); // Update during map movement
  map.on('zoom', updatePositions); // Update during zooming
  map.on('resize', updatePositions); // Update on window resize
  map.on('moveend', updatePositions); // Final adjustment after movement ends
  updatePositions();

  const timeSlider = document.getElementById('time-slider');
  console.log('Time Slider:', timeSlider); // Log to verify slider element
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');
  
  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value); // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }

    // Trigger filtering logic which will be implemented in the next step
    updateScatterPlot(timeFilter); // Update scatter plot with filtered data
  }
  
  function updateScatterPlot(timeFilter) {
    // Get only the trips that match the selected time filter
    const filteredTrips = filterTripsbyTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(stations, filteredTrips);
    radiusScale = timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    circles
      .data(filteredStations, (d) => d.short_name)
      .join('circle') // Ensure the data is bound correctly
      .attr('r', (d) => radiusScale(d.totalTraffic)) // Update circle sizes
      .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic),
    );
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  
  updateTimeDisplay();
  // updateScatterPlot();
});