from pathlib import Path

import pandas as pd


# ============================================================
# SolarIQ+ - ML Dataset Preparation
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

INPUT_FILE = DATA_DIR / "solar_ml_ready.csv"
TRAIN_FILE = DATA_DIR / "train.csv"
TEST_FILE = DATA_DIR / "test.csv"

TARGET_COLUMN = "AC Output"

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

TRAIN_RATIO = 0.80


def load_dataset():
    """Load the ML-ready dataset."""

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"ML-ready dataset not found:\n{INPUT_FILE}\n\n"
            "Make sure solar_ml_ready.csv exists inside "
            "backend/ml/data/"
        )

    df = pd.read_csv(
        INPUT_FILE,
        parse_dates=["Timestamp"],
    )

    print("=" * 60)
    print("SOLARIQ+ ML DATASET PREPARATION")
    print("=" * 60)

    print(f"\nInput file:")
    print(INPUT_FILE)

    print(f"\nTotal records: {len(df)}")
    print(f"Total columns: {len(df.columns)}")

    return df


def validate_dataset(df):
    """Validate required columns and missing values."""

    required_columns = [
        "Timestamp",
        *FEATURE_COLUMNS,
        TARGET_COLUMN,
    ]

    missing_columns = [
        column
        for column in required_columns
        if column not in df.columns
    ]

    if missing_columns:
        raise ValueError(
            "Required columns are missing:\n"
            + "\n".join(
                f"  - {column}"
                for column in missing_columns
            )
        )

    if df["Timestamp"].isna().any():
        raise ValueError(
            "Dataset contains invalid timestamps."
        )

    ml_columns = FEATURE_COLUMNS + [TARGET_COLUMN]

    missing_values = df[ml_columns].isna().sum().sum()

    if missing_values > 0:
        raise ValueError(
            f"Dataset contains {missing_values} missing "
            "values in ML columns."
        )

    print("\nDataset validation: PASSED")


def sort_dataset(df):
    """Sort records from earliest to latest."""

    df = df.sort_values(
        "Timestamp"
    ).reset_index(drop=True)

    return df


def split_dataset(df):
    """
    Create a chronological 80/20 train-test split.

    The first 80% of the timeline is used for training.
    The final 20% is kept completely unseen for testing.
    """

    split_index = int(
        len(df) * TRAIN_RATIO
    )

    train_df = df.iloc[
        :split_index
    ].copy()

    test_df = df.iloc[
        split_index:
    ].copy()

    return train_df, test_df


def print_split_information(train_df, test_df):
    """Display train/test statistics."""

    total_records = len(train_df) + len(test_df)

    train_percentage = (
        len(train_df) / total_records
    ) * 100

    test_percentage = (
        len(test_df) / total_records
    ) * 100

    print("\n" + "=" * 60)
    print("CHRONOLOGICAL SPLIT")
    print("=" * 60)

    print("\nTraining dataset:")
    print(f"  Records: {len(train_df)}")
    print(
        f"  Start:   "
        f"{train_df['Timestamp'].min()}"
    )
    print(
        f"  End:     "
        f"{train_df['Timestamp'].max()}"
    )

    print("\nTesting dataset:")
    print(f"  Records: {len(test_df)}")
    print(
        f"  Start:   "
        f"{test_df['Timestamp'].min()}"
    )
    print(
        f"  End:     "
        f"{test_df['Timestamp'].max()}"
    )

    print("\nSplit percentages:")
    print(f"  Train: {train_percentage:.1f}%")
    print(f"  Test:  {test_percentage:.1f}%")


def verify_no_time_leakage(train_df, test_df):
    """
    Ensure that testing data occurs after training data.

    This prevents future information from leaking into training.
    """

    train_end = train_df["Timestamp"].max()
    test_start = test_df["Timestamp"].min()

    print("\n" + "=" * 60)
    print("TIME-LEAKAGE CHECK")
    print("=" * 60)

    print(
        f"\nLast training timestamp:"
        f"  {train_end}"
    )

    print(
        f"First testing timestamp:"
        f"  {test_start}"
    )

    if train_end >= test_start:
        raise ValueError(
            "\nTIME LEAKAGE DETECTED!\n"
            "The testing period overlaps with or occurs "
            "before the training period."
        )

    print("\nTime leakage check: PASSED")


def verify_record_counts(train_df, test_df, original_df):
    """Verify that no records disappeared during splitting."""

    original_count = len(original_df)
    split_count = len(train_df) + len(test_df)

    print("\n" + "=" * 60)
    print("RECORD COUNT CHECK")
    print("=" * 60)

    print(f"\nOriginal records: {original_count}")
    print(f"Train + Test:     {split_count}")

    if original_count != split_count:
        raise ValueError(
            "Record count mismatch detected."
        )

    print("\nRecord count check: PASSED")


def save_datasets(train_df, test_df):
    """Save training and testing datasets."""

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    train_df.to_csv(
        TRAIN_FILE,
        index=False,
    )

    test_df.to_csv(
        TEST_FILE,
        index=False,
    )

    print("\n" + "=" * 60)
    print("DATASETS SAVED")
    print("=" * 60)

    print("\nTraining file:")
    print(TRAIN_FILE)

    print("\nTesting file:")
    print(TEST_FILE)


def main():

    # 1. Load
    df = load_dataset()

    # 2. Validate
    validate_dataset(df)

    # 3. Sort chronologically
    df = sort_dataset(df)

    # 4. Split
    train_df, test_df = split_dataset(df)

    # 5. Display split information
    print_split_information(
        train_df,
        test_df,
    )

    # 6. Check for time leakage
    verify_no_time_leakage(
        train_df,
        test_df,
    )

    # 7. Make sure no records disappeared
    verify_record_counts(
        train_df,
        test_df,
        df,
    )

    # 8. Save
    save_datasets(
        train_df,
        test_df,
    )

    print("\n" + "=" * 60)
    print("ML DATASET PREPARATION COMPLETED")
    print("=" * 60)

    print(
        "\nThe dataset is now ready for XGBoost training."
    )


if __name__ == "__main__":
    main()