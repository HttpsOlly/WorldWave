const standardCountryNames = {
  "The Russian Federation": "Russia",
  "The United Kingdom Of Great Britain And Northern Ireland": "United Kingdom",
  "The United States Of America": "United States",
  "The United States Minor Outlying Islands": "United States",
  "The Marshall Islands": "Marshall Islands"
};

function formatCountryName(rawCountry) {
  if (!rawCountry) return 'Global';
  const cleanName = rawCountry.trim();
  return standardCountryNames[cleanName] || cleanName;
}

const atlanticExclusionZone = [
    [57.911844, -51.911863], // labrador sea
    [64.628765, -68.576448], //Baffin Island
    [67.319106, -120.261325], //NW Territory CA
    [69.307250, -90.880936], //Nunavut
    [59.509371, -43.851385], // south Greenland
    [63.125369, -18.622711], //South Iceland
    [73.161404, 29.943029], //Barents Sea
    [62.786074, 133.608418], //Sakha RU
    [52.761411, 133.726827], //Amur RU
    [65.117530, 40.906863], //Arkhangelsk RU
    [72.338892, 28.439935], //Barents Sea
    [62.177992, -10.931094], //North Atlantic
    [54.727212, -10.665846], //West Ireland
    [51.401568, -10.608159], //South Ireland
    [46.916619, -2.762927],//Bay of Biscay
    [43.504414, -1.782273], //Bay of Biscay
    [44.812013, -29.494035],//Mid Atlantic Ocean
    // [37.997867, -26.102152], // west azores
    [14.578200, -25.547920], // SW Cape Verde
    [13.864017, -20.737272], // SE Cape Verde (yeah we have some weird ones from russia and germany here)
    [-17.030181, -8.470585], // St Helena
    [-20.264929, 12.101214], // Namibia coast
    [-41.019396, 18.621509], //South South Africa
    [-13.765277, 93.238853], //Indian Ocean
    [-45.786748, 81.166694], //French and South Antarctic Territory
    //[-52.085972, 20.187561], // South Indian Ocean
    [-52.085972, -55.082731], // Falklands
    [-8.054290, -30.905001], // Recife, Bra
    [29.918571, -57.933880], // 1000mi east of Florida, US
    [48.389168, -44.818602]  // North Atlantic Ocean
];

function checkPointInsidePolygon(lat, lon, polygonVertices) {
  let isInside = false;
  for (let i = 0, j = polygonVertices.length - 1; i < polygonVertices.length; j = i++) {
    const [latA, lonA] = polygonVertices[i];
    const [latB, lonB] = polygonVertices[j];
    
    const hasIntersected = ((lonA > lon) !== (lonB > lon)) &&
      (lat < (latB - latA) * (lon - lonA) / (lonB - lonA) + latA);
    if (hasIntersected) isInside = !isInside;
  }
  return isInside;
}

const worldMap = L.map('mapContainer', { zoomControl: false }).setView([25, 0], 2);
L.control.zoom({ position: 'bottomright' }).addTo(worldMap);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
  maxZoom: 16,
  minZoom: 2
}).addTo(worldMap);

// L.polygon(atlanticExclusionZone, {
//   color: '#f472b6',
//   weight: 1.5,
//   dashArray: '4, 4',
//   fillColor: '#f472b6',
//   fillOpacity: 0.12
// }).bindTooltip("Atlantic Exclusion Zone", { sticky: true }).addTo(worldMap);

let audioContext = null;
let analyserNode = null;
let audioSourceNode = null;
let animationFrameId = null;
const eqBars = document.querySelectorAll('.eq-bar');

const audioElement = document.getElementById('audioElement');
const playButton = document.getElementById('playButton');
const titleLabel = document.getElementById('titleLabel');
const metaLabel = document.getElementById('metaLabel');
const statusLabel = document.getElementById('statusLabel');
const volumeSlider = document.getElementById('volumeSlider');
const searchInput = document.getElementById('searchInput');

const equalizerBars = document.getElementById('equalizerBars');
const defaultIcon = document.getElementById('defaultIcon');
const flagImage = document.getElementById('flagImage');

const favouriteToggleBtn = document.getElementById('favouriteToggleBtn');
const openfavouritesBtn = document.getElementById('openfavouritesBtn');
const favouritesModal = document.getElementById('favouritesModal');
const closefavouritesModal = document.getElementById('closefavouritesModal');
const favouritesListContainer = document.getElementById('favouritesListContainer');
const favouritesCountBadge = document.getElementById('favouritesCountBadge');

let stationMarkers = L.layerGroup().addTo(worldMap);
let currentlySelectedMarker = null;
let currentStation = null;

let savedfavourites = JSON.parse(localStorage.getItem('worldwave_favourites')) || [];
updatefavouritesUI();

function updatefavouritesUI() {
  favouritesCountBadge.textContent = savedfavourites.length;
  
  if (currentStation) {
    const isFav = savedfavourites.some(s => s.stationuuid === currentStation.stationuuid);
    if (isFav) {
      favouriteToggleBtn.innerHTML = '<i class="fa-solid fa-bookmark text-pink-400 text-sm"></i>';
      favouriteToggleBtn.classList.add('border-pink-500/50', 'bg-pink-500/10');
    } else {
      favouriteToggleBtn.innerHTML = '<i class="fa-regular fa-bookmark text-sm"></i>';
      favouriteToggleBtn.classList.remove('border-pink-500/50', 'bg-pink-500/10');
    }
  }
}

favouriteToggleBtn.addEventListener('click', () => {
  if (!currentStation) return;
  
  const index = savedfavourites.findIndex(s => s.stationuuid === currentStation.stationuuid);
  if (index > -1) {
    savedfavourites.splice(index, 1);
  } else {
    savedfavourites.push(currentStation);
  }
  
  localStorage.setItem('worldwave_favourites', JSON.stringify(savedfavourites));
  updatefavouritesUI();
  renderfavouritesList();
});

openfavouritesBtn.addEventListener('click', () => {
  renderfavouritesList();
  favouritesModal.classList.remove('hidden');
});

closefavouritesModal.addEventListener('click', () => {
  favouritesModal.classList.add('hidden');
});

favouritesModal.addEventListener('click', (e) => {
  if (e.target === favouritesModal) favouritesModal.classList.add('hidden');
});

function renderfavouritesList() {
  favouritesListContainer.innerHTML = '';
  
  if (savedfavourites.length === 0) {
    favouritesListContainer.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-sm">
        <i class="fa-regular fa-bookmark text-3xl mb-2 text-slate-600"></i>
        <p>No bookmarked stations yet.</p>
        <p class="text-xs text-slate-600 mt-1">Click the bookmark button in the bottom right to save stations!</p>
      </div>
    `;
    return;
  }

  savedfavourites.forEach(station => {
    const formattedCountry = formatCountryName(station.country);
    let countryCodeLower = station.countrycode ? station.countrycode.toLowerCase() : '';
    let flagHtml = countryCodeLower ? `<img src="https://flagcdn.com/w20/${countryCodeLower}.png" class="inline w-4 h-3 mr-1.5 rounded-sm align-middle" />` : '';

    const item = document.createElement('div');
    item.className = 'bg-slate-950 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl flex items-center justify-between transition-colors group';
    
    item.innerHTML = `
      <div class="flex items-center space-x-3 overflow-hidden pr-3">
        <div class="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 text-pink-400">
          <i class="fa-solid fa-radio"></i>
        </div>
        <div class="overflow-hidden">
          <div class="font-semibold text-sm text-slate-200 truncate group-hover:text-pink-400 transition-colors">${station.name}</div>
          <div class="text-xs text-slate-400 truncate flex items-center mt-0.5">${flagHtml}<span>${formattedCountry}</span></div>
        </div>
      </div>
      <div class="flex items-center space-x-2 shrink-0">
        <button class="play-fav-btn bg-pink-500/10 hover:bg-pink-500 text-pink-400 hover:text-white border border-pink-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors">
          <i class="fa-solid fa-play text-[10px]"></i>
          <span>Play</span>
        </button>
        <button class="remove-fav-btn text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-slate-900 transition-colors" title="Remove">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>
    `;

    item.querySelector('.play-fav-btn').addEventListener('click', () => {
      favouritesModal.classList.add('hidden');
      worldMap.setView([station.geo_lat, station.geo_long], 6);

      let targetMarker = null;
      stationMarkers.eachLayer(layer => {
        const latLng = layer.getLatLng();
        if (Math.abs(latLng.lat - station.geo_lat) < 0.0001 && Math.abs(latLng.lng - station.geo_long) < 0.0001) {
          targetMarker = layer;
        }
      });


      tuneIntoStation(station, targetMarker);
    });

    item.querySelector('.remove-fav-btn').addEventListener('click', () => {
      savedfavourites = savedfavourites.filter(s => s.stationuuid !== station.stationuuid);
      localStorage.setItem('worldwave_favourites', JSON.stringify(savedfavourites));
      updatefavouritesUI();
      renderfavouritesList();
    });

    favouritesListContainer.appendChild(item);
  });
}

function activateEqualizer() {
  defaultIcon.classList.add('hidden');
  equalizerBars.classList.remove('hidden', 'eq-paused');
  setupAudioVisualizer();
}

function pauseEqualizer() {
  equalizerBars.classList.add('eq-paused');
  cancelAnimationFrame(animationFrameId);
  eqBars.forEach(bar => bar.style.height = '20%');
}

async function loadRadioStations(searchTerm = '') {
  statusLabel.textContent = 'Loading streams...';
  try {
    let endpointUrl = `https://all.api.radio-browser.info/json/stations/search?limit=10000&has_geo_info=true&hidebroken=true&order=clickcount&reverse=true`;
    if (searchTerm) {
      endpointUrl += `&name=${encodeURIComponent(searchTerm)}`;
    }
    
    const response = await fetch(endpointUrl, { headers: { 'User-Agent': 'WorldWaveExplorer/1.0' } });
    const stationsList = await response.json();
    displayStationMarkers(stationsList);
    
    metaLabel.textContent = `${stationsList.length} stations loaded`;
    statusLabel.textContent = 'Ready';
  } catch (error) {
    console.error('API Fetch Error:', error);
    statusLabel.textContent = 'Failed to load network';
  }
}

function displayStationMarkers(stationsList) {
  stationMarkers.clearLayers();
  currentlySelectedMarker = null;

  stationsList.forEach(station => {
    if (!station.geo_lat || !station.geo_long) return;

    const latitude = parseFloat(station.geo_lat);
    const longitude = parseFloat(station.geo_long);

    if (latitude < -52.893728 || latitude > 70.828098) return;
    if (checkPointInsidePolygon(latitude, longitude, atlanticExclusionZone)) return;

    const markerInstance = L.circleMarker([station.geo_lat, station.geo_long], {
      radius: 5,
      color: '#38bdf8',
      weight: 1,
      fillColor: '#0ea5e9',
      fillOpacity: 0.75
    });

    const formattedCountry = formatCountryName(station.country);
    let countryCodeLower = station.countrycode ? station.countrycode.toLowerCase() : '';
    let flagHtml = countryCodeLower ? `<img src="https://flagcdn.com/w20/${countryCodeLower}.png" class="inline w-4 h-3 mr-1 rounded-sm align-middle" />` : '';

    markerInstance.bindTooltip(`
      <div class="font-sans text-xs px-1 py-0.5" style="width: max-content;">
        <div class="font-bold text-sm text-pink-400 mb-0.5">${station.name}</div>
        <div class="text-slate-300 flex items-center">${flagHtml}<span>${formattedCountry}</span></div>
      </div>
    `, { direction: 'top', offset: [0, -4] });

    markerInstance.on('click', () => {
      tuneIntoStation(station, markerInstance);
    });

    stationMarkers.addLayer(markerInstance);
  });
}

function tuneIntoStation(station, markerInstance) {
  const streamUrl = station.url_resolved || station.url;
  if (!streamUrl) return;

  currentStation = station;
  updatefavouritesUI();

  if (currentlySelectedMarker) {
    currentlySelectedMarker.setStyle({
      color: '#38bdf8',
      fillColor: '#0ea5e9',
      radius: 5,
      weight: 1
    });
  }

  if (markerInstance) {
    currentlySelectedMarker = markerInstance;
    currentlySelectedMarker.setStyle({
      color: '#f472b6',
      fillColor: '#ec4899',
      radius: 8,
      weight: 2
    });
    currentlySelectedMarker.bringToFront();
  }

  const formattedCountry = formatCountryName(station.country);
  titleLabel.textContent = station.name;
  
  let stationMetadata = [];
  if (station.codec) stationMetadata.push(station.codec.toUpperCase());
  if (station.bitrate) stationMetadata.push(`${station.bitrate} kbps`);
//   if (station.tags) stationMetadata.push(station.tags.split(',')[0]);
  
  metaLabel.textContent = `${formattedCountry} • ${stationMetadata.join(' • ') || 'General'}`;
  statusLabel.textContent = 'Connecting...';

  if (station.countrycode) {
    flagImage.src = `https://flagcdn.com/w40/${station.countrycode.toLowerCase()}.png`;
    flagImage.classList.remove('hidden');
  } else {
    flagImage.classList.add('hidden');
  }

  audioElement.src = streamUrl;
  audioElement.play()
    .then(() => {
      statusLabel.textContent = 'Live Streaming';
      playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
      activateEqualizer();
    })
    .catch(playbackError => {
      console.error("Playback failed:", playbackError);
      statusLabel.textContent = 'Stream Blocked / Offline';
      pauseEqualizer();
    });

  if (station.stationuuid) {
    fetch(`https://all.api.radio-browser.info/json/url/${station.stationuuid}`).catch(() => {});
  }
}

playButton.addEventListener('click', () => {
  if (audioElement.paused) {
    if (audioElement.src) {
      audioElement.play();
      statusLabel.textContent = 'Live Streaming';
      playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
      activateEqualizer();
    }
  } else {
    audioElement.pause();
    statusLabel.textContent = 'Paused';
    playButton.innerHTML = '<i class="fa-solid fa-play ml-0.5"></i>';
    pauseEqualizer();
  }
});

volumeSlider.addEventListener('input', (event) => {
  audioElement.volume = event.target.value;
});


let searchDebounceTimer;
const searchOnMobile = document.getElementById('searchOnMobile');
const searchOnDesktop = document.getElementById('searchOnDesktop');

function handleSearch(query) {
  if (searchOnMobile) searchOnMobile.value = query;
  if (searchOnDesktop) searchOnDesktop.value = query;

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadRadioStations(query.trim());
  }, 400);
}

if (searchOnMobile) {
  searchOnMobile.addEventListener('input', (event) => handleSearch(event.target.value));
}
if (searchOnDesktop) {
  searchOnDesktop.addEventListener('input', (event) => handleSearch(event.target.value));
}


function setupAudioVisualizer() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    try {
      audioSourceNode = audioContext.createMediaElementSource(audioElement);
      audioSourceNode.connect(analyserNode);
      analyserNode.connect(audioContext.destination);
    } catch (e) {
      console.warn("CORS restriction prevented Web Audio visualization for this stream.");
    }
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  cancelAnimationFrame(animationFrameId);
  visualizeAudioLoop();
}

function visualizeAudioLoop() {
  if (!audioElement.paused && analyserNode) {
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(dataArray);

    const indices = [2, 6, 12, 18]; 
    eqBars.forEach((bar, i) => {
      const value = dataArray[indices[i]] || 10;
      const heightPercent = Math.max(15, (value / 255) * 100);
      bar.style.height = `${heightPercent}%`;
    });
  } else {
    // Reset bars when paused
    eqBars.forEach(bar => bar.style.height = '20%');
  }
  animationFrameId = requestAnimationFrame(visualizeAudioLoop);
}

loadRadioStations();
