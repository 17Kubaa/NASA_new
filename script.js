let map, service, geocoder, markers = [];
let state = { searchCenter: null };

const weatherIconMap = {
    sunny: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/cloudysunny-cropped.svg',
    cloudy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/cloudy-cropped.svg',
    rainy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/rainycloudy-cropped.svg',
    snowy: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/Snowy-cropped.svg',
    default: 'https://raw.githubusercontent.com/17Kubaa/NASA_new/main/SVGs/cloudy-cropped.svg'
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
    twoWeeks.setDate(tomorrow.getDate() + 14); // Corrected to be 14 days from tomorrow
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
            return place.distance <= 100000; // within 100km
        });

        if (nearbyPlaces.length === 0) {
            resultsList.innerHTML = `<li>No results for '${activity}' found within 100km.</li>`; return;
        }

        resultsList.innerHTML = `<li>Found ${nearbyPlaces.length} places. Fetching weather data...</li>`;

        try {
            const weatherPromises = nearbyPlaces.map(place => {
                const loc = place.geometry.location;
                // Fetch weather for the full date range for calcRating
                const url = `/api/getWeather?lat=${loc.lat()}&lng=${loc.lng()}&startISO=${new Date(fromDate).toISOString().slice(0,10)}T00:00:00Z&endISO=${new Date(toDate).toISOString().slice(0,10)}T23:59:00Z&parameters=t_2m:C,precip_1h:mm`;
                return fetch(url).then(res => res.json());
            });

            const weatherResults = await Promise.all(weatherPromises);
            const activityType = document.getElementById("activity").value; // Get activity here for calcRating

            const combinedResults = nearbyPlaces.map((place, index) => ({
                place: place,
                weather: calculateWeatherAverages(weatherResults[index]),
                bestDayInfo: calcRating(weatherResults[index], activityType) // Call calcRating here
            }));
            const sortedResults = sortResults(combinedResults, activityType); // Pass activity to sortResults

            resultsList.innerHTML = "";
            sortedResults.forEach(result => createUnifiedListItemAndMarker(result));
        } catch (error) {
            console.error("Error processing data:", error);
            resultsList.innerHTML = `<li>Error processing data: ${error.message}</li>`;
        }
    });
}

function sortResults(results, activity) {
    return results.sort((a, b) => {
        // If bestDayInfo is available and valid, use its rating for sorting
        if (a.bestDayInfo && b.bestDayInfo && a.bestDayInfo.rating !== -1 && b.bestDayInfo.rating !== -1) {
            // Sort in descending order of rating
            return b.bestDayInfo.rating - a.bestDayInfo.rating;
        }

        // Fallback to existing sorting if bestDayInfo is not available or invalid
        if (a.weather.avgTemp === 'N/A') return 1; if (b.weather.avgTemp === 'N/A') return -1;
        switch (activity) {
            case 'hiking trails': return a.weather.avgPrecip - b.weather.avgPrecip; // Less rain is better
            case 'beaches': return b.weather.avgTemp - a.weather.avgTemp; // Higher temp is better
            case 'ski resorts': return a.weather.avgTemp - b.weather.avgTemp; // Lower temp is better
            default: return a.place.distance - b.place.distance;
        }
    });
}

function calculateWeatherAverages(weatherData) {
    if (!weatherData || !weatherData.data || weatherData.status !== "OK") {
        return { avgTemp: 'N/A', avgPrecip: 'N/A', condition: 'default' };
    }
    let tempSum = 0, precipSum = 0, tempCount = 0, precipCount = 0;
    const tempParam = weatherData.data.find(p => p.parameter === 't_2m:C');
    if (tempParam) {
        // Sum all temperatures in the range to get an overall average
        tempParam.coordinates[0].dates.forEach(v => { tempSum += v.value; tempCount++; });
    }
    const precipParam = weatherData.data.find(p => p.parameter === 'precip_1h:mm');
    if (precipParam) {
        // Sum all precipitations in the range to get an overall average
        precipParam.coordinates[0].dates.forEach(v => { precipSum += v.value; precipCount++; });
    }
    const avgTemp = tempCount > 0 ? (tempSum / tempCount) : 'N/A';
    const avgPrecip = precipCount > 0 ? (precipSum / precipCount) : 'N/A';

    let condition = getWeatherCondition(avgTemp, avgPrecip); // Use helper for consistency

    return {
        avgTemp: avgTemp !== 'N/A' ? avgTemp.toFixed(1) : 'N/A',
        avgPrecip: avgPrecip !== 'N/A' ? avgPrecip.toFixed(2) : 'N/A',
        condition: condition
    };
}

/**
 * Helper function to determine a general weather condition string based on temperature and precipitation.
 */
function getWeatherCondition(avgTemp, avgPrecip) {
    let condition = 'cloudy';
    if (avgPrecip > 0.5) { condition = 'rainy'; }
    else if (avgTemp !== 'N/A' && avgTemp < 2 && avgPrecip > 0.1) { condition = 'snowy'; } // Added precip check for snowy
    else if (avgPrecip < 0.1 && avgTemp !== 'N/A' && avgTemp > 15) { condition = 'sunny'; }
    return condition;
}


/**
 * Calculates the best day within the weather data range based on precipitation and temperature.
 * @param {object} weatherData - The full weather data object for a location.
 * @param {string} activity - The selected activity.
 * @returns {object} An object containing the best day string, its rating, and condition.
 */
function calcRating(weatherData, activity) {
    if (!weatherData || !weatherData.data || weatherData.status !== "OK") {
        return { bestDay: 'N/A', rating: -1, bestCondition: 'default' }; // -1 indicates no valid data
    }

    const tempParam = weatherData.data.find(p => p.parameter === 't_2m:C');
    const precipParam = weatherData.data.find(p => p.parameter === 'precip_1h:mm');

    if (!tempParam || !precipParam || !tempParam.coordinates[0] || !precipParam.coordinates[0]) {
        return { bestDay: 'N/A', rating: -1, bestCondition: 'default' };
    }

    const datesTemp = tempParam.coordinates[0].dates;
    const datesPrecip = precipParam.coordinates[0].dates;

    let bestRating = -Infinity; // Initialize with negative infinity
    let bestDay = 'N/A';
    let bestCondition = 'default';

    // Group weather data by day
    const dailyWeather = {};
    datesTemp.forEach(tempEntry => {
        const dateKey = tempEntry.date.split('T')[0];
        if (!dailyWeather[dateKey]) dailyWeather[dateKey] = { temps: [], precips: [] };
        dailyWeather[dateKey].temps.push(tempEntry.value);
    });
    datesPrecip.forEach(precipEntry => {
        const dateKey = precipEntry.date.split('T')[0];
        if (!dailyWeather[dateKey]) dailyWeather[dateKey] = { temps: [], precips: [] };
        dailyWeather[dateKey].precips.push(precipEntry.value);
    });

    for (const dateKey in dailyWeather) {
        const dayData = dailyWeather[dateKey];
        if (dayData.temps.length === 0 || dayData.precips.length === 0) continue;

        const avgTemp = dayData.temps.reduce((a, b) => a + b, 0) / dayData.temps.length;
        const avgPrecip = dayData.precips.reduce((a, b) => a + b, 0) / dayData.precips.length;

        let currentRating = 0;

        // Prioritize low precipitation
        if (avgPrecip < 0.1) {
            currentRating += 5; // Very low precipitation
        } else if (avgPrecip < 0.5) {
            currentRating += 3; // Low precipitation
        } else if (avgPrecip < 2) {
            currentRating += 1; // Moderate precipitation
        } else {
            currentRating -= 5; // High precipitation is a strong negative
        }

        // Temperature preference based on activity
        let idealTempMin = 15;
        let idealTempMax = 25;

        if (activity === 'ski resorts') {
            idealTempMin = -10;
            idealTempMax = 0;
            // Additional bonus for snowy conditions if applicable
            if (getWeatherCondition(avgTemp, avgPrecip) === 'snowy') currentRating += 2;
        } else if (activity === 'beaches') {
            idealTempMin = 20;
            idealTempMax = 30;
            // Additional bonus for sunny conditions if applicable
            if (getWeatherCondition(avgTemp, avgPrecip) === 'sunny') currentRating += 2;
        }

        if (avgTemp >= idealTempMin && avgTemp <= idealTempMax) {
            currentRating += 4; // Ideal temperature
        } else if (avgTemp > idealTempMax && avgTemp <= idealTempMax + 5 || avgTemp < idealTempMin && avgTemp >= idealTempMin - 5) {
            currentRating += 2; // Slightly outside ideal but still good
        } else {
            currentRating -= 3; // Too hot or too cold is a strong negative
        }

        if (currentRating > bestRating) {
            bestRating = currentRating;
            const dateObj = new Date(dateKey + 'T00:00:00'); // Ensure correct date object for display
            bestDay = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            bestCondition = getWeatherCondition(avgTemp, avgPrecip); // Use helper for consistent condition
        }
    }

    return { bestDay, rating: bestRating === -Infinity ? -1 : bestRating, bestCondition };
}


function createUnifiedListItemAndMarker(result) {
    const place = result.place;
    const weather = result.weather; // Overall average weather
    const bestDayInfo = result.bestDayInfo; // New: Best day information

    const marker = new google.maps.Marker({ position: place.geometry.location, map, title: place.name });
    markers.push(marker);

    const li = document.createElement("li");
    li.className = 'result-item';
    const distanceInKm = (place.distance / 1000).toFixed(1);
    
    // Use the best day's condition for the icon if available and valid, otherwise fallback to overall average
    const iconToUse = (bestDayInfo && bestDayInfo.bestCondition !== 'default') ? bestDayInfo.bestCondition : weather.condition;
    const iconSrc = weatherIconMap[iconToUse] || weatherIconMap.default;
    const iconAlt = iconToUse;

    // --- NEW: Get and format the start date (remains for general context) ---
    const fromDateValue = document.getElementById('fromDate').value;
    const startDate = new Date(fromDateValue + 'T00:00:00');
    const dayOfWeek = startDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    li.innerHTML = `
      <img src="${iconSrc}" alt="${iconAlt}" class="weather-icon">
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
        <div class="event-date">
          <p><strong>Overall Period:</strong> ${dayOfWeek} ${formattedDate} - ${new Date(document.getElementById('toDate').value + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric'})}</p>
          ${bestDayInfo && bestDayInfo.bestDay !== 'N/A' ?
            `<p><strong>Best Day:</strong> ${bestDayInfo.bestDay} <span class="best-day-rating">(Rating: ${bestDayInfo.rating})</span></p>` :
            `<p><strong>Best Day:</strong> No optimal day found in range.</p>`
          }
        </div>
      </div>
    `;
    
    document.getElementById("results-list").appendChild(li);

    const clickHandler = () => { map.panTo(place.geometry.location); map.setZoom(14); };
    li.addEventListener('click', clickHandler);
    marker.addListener('click', clickHandler);
}
