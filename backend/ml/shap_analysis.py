from pathlib import Path

import joblib
import pandas as pd
import shap


# ============================================================
# SolarIQ+ - SHAP Explainability Analysis
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
RESULTS_DIR = BASE_DIR / "results"

TEST_FILE = DATA_DIR / "test.csv"
MODEL_FILE = MODEL_DIR / "solar_generation_xgboost.joblib"

FEATURE_IMPORTANCE_FILE = (
    RESULTS_DIR / "shap_feature_importance.csv"
)

PREDICTIONS_FILE = (
    RESULTS_DIR / "shap_predictions.csv"
)

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

# Limit SHAP analysis to keep memory usage controlled.
MAX_EXPLANATION_ROWS = 300


def load_model():
    """Load the previously trained XGBoost model."""

    if not MODEL_FILE.exists():
        raise FileNotFoundError(
            f"Trained model not found:\n{MODEL_FILE}\n\n"
            "Run train_xgboost.py first."
        )

    print("=" * 65)
    print("SOLARIQ+ SHAP EXPLAINABILITY ANALYSIS")
    print("=" * 65)

    print("\nLoading trained XGBoost model...")

    model = joblib.load(MODEL_FILE)

    print("Model loaded successfully.")

    return model


def load_test_data():
    """Load the unseen test dataset."""

    if not TEST_FILE.exists():
        raise FileNotFoundError(
            f"Test dataset not found:\n{TEST_FILE}\n\n"
            "Run prepare_dataset.py first."
        )

    df = pd.read_csv(
        TEST_FILE,
        parse_dates=["Timestamp"],
    )

    print("\nLoading test dataset...")
    print(f"Test records available: {len(df)}")

    return df


def select_explanation_sample(df):
    """
    Select a controlled chronological sample for SHAP.

    The sample is spread across the test period instead of
    taking only the first few records.
    """

    if len(df) <= MAX_EXPLANATION_ROWS:
        sample = df.copy()
    else:
        indices = pd.Series(
            range(len(df))
        ).iloc[
            :MAX_EXPLANATION_ROWS
        ]

        # Use evenly distributed positions across the test period.
        selected_indices = (
            pd.Series(
                range(len(df))
            )
            .sample(
                n=MAX_EXPLANATION_ROWS,
                random_state=42,
            )
            .sort_values()
            .tolist()
        )

        sample = df.iloc[
            selected_indices
        ].copy()

    sample = sample.reset_index(drop=True)

    print(
        f"SHAP explanation records: {len(sample)}"
    )

    print(
        f"Explanation period: "
        f"{sample['Timestamp'].min()} → "
        f"{sample['Timestamp'].max()}"
    )

    return sample


def calculate_shap_values(model, X):
    """Calculate SHAP values for the XGBoost model."""

    print("\n" + "=" * 65)
    print("CALCULATING SHAP VALUES")
    print("=" * 65)

    print(
        "\nAnalyzing how each feature contributes "
        "to the model predictions..."
    )

    explainer = shap.TreeExplainer(model)

    shap_values = explainer.shap_values(X)

    print("SHAP calculation completed.")

    return shap_values


def create_feature_importance(
    shap_values,
    X,
):
    """
    Calculate global feature importance using
    mean absolute SHAP value.
    """

    mean_absolute_shap = (
        abs(shap_values)
        .mean(axis=0)
    )

    importance_df = pd.DataFrame(
        {
            "Feature": X.columns,
            "Mean Absolute SHAP": mean_absolute_shap,
        }
    )

    importance_df = importance_df.sort_values(
        "Mean Absolute SHAP",
        ascending=False,
    ).reset_index(drop=True)

    importance_df["Importance Rank"] = (
        importance_df.index + 1
    )

    return importance_df[
        [
            "Importance Rank",
            "Feature",
            "Mean Absolute SHAP",
        ]
    ]


def create_prediction_explanations(
    sample_df,
    shap_values,
):
    """
    Store individual SHAP contributions alongside
    actual and predicted generation.
    """

    X = sample_df[FEATURE_COLUMNS]

    prediction_df = sample_df[
        [
            "Timestamp",
            TARGET_COLUMN,
        ]
    ].copy()

    prediction_df = prediction_df.rename(
        columns={
            TARGET_COLUMN: "Actual AC Output"
        }
    )

    prediction_df["Predicted AC Output"] = (
        prediction_df["Actual AC Output"]
        * 0.0
    )

    # The model prediction will be added by the caller.
    for index, feature in enumerate(FEATURE_COLUMNS):
        prediction_df[
            f"SHAP - {feature}"
        ] = shap_values[:, index]

    return prediction_df


def save_results(
    importance_df,
    prediction_df,
):
    """Save SHAP results to CSV files."""

    RESULTS_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    importance_df.to_csv(
        FEATURE_IMPORTANCE_FILE,
        index=False,
    )

    prediction_df.to_csv(
        PREDICTIONS_FILE,
        index=False,
    )

    print("\n" + "=" * 65)
    print("SHAP RESULTS SAVED")
    print("=" * 65)

    print("\nFeature importance:")
    print(FEATURE_IMPORTANCE_FILE)

    print("\nPrediction explanations:")
    print(PREDICTIONS_FILE)


def print_feature_importance(
    importance_df,
):
    """Display feature importance ranking."""

    print("\n" + "=" * 65)
    print("GLOBAL FEATURE IMPORTANCE")
    print("=" * 65)

    print(
        "\nFeatures ranked by mean absolute SHAP value:\n"
    )

    for _, row in importance_df.iterrows():
        print(
            f"  {int(row['Importance Rank']):2d}. "
            f"{row['Feature']:<20} "
            f"{row['Mean Absolute SHAP']:.6f}"
        )


def main():
    # 1. Load model
    model = load_model()

    # 2. Load test data
    test_df = load_test_data()

    # 3. Select controlled explanation sample
    sample_df = select_explanation_sample(
        test_df
    )

    # 4. Prepare features
    X = sample_df[
        FEATURE_COLUMNS
    ]

    # 5. Calculate SHAP values
    shap_values = calculate_shap_values(
        model,
        X,
    )

    # 6. Calculate global feature importance
    importance_df = create_feature_importance(
        shap_values,
        X,
    )

    # 7. Create individual explanations
    prediction_df = create_prediction_explanations(
        sample_df,
        shap_values,
    )

    # 8. Add actual model predictions
    predictions = model.predict(X)

    prediction_df[
        "Predicted AC Output"
    ] = predictions

    prediction_df[
        "Prediction Error"
    ] = (
        prediction_df["Actual AC Output"]
        - prediction_df["Predicted AC Output"]
    )

    # 9. Save
    save_results(
        importance_df,
        prediction_df,
    )

    # 10. Display ranking
    print_feature_importance(
        importance_df
    )

    print("\n" + "=" * 65)
    print("SOLARIQ+ SHAP ANALYSIS COMPLETED")
    print("=" * 65)

    print(
        "\nThe XGBoost predictions are now explainable "
        "through SHAP feature contributions."
    )


if __name__ == "__main__":
    main()