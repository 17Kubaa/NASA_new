let map, service, geocoder, markers = [];
let state = { searchCenter: null };

// --- NEW: Map of weather conditions to SVG icon URLs ---
const weatherIconMap = {
    sunny: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/clear-day.svg',
    cloudy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/cloudy.svg',
    rainy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/rain.svg',
    snowy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/snow.svg',
    default: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/cloudy.svg' // Fallback icon
};

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 2, center: { lat: 20, lng: 0 },
        mapTypeControl: true, streetViewControl: false,
    });
    service = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();

    const citySearchInput = document.getElementById('citySearch');
    const autocomplete = new google.maps.places.Autocomplete(citySearchInput, { types: ['(cities)'] });
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) { return; }
        map.setCenter(place.geometry.location);
        map.setZoom(10);
        state.searchCenter = place.geometry.location;
    });

    document.getElementById("findPlaces").addEventListener("click", findPlacesAndWeather);
    setDefaultValues();
}

function setDefaultValues() {
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const twoWeeks = new Date();
    twoWeeks.setDate(tomorrow.getDate() + 14);
    const formatDate = (date) => date.toISOString().split('T')[0];
    fromDateInput.value = formatDate(tomorrow);
    toDateInput.value = formatDate(twoWeeks);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                state.searchCenter = new google.maps.LatLng(userLocation.lat, userLocation.lng);
                map.setCenter(state.searchCenter);
                map.setZoom(10);
                geocoder.geocode({ location: userLocation }, (results, status) => {
                    if (status === "OK" && results[0]) {
                        const city = results[0].address_components.find(c => c.types.includes("locality"))?.long_name;
                        const country = results[0].address_components.find(c => c.types.includes("country"))?.long_name;
                        if (city && country) {
                            document.getElementById('citySearch').value = `${city}, ${country}`;
                        }
                    }
                });
            },
            () => { console.log("Geolocation access denied."); }
        );
    }
}

async function findPlacesAndWeather() {
    if (!state.searchCenter) { alert("Please search for and select a city first."); return; }
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    if (!fromDate || !toDate) { alert("Please select a start and end date."); return; }

    const activity = document.getElementById("activity").value;
    const resultsList = document.getElementById("results-list");

    markers.forEach(m => m.setMap(null));
    markers = [];
    resultsList.innerHTML = "<li>Searching for places...</li>";

    const request = { location: state.searchCenter, radius: 50000, query: activity, fields: ["name", "geometry"] };

    service.textSearch(request, async (places, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !places || places.length === 0) {
            resultsList.innerHTML = "<li>No results found for this activity.</li>"; return;
        }

        const nearbyPlaces = places.filter(place => {
            place.distance = google.maps.geometry.spherical.computeDistanceBetween(state.searchCenter, place.geometry.location);
            return place.distance <= 100000;
        });

        if (nearbyPlaces.length === 0) {
            resultsList.innerHTML = `<li>No results for '${activity}' found within 100km.</li>`; return;
        }

        resultsList.innerHTML = `<li>Found ${nearbyPlaces.length} places. Fetching weather data...</li>`;

        try {
            const weatherPromises = nearbyPlaces.map(place => {
                const loc = place.geometry.location;
                const url = `/api/getWeather?lat=${loc.lat()}&lng=${loc.lng()}&startISO=${new Date(fromDate).toISOString().slice(0,10)}T00:00:00Z&endISO=${new Date(toDate).toISOString().slice(0,10)}T23:59:00Z&parameters=t_2m:C,precip_1h:mm`;
                return fetch(url).then(res => res.json());
            });

            const weatherResults = await Promise.all(weatherPromises);
            const combinedResults = nearbyPlaces.map((place, index) => ({
                place: place, weather: calculateWeatherAverages(weatherResults[index])
            }));
            const sortedResults = sortResults(combinedResults, activity);

            resultsList.innerHTML = "";
            sortedResults.forEach(result => createUnifiedListItemAndMarker(result));
        } catch (error) { resultsList.innerHTML = `<li>Error processing data: ${error.message}</li>`; }
    });
}

function sortResults(results, activity) {
    return results.sort((a, b) => {
        if (a.weather.avgTemp === 'N/A') return 1; if (b.weather.avgTemp === 'N/A') return -1;
        switch (activity) {
            case 'hiking trails': return a.weather.avgPrecip - b.weather.avgPrecip;
            case 'beaches': return b.weather.avgTemp - a.weather.avgTemp;
            case 'ski resorts': return a.weather.avgTemp - b.weather.avgTemp;
            default: return a.place.distance - b.place.distance;
        }
    });
}

// --- UPDATED: This function now also returns a weather condition string ---
function calculateWeatherAverages(weatherData) {
    if (!weatherData || !weatherData.data || weatherData.status !== "OK") {
        return { avgTemp: 'N/A', avgPrecip: 'N/A', condition: 'default' };
    }
    let tempSum = 0, precipSum = 0, tempCount = 0, precipCount = 0;
    const tempParam = weatherData.data.find(p => p.parameter === 't_2m:C');
    if (tempParam) {
        tempParam.coordinates[0].dates.forEach(v => { tempSum += v.value; tempCount++; });
    }
    const precipParam = weatherData.data.find(p => p.parameter === 'precip_1h:mm');
    if (precipParam) {
        precipParam.coordinates[0].dates.forEach(v => { precipSum += v.value; precipCount++; });
    }
    const avgTemp = tempCount > 0 ? (tempSum / tempCount) : 'N/A';
    const avgPrecip = precipCount > 0 ? (precipSum / precipCount) : 'N/A';

    // Determine the overall weather condition
    let condition = 'cloudy';
    if (avgPrecip > 0.5) {
        condition = 'rainy';
    } else if (avgTemp < 2) {
        condition = 'snowy';
    } else if (avgPrecip < 0.1 && avgTemp > 20) {
        condition = 'sunny';
    }

    return {
        avgTemp: avgTemp !== 'N/A' ? avgTemp.toFixed(1) : 'N/A',
        avgPrecip: avgPrecip !== 'N/A' ? avgPrecip.toFixed(2) : 'N/A',
        condition: condition
    };
}

// --- UPDATED: This function now adds the weather icon ---
function createUnifiedListItemAndMarker(result) {
    const place = result.place;
    const weather = result.weather;

    const marker = new google.maps.Marker({ position: place.geometry.location, map, title: place.name });
    markers.push(marker);

    const li = document.createElement("li");
    li.className = 'result-item';
    const distanceInKm = (place.distance / 1000).toFixed(1);
    
    // Select the correct icon URL based on the weather condition
    const iconSrc = weatherIconMap[weather.condition] || weatherIconMap.default;

    li.innerHTML = `
      <img src="${iconSrc}" alt="${weather.condition}" class="weather-icon">
      <div class="result-content">
        <div class="result-header">
          <span class="place-name">${place.name}</span>
          <span class="place-distance">${distanceInKm} km away</span>
        </div>
        <div class="weather-stats">
          <div class="stat-item">
            ${weather.avgTemp}°C
            <span>Avg. Temp</span>
          </div>
          <div class="stat-item">
            ${weather.avgPrecip} mm
            <span>Avg. Precip</span>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById("results-list").appendChild(li);

    const clickHandler = () => { map.panTo(place.geometry.location); map.setZoom(14); };
    li.addEventListener('click', clickHandler);
    marker.addListener('click', clickHandler);
}
