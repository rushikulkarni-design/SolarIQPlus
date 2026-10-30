from pathlib import Path

import numpy as np
import pandas as pd


# ============================================================
# SolarIQ+ - Decision Engine
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "results"

INPUT_FILE = RESULTS_DIR / "isolation_forest_results.csv"
OUTPUT_FILE = RESULTS_DIR / "decision_engine_results.csv"


# ------------------------------------------------------------
# Decision thresholds
# ------------------------------------------------------------

# Relative deviation thresholds.
SIGNIFICANT_LOW_DEVIATION = -0.20
MODERATE_LOW_DEVIATION = -0.10

SIGNIFICANT_HIGH_DEVIATION = 0.20

# Performance ratio thresholds.
LOW_PERFORMANCE_RATIO = 0.80
HIGH_PERFORMANCE_RATIO = 1.20


def load_results():
    """Load Isolation Forest results."""

    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Isolation Forest results not found:\n"
            f"{INPUT_FILE}\n\n"
            "Run isolation_forest.py first."
        )

    df = pd.read_csv(
        INPUT_FILE,
        parse_dates=["Timestamp"],
    )

    required_columns = [
        "Timestamp",
        "Actual AC Output",
        "Predicted AC Output",
        "Performance Ratio",
        "Relative Deviation",
        "Deviation Percentage",
        "Absolute Error",
        "Low Generation Period",
        "Anomaly",
        "Anomaly Score",
        "Anomaly Status",
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


def classify_decision(row):
    """
    Convert model signals into an operational status.

    Important:
    This is a screening/decision-support layer.
    It does not diagnose a physical equipment fault.
    """

    if bool(row["Low Generation Period"]):
        return "Low Generation"

    deviation = row["Relative Deviation"]
    ratio = row["Performance Ratio"]
    anomaly = bool(row["Anomaly"])

    if pd.isna(deviation) or pd.isna(ratio):
        return "Insufficient Data"

    # Strong combination:
    # anomalous + significantly below expected generation.
    if (
        anomaly
        and deviation <= SIGNIFICANT_LOW_DEVIATION
    ):
        return "Attention Required"

    # Significant performance reduction even if
    # Isolation Forest did not flag it.
    if deviation <= SIGNIFICANT_LOW_DEVIATION:
        return "Watch"

    # Anomaly without a large negative deviation.
    if anomaly:
        return "Watch"

    # Mild reduction.
    if deviation <= MODERATE_LOW_DEVIATION:
        return "Watch"

    return "Normal"


def generate_guidance(row):
    """Generate maintenance/investigation guidance."""

    status = row["Decision Status"]

    if status == "Low Generation":
        return (
            "Low-generation period. No maintenance action "
            "is recommended from this observation alone."
        )

    if status == "Insufficient Data":
        return (
            "Insufficient information for a reliable "
            "performance assessment."
        )

    deviation = row["Relative Deviation"]
    anomaly = bool(row["Anomaly"])

    if status == "Attention Required":
        return (
            "Generation is substantially below the model "
            "expectation and the operating pattern is "
            "unusual. Inspect PV output, inverter operation, "
            "temporary shading, and data/sensor quality. "
            "Check whether the condition persists across "
            "multiple observations."
        )

    if status == "Watch":
        if (
            anomaly
            and deviation < 0
        ):
            return (
                "Unusual generation behaviour detected with "
                "output below the model expectation. Monitor "
                "subsequent generation and investigate "
                "environmental conditions, shading, inverter "
                "operation, or data quality if the pattern "
                "persists."
            )

        if anomaly:
            return (
                "The operating pattern is unusual compared "
                "with the learned performance fingerprint. "
                "Continue monitoring and review operating "
                "conditions before taking maintenance action."
            )

        return (
            "Generation is moderately below the model "
            "expectation. Continue monitoring and investigate "
            "environmental or operating conditions if the "
            "deviation persists."
        )

    if status == "Normal":
        return (
            "Generation behaviour is within the expected "
            "model-performance range. No immediate "
            "maintenance action is indicated."
        )

    return (
        "Continue monitoring system performance."
    )


def generate_reason(row):
    """Generate a concise machine-readable decision reason."""

    status = row["Decision Status"]

    if status == "Low Generation":
        return "Expected low-generation period"

    if status == "Insufficient Data":
        return "Required performance indicators unavailable"

    deviation = row["Relative Deviation"]
    anomaly = bool(row["Anomaly"])

    if status == "Attention Required":
        return (
            "Anomaly detected with significant "
            "below-expected generation"
        )

    if status == "Watch":
        if anomaly and deviation < 0:
            return (
                "Anomalous behaviour with "
                "below-expected generation"
            )

        if anomaly:
            return "Anomalous operating pattern detected"

        return "Moderate below-expected generation"

    return "Performance within expected range"


def calculate_decision_score(row):
    """
    Create a transparent 0-100 screening score.

    Higher score means stronger evidence that the observation
    deserves attention.

    This is NOT a probability of failure.
    """

    if bool(row["Low Generation Period"]):
        return 0.0

    score = 0.0

    deviation = row["Relative Deviation"]

    if pd.notna(deviation):

        if deviation <= -0.40:
            score += 60.0

        elif deviation <= -0.20:
            score += 45.0

        elif deviation <= -0.10:
            score += 20.0

    if bool(row["Anomaly"]):
        score += 40.0

    return min(score, 100.0)


def build_decision_engine(df):
    """Build final decision-engine fields."""

    df = df.copy()

    df["Decision Status"] = df.apply(
        classify_decision,
        axis=1,
    )

    df["Decision Reason"] = df.apply(
        generate_reason,
        axis=1,
    )

    df["Maintenance Guidance"] = df.apply(
        generate_guidance,
        axis=1,
    )

    df["Decision Score"] = df.apply(
        calculate_decision_score,
        axis=1,
    )

    return df


def print_summary(df):
    """Print decision-engine summary."""

    print("\n" + "=" * 65)
    print("DECISION ENGINE SUMMARY")
    print("=" * 65)

    counts = (
        df["Decision Status"]
        .value_counts()
    )

    print("\nDecision distribution:")

    for status, count in counts.items():
        percentage = (
            count / len(df)
        ) * 100

        print(
            f"  {status:<20}"
            f"{count:4d}"
            f" ({percentage:.1f}%)"
        )

    print("\nAverage decision score:")

    meaningful_df = df[
        df["Decision Status"]
        != "Low Generation"
    ]

    if not meaningful_df.empty:
        print(
            f"  {meaningful_df['Decision Score'].mean():.2f}"
        )
    else:
        print("  No meaningful-generation records.")


def print_attention_examples(df):
    """Display observations requiring attention."""

    attention = df[
        df["Decision Status"]
        == "Attention Required"
    ].copy()

    print("\n" + "=" * 65)
    print("ATTENTION-REQUIRED OBSERVATIONS")
    print("=" * 65)

    if attention.empty:
        print(
            "\nNo observations reached the "
            "Attention Required threshold."
        )
        return

    display_columns = [
        "Timestamp",
        "Actual AC Output",
        "Predicted AC Output",
        "Performance Ratio",
        "Deviation Percentage",
        "Anomaly Score",
        "Decision Score",
    ]

    print(
        "\n"
        + attention[
            display_columns
        ]
        .sort_values(
            "Decision Score",
            ascending=False,
        )
        .head(10)
        .to_string(index=False)
    )


def print_watch_examples(df):
    """Display a few watch observations."""

    watch = df[
        df["Decision Status"]
        == "Watch"
    ].copy()

    print("\n" + "=" * 65)
    print("WATCH OBSERVATIONS")
    print("=" * 65)

    if watch.empty:
        print("\nNo watch observations.")
        return

    display_columns = [
        "Timestamp",
        "Actual AC Output",
        "Predicted AC Output",
        "Performance Ratio",
        "Deviation Percentage",
        "Anomaly",
        "Decision Score",
    ]

    print(
        "\n"
        + watch[
            display_columns
        ]
        .sort_values(
            "Decision Score",
            ascending=False,
        )
        .head(10)
        .to_string(index=False)
    )


def save_results(df):
    """Save decision-engine results."""

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("\n" + "=" * 65)
    print("DECISION ENGINE RESULTS SAVED")
    print("=" * 65)

    print(
        f"\nOutput file:\n{OUTPUT_FILE}"
    )

    print(
        f"Records saved: {len(df)}"
    )


def main():
    print("=" * 65)
    print("SOLARIQ+ DECISION ENGINE")
    print("=" * 65)

    # 1. Load anomaly-detection results.
    df = load_results()

    print(
        f"\nRecords loaded: {len(df)}"
    )

    # 2. Generate decisions and guidance.
    df = build_decision_engine(df)

    # 3. Print summary.
    print_summary(df)

    # 4. Display attention cases.
    print_attention_examples(df)

    # 5. Display watch cases.
    print_watch_examples(df)

    # 6. Save.
    save_results(df)

    print("\n" + "=" * 65)
    print("SOLARIQ+ DECISION ENGINE COMPLETED")
    print("=" * 65)

    print(
        "\nML outputs have been converted into "
        "transparent operational guidance."
    )


if __name__ == "__main__":
    main()