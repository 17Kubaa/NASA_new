
function calcRating(weather, activity) {
    // Check for valid weather data
    if (weather.avgTemp === 'N/A' || weather.avgPrecip === 'N/A') {
        return "No weather data available";
    }

    let ratingMessage = "";
    // Switch statement to handle different activities / weather conditions
    switch(activity) {
        case "hiking trails":
            ratingMessage = weather.avgPrecip < 5 ? "Great for hiking!" : "Too much rain for hiking";
            break;
        case "beaches":
            ratingMessage = weather.avgTemp > 25 ? "Perfect beach weather!" : "Cooler than ideal for beach";
            break;
        case "ski resorts":
            ratingMessage = weather.avgTemp < 0 ? "Nice skiing conditions" : "Too warm for skiing";
            break;
        case "fishing spots":
            ratingMessage = weather.avgPrecip < 2 ? "Good fishing weather" : "Rain might affect fishing";
            break;
        case "museums":
        case "castles":
        case "national parks":
        default:
            ratingMessage = "Check conditions before you go";
    }

    return ratingMessage;
}
