let map, service, markers = [];
let state = { searchCenter: null };

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 2,
        center: { lat: 20, lng: 0 },
        mapTypeControl: false,
        streetViewControl: false,
    });
    service = new google.maps.places.PlacesService(map);

    const citySearchInput = document.getElementById('citySearch');
    const autocomplete = new google.maps.places.Autocomplete(citySearchInput, { types: ['(cities)'] });
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            return;
        }
        map.setCenter(place.geometry.location);
        map.setZoom(10);
        state.searchCenter = place.geometry.location;
    });
    document.getElementById("findPlaces").addEventListener("click", findPlacesAndWeather);
}

async function findPlacesAndWeather() {
    if (!state.searchCenter) {
        alert("Please search for and select a city first.");
        return;
    }
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    if (!fromDate || !toDate) {
        alert("Please select a start and end date.");
        return;
    }

    const activity = document.getElementById("activity").value;
    const resultsList = document.getElementById("results-list");

    markers.forEach(m => m.setMap(null));
    markers = [];
    resultsList.innerHTML = "<li>Searching for places...</li>";

    const request = {
        location: state.searchCenter,
        radius: 50000,
        query: activity,
        fields: ["name", "geometry"]
    };

    service.textSearch(request, async (places, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !places || places.length === 0) {
            resultsList.innerHTML = "<li>No results found.</li>";
            return;
        }

        resultsList.innerHTML = `<li>Found ${places.length} places. Fetching weather data...</li>`;

        try {
            // Step 1: Augment places with distance information
            places.forEach(place => {
                place.distance = google.maps.geometry.spherical.computeDistanceBetween(state.searchCenter, place.geometry.location);
            });

            // Step 2: Fetch weather for all places concurrently
            const weatherPromises = places.map(place => {
                const loc = place.geometry.location;
                const url = `/api/getWeather?lat=${loc.lat()}&lng=${loc.lng()}&startISO=${new Date(fromDate).toISOString().slice(0,10)}T00:00:00Z&endISO=${new Date(toDate).toISOString().slice(0,10)}T23:59:00Z&parameters=t_2m:C,precip_1h:mm`;
                return fetch(url).then(res => res.json());
            });

            const weatherResults = await Promise.all(weatherPromises);

            // Step 3: Combine places, weather, and averages into a single array
            const combinedResults = places.map((place, index) => ({
                place: place,
                weather: calculateWeatherAverages(weatherResults[index])
            }));

            // Step 4: Sort the combined array based on the selected activity
            const sortedResults = sortResults(combinedResults, activity);

            // Step 5: Render the final sorted list
            resultsList.innerHTML = "";
            sortedResults.forEach(result => createUnifiedListItemAndMarker(result));

        } catch (error) {
            resultsList.innerHTML = `<li>Error processing data: ${error.message}</li>`;
        }
    });
}

function sortResults(results, activity) {
    return results.sort((a, b) => {
        // Handle cases where weather data is not available
        if (a.weather.avgTemp === 'N/A') return 1;
        if (b.weather.avgTemp === 'N/A') return -1;

        switch (activity) {
            case 'hiking trails':
                return a.weather.avgPrecip - b.weather.avgPrecip; // Lowest precipitation
            case 'beaches':
                return b.weather.avgTemp - a.weather.avgTemp; // Highest temperature
            case 'ski resorts':
                return a.weather.avgTemp - b.weather.avgTemp; // Lowest temperature
            case 'fishing spots':
            case 'museums':
            case 'castles':
            case 'national parks':
            default:
                return a.place.distance - b.place.distance; // Closest distance
        }
    });
}

function calculateWeatherAverages(weatherData) {
    if (!weatherData || !weatherData.data || weatherData.status !== "OK") {
        return { avgTemp: 'N/A', avgPrecip: 'N/A' };
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
    return {
        avgTemp: tempCount > 0 ? (tempSum / tempCount).toFixed(1) : 'N/A',
        avgPrecip: precipCount > 0 ? (precipSum / precipCount).toFixed(2) : 'N/A'
    };
}

function createUnifiedListItemAndMarker(result) {
    const place = result.place;
    const weather = result.weather;

    const marker = new google.maps.Marker({
        position: place.geometry.location,
        map,
        title: place.name
    });
    markers.push(marker);

    const li = document.createElement("li");
    li.className = 'result-item';
    const distanceInKm = (place.distance / 1000).toFixed(1);
    li.innerHTML = `
        <div class="place-info">
            <div class="place-name">${place.name}</div>
            <div class="place-distance">${distanceInKm} km away</div>
        </div>
        <div class="weather-info">
            ${weather.avgTemp}°C
            <span>Avg. Temp</span>
        </div>
        <div class="weather-info">
            ${weather.avgPrecip} mm
            <span>Avg. Precip</span>
        </div>
    `;
    document.getElementById("results-list").appendChild(li);

    const clickHandler = () => {
        map.panTo(place.geometry.location);
        map.setZoom(14);
    };
    li.addEventListener('click', clickHandler);
    marker.addListener('click', clickHandler);

}

