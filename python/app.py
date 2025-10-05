import meteomatics.api as api
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ==============================
# Replace with your demo credentials
USERNAME = "berencei_zsolt"
PASSWORD = "h25C2z01udSOT41OtVRZ"
# ==============================

app = Flask(__name__)
CORS(app) # This will enable CORS for all routes

# --- Activity Parameters ---
# This dictionary defines the Meteomatics parameters to fetch based on activity.
# You can customize these further.
activity_dict = {
  "Unspecified": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p"],
  "Outdoor Celebration": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms"],
  "Hiking": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","forest_fire_risk_index:idx","sunset:sql"], # Added units
  "Fishing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","ocean_current_speed:m/s","ocean_current_direction:d"],
  "Swimming": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","uv_index:idx","ocean_current_speed:m/s","water_temperature_0m:C","wave_height:m"],
  "Skiing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","snow_height_0cm:cm","snowfall_24h:cm","fresh_snow_24h:cm","sunrise:sql","sunset:sql"], # Added units
  "Camping": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","sunrise:sql","sunset:sql"], # Added units
  "Outdoor Exercise": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","uv_index:idx"],
  "Wind Sailing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","ocean_current_speed:m/s","ocean_current_direction:d","wave_height:m"],
  "Sunny": ["t_2m:C","uv_index:idx","sunrise:sql","sunset:sql"], # Added units
  "Cloudy": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms"],
  "Rainy": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p"],
  "Windy": ["wind_speed_10m:ms","t_2m:C"],
  # Specific parameters for the "beaches" and "ski resorts" sorting in JS
  "beaches": ["t_mean_2m_24h:C", "precip_24h:mm"],
  "hiking trails": ["t_mean_2m_24h:C", "precip_24h:mm"],
  "ski resorts": ["t_mean_2m_24h:C", "precip_24h:mm"]
}

# --- Weather Calculation Functions (copied from your provided code) ---

def calc_avg_weather(input_df):
    """
    Calculates the 10-year average for each weather variable for each specific date.

    Args:
        input_df (pd.DataFrame): Input DataFrame with daily weather data
                                 over multiple years. It should have 'year', 'month', 'day' columns.

    Returns:
        pd.DataFrame: A DataFrame with the average over 10 years data for each
                      date (month-day combination) for each attribute.
    """
    if input_df.empty:
        return pd.DataFrame()

    # Create a 'date' column for grouping
    input_df['date'] = pd.to_datetime(input_df[['year', 'month', 'day']])
    
    # Set 'date' as index for easier manipulation
    df_indexed = input_df.set_index('date')
    
    # Drop original year, month, day columns as they are now in the index or redundant
    df_indexed = df_indexed.drop(columns=['year', 'month', 'day'])

    # Group by month and day, then calculate the mean for each group
    average_df = round(df_indexed.groupby([df_indexed.index.month, df_indexed.index.day]).mean(), 1)

    # Rename the index for clarity (e.g., (3, 1) becomes '03-01')
    average_df.index = average_df.index.map(lambda x: f"{x[0]:02d}-{x[1]:02d}")
    average_df.index.name = 'Month-Day'

    return average_df

def get_weather_data(latitude, longitude, start_month, start_day, end_month, end_day, activity_type="Unspecified"):
    """
    Fetches historical weather data for a given location and date range over the past 10 years,
    then calculates the average for each day in the range.

    Args:
        latitude (float): Latitude of the location.
        longitude (float): Longitude of the location.
        start_month (int): Start month for the date range.
        start_day (int): Start day for the date range.
        end_month (int): End month for the date range.
        end_day (int): End day for the date range.
        activity_type (str): The activity selected by the user, used to determine parameters.

    Returns:
        pd.DataFrame: DataFrame containing the 10-year averaged weather data for the specified dates.
    """
    coordinates = [(latitude, longitude)]
    years = range(datetime.today().year - 1, datetime.today().year + 1) # Last 3 years including current
    all_dfs = []

    # Select parameters based on activity, default to unspecified if not found
    selected_parameters = activity_dict.get(activity_type, activity_dict["Unspecified"])
    
    # Ensure the parameters required for frontend sorting are always present if relevant
    # The frontend is currently expecting 't_mean_2m_24h:C' and 'precip_24h:mm' for sorting.
    # Add them if they are not already in selected_parameters for relevant activities.
    if activity_type in ["hiking trails", "beaches", "ski resorts"]:
        if "t_mean_2m_24h:C" not in selected_parameters:
            selected_parameters.append("t_mean_2m_24h:C")
        if "precip_24h:mm" not in selected_parameters:
            selected_parameters.append("precip_24h:mm")
    
    # Ensure daily aggregated parameters are used for 1-day interval queries
    # The original script had `t_mean_2m_24h:C` as a default. Let's make sure
    # if an activity requests other parameters, they are handled.
    # For daily averages, it's generally better to query daily aggregated values if available.
    # For simplicity and to match your original `parameters` list logic, we'll
    # use specific 24h parameters if they are suitable for the activity.
    # For now, sticking to what the JS expects for calculation: t_mean_2m_24h:C, precip_24h:mm.

    # If the activity_type isn't one of the 'special' ones for the JS sort,
    # let's assume we want the daily mean temp and precip for general weather info.
    if "t_mean_2m_24h:C" not in selected_parameters:
         selected_parameters.append("t_mean_2m_24h:C")
    if "precip_24h:mm" not in selected_parameters:
         selected_parameters.append("precip_24h:mm")


    # Define the interval for the API query
    interval = timedelta(days=1)

    for year in years:
        try:
            # Construct start and end dates for the current year in the loop
            # Handle cases where start_month/day or end_month/day might be invalid for a given year
            # e.g., Feb 29th on a non-leap year. Meteomatics API handles this gracefully often,
            # but it's good practice to be aware.
            current_startdate = datetime(year, start_month, start_day, 0, 0)
            current_enddate = datetime(year, end_month, end_day, 0, 0)

            # Adjust end_date if it falls before start_date (e.g., query crosses year boundary)
            if current_enddate < current_startdate:
                current_enddate = datetime(year + 1, end_month, end_day, 0, 0)

            df = api.query_time_series(
                coordinates,
                current_startdate,
                current_enddate,
                interval,
                selected_parameters, # Use selected_parameters based on activity
                username=USERNAME,
                password=PASSWORD,
                model="mix" # Use 'mix' for a blend of models
            )

            # Move datetime index into a column
            df = df.reset_index()

            df["validdate"] = pd.to_datetime(df["validdate"])
            df["year"] = df["validdate"].dt.year
            df["month"] = df["validdate"].dt.month
            df["day"] = df["validdate"].dt.day
            df.drop(columns="validdate", inplace=True)
            all_dfs.append(df)
        except Exception as e:
            print(f"Error fetching data for year {year}: {e}")
            # Optionally, log the error or decide whether to skip this year or raise
            continue

    if not all_dfs:
        return pd.DataFrame() # Return empty if no data was fetched

    final_df = pd.concat(all_dfs, ignore_index=True)
    
    # Calculate averages based on the fetched data
    pred_df = calc_avg_weather(final_df)
    
    return pred_df

# --- Flask Routes ---


@app.route("/api/get_weather", methods=["GET"])
def get_weather():
    try:
        lat = float(request.args.get("lat"))
        lng = float(request.args.get("lng"))
        start_month = int(request.args.get("start_month"))
        start_day = int(request.args.get("start_day"))
        end_month = int(request.args.get("end_month"))
        end_day = int(request.args.get("end_day"))
        activity = request.args.get("activity", "Unspecified") # Get activity from query params

        # Validate input parameters if necessary (e.g., month/day ranges)

        weather_averages_df = get_weather_data(lat, lng, start_month, start_day, end_month, end_day, activity)

        if weather_averages_df.empty:
            return jsonify({"status": "error", "message": "No weather data available for the specified range/location."}), 404

        # Convert DataFrame to a list of dictionaries for JSON output
        # Reset index to make 'Month-Day' a regular column before converting to records
        weather_data_for_json = weather_averages_df.reset_index().to_dict(orient="records")

        return jsonify({"status": "OK", "data": weather_data_for_json})

    except ValueError as e:
        return jsonify({"status": "error", "message": f"Invalid parameter: {e}"}), 400
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"status": "error", "message": f"An internal server error occurred: {e}"}), 500

if __name__ == "__main__":
    app.run(debug=True) # debug=True allows for automatic reloading and provides more detailed error messages
