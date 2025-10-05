import meteomatics.api as api
import datetime as dt
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ==============================
# Replace with your demo credentials
USERNAME = "berencei_zsolt"
PASSWORD = "h25C2z01udSOT41OtVRZ"
# ==============================

activity = ""

activity_dict = {
  "Unspecified": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p"],
  "Outdoor Celebration": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms"],
  "Hiking": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","forest_fire_risk_index","sunset"],
  "Fishing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","ocean_current_speed:m/s","ocean_current_direction:d"],
  "Swimming": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","uv_index","ocean_current_speed:m/s","water_temperature_0m:C","wave_height:m"],
  "Skiing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","snow_height_0cm:cm","snowfall_24h:cm","fresh_snow_24h:cm","sunrise","sunset"],
  "Camping": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","sunrise","sunset"],
  "Outdoor Exercise": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","uv_index"],
  "Wind Sailing": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p","ocean_current_speed:m/s","ocean_current_direction:d","wave_height:m"],
  "Sunny": ["t_2m:C","uv_index","sunrise","sunset"],
  "Cloudy": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms"],
  "Rainy": ["t_2m:C","precip_1h:mm","wind_speed_10m:ms","relative_humidity_2m:p"],
  "Windy": ["wind_speed_10m:ms","t_2m:C"]
}

# Parameters to pull (daily resolution)
if False:
    parameters = activity_dict[activity]
else:
    parameters = [
        "t_min_2m_24h:C",      # daily min temperature
        "t_max_2m_24h:C",      # daily max temperature
        "t_mean_2m_24h:C",     # daily mean temperature
        "precip_24h:mm",       # daily precipitation sum
        "wind_speed_10m:ms",   # mean wind speed
        # "wind_gusts_10m_24h:ms", # max gusts
        "sunshine_duration_24h:min"  # daily sunshine duration
    ]


# Define bounding box for Ireland
lat_min, lat_max = 51.5, 55.5
lon_min, lon_max = -10.5, -5.5
resolution = 0.1 # degrees
coordinates = [(51.5,-10.5)] 

start_month = 3
start_day = 1
end_month = 3
end_day = 31

years = range(2015, 2025)
all_dfs = []

for year in years:
    startdate = dt.datetime(year, start_month, start_day, 0, 0)
    enddate   = dt.datetime(year, end_month, end_day, 0, 0)
    interval  = dt.timedelta(days=1)
    
    df = api.query_time_series(
        coordinates,
        startdate,
        enddate,
        interval,
        parameters,
        username=USERNAME,
        password=PASSWORD,
        model="mix"
    )

    # move datetime index into a column
    df = df.reset_index()

    df["validdate"] = pd.to_datetime(df["validdate"])
    df["year"] = df["validdate"].dt.year
    df["month"] = df["validdate"].dt.month
    df["day"] = df["validdate"].dt.day
    df.drop(columns="validdate", inplace=True)
    all_dfs.append(df)

final_df = pd.concat(all_dfs, ignore_index=True)
print("Combined DataFrame created successfully!")
print(final_df.head())
print(final_df.info())
print("Data fetching successful.")
final_df.head(5)

# Save as JSON
# json_filename = "ireland_weather_daily.json"
# df.to_json(json_filename, orient="records", date_format="iso")
# print(f"Saved JSON file: {json_filename}")
