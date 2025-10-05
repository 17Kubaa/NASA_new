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

    // --- THIS IS THE UPDATED LINE ---
    li.innerHTML = `
      <div>
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

    const clickHandler = () => {
        map.panTo(place.geometry.location);
        map.setZoom(14);
    };
    li.addEventListener('click', clickHandler);
    marker.addListener('click', clickHandler);
}
