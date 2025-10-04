// File: /api/getWeather.js

export default async function handler(request, response) {
  // Get parameters from the front-end request URL
  const { lat, lng, startISO, endISO, parameters } = request.query;

  const username = process.env.METEOMATICS_USERNAME;
  const password = process.env.METEOMATICS_PASSWORD;

  // --- DEBUGGING STEP ---
  // Check your Vercel logs. Does this print the username or "undefined"?
  console.log('Attempting to use Meteomatics username:', username);

  // Security check for credentials
  if (!username || !password) {
    console.error('SERVER ERROR: Meteomatics environment variables are not set!');
    return response.status(500).json({ error: 'Server configuration error. API credentials missing.' });
  }
  // Security check for parameters
  if (!lat || !lng || !startISO || !endISO || !parameters) {
    return response.status(400).json({ error: 'Missing required query parameters.' });
  }

  const meteomaticsUrl = `https://api.meteomatics.com/${startISO}--${endISO}:PT6H/${parameters}/${lat},${lng}/json`;

  try {
    const apiResponse = await fetch(meteomaticsUrl, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      }
    });

    const responseData = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error('Meteomatics API Error:', responseData);
      return response.status(apiResponse.status).json({ error: responseData.message || 'An error occurred with the weather API.' });
    }
    
    return response.status(200).json(responseData);

  } catch (error) {
    console.error('CATCH BLOCK ERROR:', error);
    return response.status(500).json({ error: 'A critical error occurred while fetching weather data.' });
  }
}
