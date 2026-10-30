from pathlib import Path

import pandas as pd


# ============================================================
# SolarIQ+ - Solar Generation Data Processing
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

INPUT_FILE = DATA_DIR / "Solar_Weather_Data_Processed.csv"
OUTPUT_FILE = DATA_DIR / "solar_ml_ready.csv"


# Features used by the forecasting model.
FEATURE_COLUMNS = [
    "GHI",
    "Temperature",
    "Relative Humidity",
    "Wind Speed",
    "Wind Direction",
    "Hour",
    "Day",
    "Month",
    "SZ Angle",
    "SA Angle",
]

TARGET_COLUMN = "AC Output"


def load_dataset():
    """Load the original processed dataset."""
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Dataset not found:\n{INPUT_FILE}\n\n"
            "Make sure Solar_Weather_Data_Processed.csv is inside "
            "backend/ml/data/"
        )

    df = pd.read_csv(INPUT_FILE)

    print("=" * 60)
    print("SOLARIQ+ DATA PROCESSING")
    print("=" * 60)

    print(f"\nInput file: {INPUT_FILE}")
    print(f"Original rows: {len(df)}")
    print(f"Original columns: {len(df.columns)}")

    return df


def clean_column_names(df):
    """Normalize column names by removing extra whitespace."""
    df = df.copy()

    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
    )

    print("\nCleaned columns:")
    for column in df.columns:
        print(f"  - {column}")

    return df


def convert_timestamp(df):
    """Convert Timestamp from text into pandas datetime."""
    df = df.copy()

    df["Timestamp"] = pd.to_datetime(
        df["Timestamp"],
        errors="coerce",
    )

    invalid_timestamps = df["Timestamp"].isna().sum()

    if invalid_timestamps > 0:
        print(
            f"\nWARNING: {invalid_timestamps} invalid timestamps found."
        )

    df = df.dropna(subset=["Timestamp"])

    return df


def remove_duplicate_timestamps(df):
    """Remove duplicate timestamps while keeping the first record."""
    df = df.copy()

    duplicate_count = df["Timestamp"].duplicated().sum()

    print(f"\nDuplicate timestamps found: {duplicate_count}")

    if duplicate_count > 0:
        df = df.drop_duplicates(
            subset=["Timestamp"],
            keep="first",
        )

    return df


def sort_chronologically(df):
    """Sort the dataset from earliest to latest."""
    df = df.copy()

    df = df.sort_values("Timestamp").reset_index(drop=True)

    return df


def validate_required_columns(df):
    """Make sure all expected ML columns exist."""
    required_columns = ["Timestamp"] + FEATURE_COLUMNS + [TARGET_COLUMN]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Required columns are missing:\n"
            + "\n".join(f"  - {column}" for column in missing_columns)
        )

    print("\nAll required ML columns are present.")


def convert_numeric_columns(df):
    """Ensure model features and target are numeric."""
    df = df.copy()

    numeric_columns = FEATURE_COLUMNS + [TARGET_COLUMN]

    for column in numeric_columns:
        df[column] = pd.to_numeric(
            df[column],
            errors="coerce",
        )

    return df


def remove_missing_ml_values(df):
    """Remove rows with missing feature or target values."""
    df = df.copy()

    ml_columns = FEATURE_COLUMNS + [TARGET_COLUMN]

    missing_before = df[ml_columns].isna().sum().sum()

    print(
        f"\nMissing ML values before cleaning: {missing_before}"
    )

    if missing_before > 0:
        df = df.dropna(subset=ml_columns)

    missing_after = df[ml_columns].isna().sum().sum()

    print(
        f"Missing ML values after cleaning: {missing_after}"
    )

    return df


def validate_values(df):
    """
    Perform basic sanity checks.

    These checks do not silently modify suspicious values.
    They only report them so we know what is present.
    """
    print("\n" + "=" * 60)
    print("VALUE VALIDATION")
    print("=" * 60)

    checks = {
        "GHI < 0": (df["GHI"] < 0).sum(),
        "Temperature < -50": (df["Temperature"] < -50).sum(),
        "Relative Humidity < 0": (
            df["Relative Humidity"] < 0
        ).sum(),
        "Relative Humidity > 100": (
            df["Relative Humidity"] > 100
        ).sum(),
        "Wind Speed < 0": (df["Wind Speed"] < 0).sum(),
        "AC Output < 0": (df["AC Output"] < 0).sum(),
    }

    for description, count in checks.items():
        print(f"{description}: {count}")

    print("\nImportant:")
    print(
        "These values are reported rather than automatically "
        "deleted because domain-specific handling should be "
        "decided before model training."
    )


def create_ml_dataset(df):
    """
    Create the final dataset used by the ML pipeline.

    Timestamp is retained because it is useful for traceability,
    while the forecasting model will use FEATURE_COLUMNS.
    """
    output_columns = [
        "Timestamp",
        *FEATURE_COLUMNS,
        TARGET_COLUMN,
    ]

    return df[output_columns].copy()


def print_dataset_summary(df):
    """Print final dataset information."""
    print("\n" + "=" * 60)
    print("FINAL DATASET SUMMARY")
    print("=" * 60)

    print(f"\nRows: {len(df)}")
    print(f"Columns: {len(df.columns)}")

    print(
        f"\nTime range:\n"
        f"  Start: {df['Timestamp'].min()}\n"
        f"  End:   {df['Timestamp'].max()}"
    )

    print("\nTarget:")
    print(f"  {TARGET_COLUMN}")
    print(f"  Minimum: {df[TARGET_COLUMN].min():.4f}")
    print(f"  Maximum: {df[TARGET_COLUMN].max():.4f}")
    print(f"  Mean:    {df[TARGET_COLUMN].mean():.4f}")

    print("\nFeatures:")
    for feature in FEATURE_COLUMNS:
        print(f"  - {feature}")

    print("\nFinal data types:")
    print(df.dtypes.to_string())


def save_dataset(df):
    """Save the cleaned ML-ready dataset."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("\n" + "=" * 60)
    print("DATASET SAVED")
    print("=" * 60)
    print(f"\nOutput file:\n{OUTPUT_FILE}")
    print(f"Rows saved: {len(df)}")


def main():
    df = load_dataset()

    df = clean_column_names(df)

    validate_required_columns(df)

    df = convert_timestamp(df)

    df = remove_duplicate_timestamps(df)

    df = sort_chronologically(df)

    df = convert_numeric_columns(df)

    df = remove_missing_ml_values(df)

    validate_values(df)

    df = create_ml_dataset(df)

    print_dataset_summary(df)

    save_dataset(df)

    print("\nData processing completed successfully.")


if __name__ == "__main__":
    main()