from pathlib import Path

import pandas as pd
from sklearn.ensemble import IsolationForest


# ============================================================
# SolarIQ+ - Isolation Forest Anomaly Detection
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

RESULTS_DIR = BASE_DIR / "results"

INPUT_FILE = RESULTS_DIR / "performance_fingerprint.csv"
OUTPUT_FILE = RESULTS_DIR / "isolation_forest_results.csv"

# Expected proportion of unusual observations.
CONTAMINATION = 0.10

RANDOM_STATE = 42

FEATURE_COLUMNS = [
    "Actual AC Output",
    "Predicted AC Output",
    "Performance Ratio",
    "Relative Deviation",
    "Absolute Error",
]


def load_fingerprint():
    """Load the performance fingerprint."""

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Performance fingerprint not found:\n"
            f"{INPUT_FILE}\n\n"
            "Run performance_fingerprint.py first."
        )

    df = pd.read_csv(
        INPUT_FILE,
        parse_dates=["Timestamp"],
    )

    required_columns = [
        "Timestamp",
        "Low Generation Period",
        *FEATURE_COLUMNS,
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


def prepare_active_data(df):
    """
    Keep only meaningful-generation records.

    Low-generation periods are expected operating conditions
    and should not automatically be classified as anomalies.
    """

    active_df = df[
        ~df["Low Generation Period"]
    ].copy()

    active_df = active_df.dropna(
        subset=FEATURE_COLUMNS
    ).reset_index(drop=True)

    return active_df


def train_isolation_forest(active_df):
    """Train Isolation Forest on the performance fingerprint."""

    X = active_df[FEATURE_COLUMNS]

    print("\n" + "=" * 65)
    print("ISOLATION FOREST TRAINING")
    print("=" * 65)

    print(
        f"\nTraining records: {len(active_df)}"
    )

    print(
        f"Features used: {len(FEATURE_COLUMNS)}"
    )

    for feature in FEATURE_COLUMNS:
        print(f"  - {feature}")

    model = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=2,
    )

    model.fit(X)

    return model


def detect_anomalies(model, active_df):
    """Generate anomaly predictions and scores."""

    active_df = active_df.copy()

    X = active_df[FEATURE_COLUMNS]

    predictions = model.predict(X)

    scores = model.decision_function(X)

    # sklearn returns:
    #  1  = normal
    # -1  = anomaly
    active_df["Isolation Prediction"] = predictions

    active_df["Anomaly Score"] = scores

    active_df["Anomaly"] = (
        predictions == -1
    )

    active_df["Anomaly Status"] = (
        active_df["Anomaly"]
        .map(
            {
                True: "Anomaly",
                False: "Normal",
            }
        )
    )

    return active_df


def add_low_generation_records(
    original_df,
    active_df,
):
    """
    Put low-generation records back into the final output.

    They are explicitly labelled as expected low-generation
    periods rather than being passed through anomaly detection.
    """

    result = original_df.copy()

    result["Isolation Prediction"] = 1
    result["Anomaly Score"] = 0.0
    result["Anomaly"] = False
    result["Anomaly Status"] = "Low Generation"

    active_columns = [
        "Timestamp",
        "Isolation Prediction",
        "Anomaly Score",
        "Anomaly",
        "Anomaly Status",
    ]

    active_lookup = active_df[
        active_columns
    ].copy()

    result = result.drop(
        columns=[
            "Isolation Prediction",
            "Anomaly Score",
            "Anomaly",
            "Anomaly Status",
        ],
        errors="ignore",
    )

    result = result.merge(
        active_lookup,
        on="Timestamp",
        how="left",
    )

    # Restore explicit low-generation status.
    low_generation_mask = (
        result["Low Generation Period"]
    )

    result.loc[
        low_generation_mask,
        "Isolation Prediction",
    ] = 1

    result.loc[
        low_generation_mask,
        "Anomaly Score",
    ] = 0.0

    result.loc[
        low_generation_mask,
        "Anomaly",
    ] = False

    result.loc[
        low_generation_mask,
        "Anomaly Status",
    ] = "Low Generation"

    result = result.sort_values(
        "Timestamp"
    ).reset_index(drop=True)

    return result


def print_results(result):
    """Display anomaly detection summary."""

    print("\n" + "=" * 65)
    print("ISOLATION FOREST RESULTS")
    print("=" * 65)

    total_records = len(result)

    anomaly_count = int(
        (
            result["Anomaly Status"]
            == "Anomaly"
        ).sum()
    )

    normal_count = int(
        (
            result["Anomaly Status"]
            == "Normal"
        ).sum()
    )

    low_generation_count = int(
        (
            result["Anomaly Status"]
            == "Low Generation"
        ).sum()
    )

    print(
        f"\nTotal records: "
        f"{total_records}"
    )

    print(
        f"Normal records: "
        f"{normal_count}"
    )

    print(
        f"Anomalous records: "
        f"{anomaly_count}"
    )

    print(
        f"Low-generation records: "
        f"{low_generation_count}"
    )

    if total_records > 0:
        print(
            f"\nAnomaly percentage "
            f"of all records: "
            f"{(anomaly_count / total_records) * 100:.2f}%"
        )

    active_records = (
        normal_count + anomaly_count
    )

    if active_records > 0:
        print(
            f"Anomaly percentage "
            f"of meaningful-generation records: "
            f"{(anomaly_count / active_records) * 100:.2f}%"
        )

    print("\nStatus distribution:")

    status_counts = (
        result["Anomaly Status"]
        .value_counts()
    )

    for status, count in status_counts.items():
        percentage = (
            count / total_records
        ) * 100

        print(
            f"  {status:<20}"
            f"{count:4d}"
            f" ({percentage:.1f}%)"
        )


def print_anomaly_examples(result):
    """Display the strongest detected anomalies."""

    anomalies = result[
        result["Anomaly Status"]
        == "Anomaly"
    ].copy()

    if anomalies.empty:
        print(
            "\nNo anomalies were detected."
        )
        return

    anomalies = anomalies.sort_values(
        "Anomaly Score"
    )

    print("\n" + "=" * 65)
    print("STRONGEST ANOMALY EXAMPLES")
    print("=" * 65)

    display_columns = [
        "Timestamp",
        "Actual AC Output",
        "Predicted AC Output",
        "Performance Ratio",
        "Deviation Percentage",
        "Anomaly Score",
    ]

    print(
        "\n"
        + anomalies[
            display_columns
        ]
        .head(10)
        .to_string(index=False)
    )


def save_results(result):
    """Save anomaly detection results."""

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    result.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("\n" + "=" * 65)
    print("ISOLATION FOREST RESULTS SAVED")
    print("=" * 65)

    print(
        f"\nOutput file:\n{OUTPUT_FILE}"
    )

    print(
        f"Records saved: {len(result)}"
    )


def main():
    print("=" * 65)
    print("SOLARIQ+ ISOLATION FOREST ANOMALY DETECTION")
    print("=" * 65)

    # 1. Load fingerprint.
    df = load_fingerprint()

    print(
        f"\nFingerprint records loaded: "
        f"{len(df)}"
    )

    # 2. Keep meaningful-generation records.
    active_df = prepare_active_data(df)

    print(
        f"Meaningful-generation records: "
        f"{len(active_df)}"
    )

    # 3. Train Isolation Forest.
    model = train_isolation_forest(
        active_df
    )

    print(
        "\nIsolation Forest training completed."
    )

    # 4. Detect anomalies.
    active_results = detect_anomalies(
        model,
        active_df,
    )

    # 5. Restore low-generation periods.
    result = add_low_generation_records(
        df,
        active_results,
    )

    # 6. Print results.
    print_results(result)

    # 7. Show examples.
    print_anomaly_examples(result)

    # 8. Save.
    save_results(result)

    print("\n" + "=" * 65)
    print("SOLARIQ+ ISOLATION FOREST COMPLETED")
    print("=" * 65)

    print(
        "\nThe performance fingerprint now has "
        "anomaly detection results."
    )


if __name__ == "__main__":
    main()