# based on a dataframe or csv spits back out a csv that for each day for each value it returns the average of the past 10 years values
import pandas as pd
from weather_pull import final_df

def calc_avg_weather(input_df):
    """
    Calculates the 10-year average for each weather variable for each specific date.

    Args:
        input_df (pd.DataFrame): Input DataFrame with daily weather data
                                 over multiple years. It should have a datetime-like
                                 index or a 'date' column.

    Returns:
        pd.DataFrame: A DataFrame with the average over 10 years data for each
                      date (month-day combination) for each attribute.
    """

    # Ensure the index is a datetime object for easier manipulation
    if not isinstance(input_df.index, pd.DatetimeIndex):
        input_df['date'] = pd.to_datetime(input_df[['year', 'month', 'day']])
        if 'date' in input_df.columns:
            input_df = input_df.set_index('date')
            input_df = input_df.drop(columns=['year', 'month', 'day'])
        else:
            raise ValueError("DataFrame must have a datetime index or a 'date' column.")

    # Group by month and day, then calculate the mean for each group
    # This will average all entries for a given month-day combination across all years
    average_df = round(input_df.groupby([input_df.index.month, input_df.index.day]).mean(),1)

    # Rename the index for clarity (e.g., (3, 1) becomes '03-01')
    average_df.index = average_df.index.map(lambda x: f"{x[0]:02d}-{x[1]:02d}")
    average_df.index.name = 'Month-Day'

    return average_df

print(calc_avg_weather(final_df))
