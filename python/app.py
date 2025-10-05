import meteomatics.api as api
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ==============================
# Replace with your demo credentials
USERNAME = "trinitycollegedublin_okray_hakan"
PASSWORD = "BrWIy091G90alY3kbPH2"
# ==============================

app = Flask(__name__)
CORS(app) # This will enable CORS for all routes

# --- Activity Parameters ---
activity_dict = {
  "hiking trails": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms","uv_index_max_24h:idx"],
  "beaches": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms","uv_index_max_24h:idx"],
  "ski resorts": ["t_mean_2m_24h:C","precip_24h:mm","snow_height_0cm:cm","snowfall_24h:cm","fresh_snow_24h:cm"],
  "fishing spots": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms","ocean_current_speed_mean_24h:m/s"],
  "museums": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms"], # Weather matters for travel to museums
  "castles": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms"],
  "national parks": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms","uv_index_max_24h:idx"],
  "Other": ["t_mean_2m_24h:C","precip_24h:mm","wind_speed_10m_mean_24h:ms"]
}

# --- Weather Calculation Functions ---

def calc_avg_weather(input_df):
    """
    Calculates the 10-year average for each weather variable for each specific date (Month-Day).
    This function now aggregates historical data to provide an average for each unique
    Month-Day combination present in the input_df, across all years.

    Args:
        input_df (pd.DataFrame): Input DataFrame with daily weather data
                                 over multiple years. It should have 'year', 'month', 'day' columns.

    Returns:
        pd.DataFrame: A DataFrame with the average over 10 years data for each
                      date (month-day combination) for each attribute.
                      The index will be 'Month-Day' (e.g., '03-01').
    """
    if input_df.empty:
        return pd.DataFrame()

    # We need to average by 'month' and 'day' across all years.
    # The 'year' column is used to ensure we're getting data across the different years
    # for a specific month-day.
    
    # Identify actual weather parameters (exclude 'year', 'month', 'day', 'lat', 'lon' if present)
    non_weather_cols = ['year', 'month', 'day', 'lat', 'lon'] # Add 'lat', 'lon' if they become columns
    weather_cols = [col for col in input_df.columns if col not in non_weather_cols]

    # Group by month and day, then calculate the mean for each group across the weather_cols
    average_df = round(input_df.groupby(['month', 'day'])[weather_cols].mean(), 1)

    # Rename the index for clarity (e.g., (3, 1) becomes '03-01')
    # The index will be a MultiIndex (month, day) after groupby. Convert it to 'MM-DD' string.
    average_df.index = average_df.index.map(lambda x: f"{x[0]:02d}-{x[1]:02d}")
    average_df.index.name = 'Month-Day'

    return average_df


def get_weather_data(latitude, longitude, start_month, start_day, end_month, end_day, activity_type):
    """
    Fetches historical weather data for a given location and date range over the past 10 years.
    It then processes this data to provide 10-year daily averages for each day within
    the user's specified date range.

    Args:
        latitude (float): Latitude of the location.
        longitude (float): Longitude of the location.
        start_month (int): Start month for the date range.
        start_day (int): Start day for the date range.
        end_month (int): End month for the date range.
        end_day (int): End day for the date range.
        activity_type (str): The activity selected by the user, used to determine parameters.

    Returns:
        pd.DataFrame: DataFrame containing the 10-year averaged weather data for EACH DAY
                      within the specified date range.
                      The index will be 'Month-Day' (e.g., '03-01').
    """
    coordinates = [(latitude, longitude)]
    years = range(datetime.today().year - 9, datetime.today().year + 1) # Last 10 years including current
    all_dfs = []

    # Select parameters based on activity, default to a sensible general set
    selected_parameters = activity_dict.get(activity_type, activity_dict["Other"])
    
    # Ensure some core parameters for general use and rating are always present
    # These are often used for general 'best day' logic
    core_params = ["t_mean_2m_24h:C", "precip_24h:mm"]
    for param in core_params:
        if param not in selected_parameters:
            selected_parameters.append(param)
    
    interval = timedelta(days=1)

    for year in years:
        try:
            current_startdate = datetime(year, start_month, start_day, 0, 0)
            current_enddate = datetime(year, end_month, end_day, 0, 0)

            if current_enddate < current_startdate:
                # Handle date range crossing year boundary, e.g., Dec 20 to Jan 10
                # We need to query in two parts or adjust the end year.
                # For simplicity, if end_month/day is before start_month/day in the same year,
                # we'll assume it crosses a year boundary (e.g., Dec 25 - Jan 5)
                # Meteomatics API might handle this, but for clarity, ensure dates are sensible
                # for a single query.
                current_enddate = datetime(year + 1, end_month, end_day, 0, 0)

            df = api.query_time_series(
                coordinates,
                current_startdate,
                current_enddate,
                interval,
                selected_parameters,
                username=USERNAME,
                password=PASSWORD,
                model="mix"
            )

            df = df.reset_index()
            df["validdate"] = pd.to_datetime(df["validdate"])
            df["year"] = df["validdate"].dt.year
            df["month"] = df["validdate"].dt.month
            df["day"] = df["validdate"].dt.day
            df.drop(columns="validdate", inplace=True)
            all_dfs.append(df)
        except Exception as e:
            print(f"Error fetching data for year {year}: {e}")
            continue

    if not all_dfs:
        return pd.DataFrame()

    raw_historical_data_df = pd.concat(all_dfs, ignore_index=True)
    
    # Now, calc_avg_weather will group by Month-Day across all years
    # to get the 10-year average for each specific day (e.g., avg for Jan 1st over 10 years).
    averaged_daily_data = calc_avg_weather(raw_historical_data_df)
    
    return averaged_daily_data

# --- Flask Routes ---

@app.route("/")
def hello_world():
    return "<p>Hello, World! Your Flask app is running.</p><p>Try /api/get_weather?lat=51.5&lng=-10.5&start_month=7&start_day=1&end_month=7&end_day=5&activity=Hiking</p>"

@app.route("/api/get_weather", methods=["GET"])
def get_weather():
    try:
        lat = float(request.args.get("lat"))
        lng = float(request.args.get("lng"))
        start_month = int(request.args.get("start_month"))
        start_day = int(request.args.get("start_day"))
        end_month = int(request.args.get("end_month"))
        end_day = int(request.args.get("end_day"))
        activity = request.args.get("activity", "Other")

        weather_averages_df = get_weather_data(lat, lng, start_month, start_day, end_month, end_day, activity)

        if weather_averages_df.empty:
            return jsonify({"status": "error", "message": "No weather data available for the specified range/location."}), 404

        # Convert DataFrame to a list of dictionaries for JSON output
        # Each item in the list will represent the 10-year average for a specific 'Month-Day'.
        weather_data_for_json = weather_averages_df.reset_index().to_dict(orient="records")

        return jsonify({"status": "OK", "data": weather_data_for_json})

    except ValueError as e:
        return jsonify({"status": "error", "message": f"Invalid parameter: {e}"}), 400
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"status": "error", "message": f"An internal server error occurred: {e}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
