from pathlib import Path

import numpy as np
import pandas as pd


# ============================================================
# SolarIQ+ - Performance Fingerprint
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

RESULTS_DIR = BASE_DIR / "results"

PREDICTIONS_FILE = RESULTS_DIR / "xgboost_predictions.csv"
OUTPUT_FILE = RESULTS_DIR / "performance_fingerprint.csv"

# Below this predicted output, the generation level is considered
# too small for a meaningful performance-ratio calculation.
LOW_GENERATION_THRESHOLD = 50.0

# Performance status thresholds.
BELOW_EXPECTED_THRESHOLD = -0.20
ABOVE_EXPECTED_THRESHOLD = 0.10


def load_predictions():
    """Load XGBoost actual vs predicted generation results."""

    if not PREDICTIONS_FILE.exists():
        raise FileNotFoundError(
            f"XGBoost predictions not found:\n"
            f"{PREDICTIONS_FILE}\n\n"
            "Run train_xgboost.py first."
        )

    df = pd.read_csv(
        PREDICTIONS_FILE,
        parse_dates=["Timestamp"],
    )

    required_columns = [
        "Timestamp",
        "Actual AC Output",
        "Predicted AC Output",
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

    return df


def calculate_fingerprint(df):
    """
    Calculate stable performance indicators.

    Performance Ratio is only calculated when predicted generation
    is above LOW_GENERATION_THRESHOLD.

    This prevents very small predicted values from producing
    meaningless extremely large ratios.
    """

    df = df.copy()

    actual = pd.to_numeric(
        df["Actual AC Output"],
        errors="coerce",
    )

    predicted = pd.to_numeric(
        df["Predicted AC Output"],
        errors="coerce",
    )

    df["Actual AC Output"] = actual
    df["Predicted AC Output"] = predicted

    # Identify periods where predicted generation is too small
    # for a meaningful performance comparison.
    low_generation = (
        predicted.abs()
        < LOW_GENERATION_THRESHOLD
    )

    df["Low Generation Period"] = low_generation

    # Initialize metrics.
    df["Performance Ratio"] = np.nan
    df["Relative Deviation"] = np.nan
    df["Deviation Percentage"] = np.nan

    # Only calculate ratios for meaningful generation periods.
    active_mask = ~low_generation

    df.loc[
        active_mask,
        "Performance Ratio",
    ] = (
        actual[active_mask]
        / predicted[active_mask]
    )

    df.loc[
        active_mask,
        "Relative Deviation",
    ] = (
        (
            actual[active_mask]
            - predicted[active_mask]
        )
        / predicted[active_mask]
    )

    df.loc[
        active_mask,
        "Deviation Percentage",
    ] = (
        df.loc[
            active_mask,
            "Relative Deviation",
        ]
        * 100
    )

    # Absolute prediction error.
    df["Absolute Error"] = (
        actual - predicted
    ).abs()

    # Performance classification.
    df["Performance Status"] = np.select(
        [
            low_generation,
            df["Relative Deviation"]
            >= ABOVE_EXPECTED_THRESHOLD,
            df["Relative Deviation"]
            <= BELOW_EXPECTED_THRESHOLD,
        ],
        [
            "Low Generation",
            "Above Expected",
            "Below Expected",
        ],
        default="Near Expected",
    )

    return df


def calculate_summary(df):
    """Calculate overall fingerprint statistics."""

    active_df = df[
        ~df["Low Generation Period"]
    ].copy()

    if active_df.empty:
        return {
            "records": len(df),
            "active_records": 0,
            "low_generation_records": len(df),
            "mean_actual": np.nan,
            "mean_predicted": np.nan,
            "mean_performance_ratio": np.nan,
            "mean_absolute_error": np.nan,
            "mean_deviation_percentage": np.nan,
        }

    return {
        "records": len(df),
        "active_records": len(active_df),
        "low_generation_records": int(
            df["Low Generation Period"].sum()
        ),
        "mean_actual": active_df[
            "Actual AC Output"
        ].mean(),
        "mean_predicted": active_df[
            "Predicted AC Output"
        ].mean(),
        "mean_performance_ratio": active_df[
            "Performance Ratio"
        ].mean(),
        "mean_absolute_error": active_df[
            "Absolute Error"
        ].mean(),
        "mean_deviation_percentage": active_df[
            "Deviation Percentage"
        ].mean(),
    }


def print_summary(summary):
    """Display fingerprint summary."""

    print("\n" + "=" * 65)
    print("PERFORMANCE FINGERPRINT SUMMARY")
    print("=" * 65)

    print(
        f"\nTotal records: "
        f"{summary['records']}"
    )

    print(
        f"Meaningful generation records: "
        f"{summary['active_records']}"
    )

    print(
        f"Low-generation records: "
        f"{summary['low_generation_records']}"
    )

    if pd.notna(summary["mean_actual"]):
        print(
            f"\nMean actual AC output: "
            f"{summary['mean_actual']:.4f}"
        )

    if pd.notna(summary["mean_predicted"]):
        print(
            f"Mean predicted AC output: "
            f"{summary['mean_predicted']:.4f}"
        )

    if pd.notna(
        summary["mean_performance_ratio"]
    ):
        print(
            f"Mean performance ratio: "
            f"{summary['mean_performance_ratio']:.4f}"
        )

    if pd.notna(
        summary["mean_absolute_error"]
    ):
        print(
            f"Mean absolute error: "
            f"{summary['mean_absolute_error']:.4f}"
        )

    if pd.notna(
        summary["mean_deviation_percentage"]
    ):
        print(
            f"Mean deviation: "
            f"{summary['mean_deviation_percentage']:.2f}%"
        )


def print_status_distribution(df):
    """Display distribution of performance states."""

    print("\n" + "=" * 65)
    print("PERFORMANCE STATUS DISTRIBUTION")
    print("=" * 65)

    counts = (
        df["Performance Status"]
        .value_counts()
    )

    for status, count in counts.items():
        percentage = (
            count / len(df)
        ) * 100

        print(
            f"  {status:<20}"
            f"{count:4d}"
            f" ({percentage:.1f}%)"
        )


def print_range_information(df):
    """Display useful fingerprint ranges."""

    active_df = df[
        ~df["Low Generation Period"]
    ]

    if active_df.empty:
        return

    print("\n" + "=" * 65)
    print("PERFORMANCE FINGERPRINT RANGE")
    print("=" * 65)

    print(
        "\nPerformance ratio:"
    )

    print(
        f"  Minimum: "
        f"{active_df['Performance Ratio'].min():.4f}"
    )

    print(
        f"  Maximum: "
        f"{active_df['Performance Ratio'].max():.4f}"
    )

    print(
        f"  Median:  "
        f"{active_df['Performance Ratio'].median():.4f}"
    )

    print(
        "\nDeviation percentage:"
    )

    print(
        f"  Minimum: "
        f"{active_df['Deviation Percentage'].min():.2f}%"
    )

    print(
        f"  Maximum: "
        f"{active_df['Deviation Percentage'].max():.2f}%"
    )

    print(
        f"  Median:  "
        f"{active_df['Deviation Percentage'].median():.2f}%"
    )


def save_fingerprint(df):
    """Save detailed performance fingerprint."""

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("\n" + "=" * 65)
    print("PERFORMANCE FINGERPRINT SAVED")
    print("=" * 65)

    print(
        f"\nOutput file:\n{OUTPUT_FILE}"
    )

    print(
        f"Records saved: {len(df)}"
    )


def main():
    print("=" * 65)
    print("SOLARIQ+ PERFORMANCE FINGERPRINT")
    print("=" * 65)

    # 1. Load XGBoost predictions.
    df = load_predictions()

    print(
        f"\nPrediction records loaded: "
        f"{len(df)}"
    )

    # 2. Calculate stable fingerprint.
    df = calculate_fingerprint(df)

    # 3. Calculate summary.
    summary = calculate_summary(df)

    # 4. Display summary.
    print_summary(summary)

    # 5. Display status distribution.
    print_status_distribution(df)

    # 6. Display useful ranges.
    print_range_information(df)

    # 7. Save fingerprint.
    save_fingerprint(df)

    print("\n" + "=" * 65)
    print("SOLARIQ+ PERFORMANCE FINGERPRINT COMPLETED")
    print("=" * 65)

    print(
        "\nThe generation behaviour is now represented "
        "using stable performance indicators."
    )


if __name__ == "__main__":
    main()