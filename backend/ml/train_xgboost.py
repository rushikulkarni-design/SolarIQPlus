from pathlib import Path
import joblib
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODEL_DIR = BASE_DIR / "models"
RESULTS_DIR = BASE_DIR / "results"
TRAIN_FILE = DATA_DIR / "train.csv"
TEST_FILE = DATA_DIR / "test.csv"
MODEL_FILE = MODEL_DIR / "solar_generation_xgboost.joblib"
FEATURE_COLUMNS = ["GHI", "Temperature", "Relative Humidity", "Wind Speed", "Wind Direction", "Hour", "Day", "Month", "SZ Angle", "SA Angle"]
TARGET_COLUMN = "AC Output"

def load_dataset(path):
    df = pd.read_csv(path, parse_dates=["Timestamp"])
    df.columns = df.columns.str.strip()
    # Prevent inconsistent calendar features: derive them from the timestamp.
    df["Hour"] = df["Timestamp"].dt.hour
    df["Day"] = df["Timestamp"].dt.day
    df["Month"] = df["Timestamp"].dt.month
    missing = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing:
        raise ValueError(f"{path.name} is missing columns: {missing}")
    if df[FEATURE_COLUMNS + [TARGET_COLUMN]].isna().any().any():
        raise ValueError(f"Missing numeric values found in {path.name}; clean these before training.")
    return df

def main():
    train = load_dataset(TRAIN_FILE)
    test = load_dataset(TEST_FILE)
    # Report questionable humidity values; do not silently alter the source measurements.
    for name, df in [("train", train), ("test", test)]:
        bad = ((df["Relative Humidity"] < 0) | (df["Relative Humidity"] > 100)).sum()
        if bad:
            print(f"WARNING: {bad} {name} rows have Relative Humidity outside 0-100. Verify source units/quality.")
    model = XGBRegressor(objective="reg:squarederror", n_estimators=400, learning_rate=0.05,
        max_depth=6, min_child_weight=3, subsample=0.85, colsample_bytree=0.85,
        reg_alpha=0.05, reg_lambda=1.0, random_state=42, n_jobs=2)
    model.fit(train[FEATURE_COLUMNS], train[TARGET_COLUMN], verbose=False)
    pred = model.predict(test[FEATURE_COLUMNS])
    mae = mean_absolute_error(test[TARGET_COLUMN], pred)
    rmse = mean_squared_error(test[TARGET_COLUMN], pred) ** 0.5
    r2 = r2_score(test[TARGET_COLUMN], pred)
    print(f"Test records: {len(test)}")
    print(f"MAE: {mae:.4f}\nRMSE: {rmse:.4f}\nR2: {r2:.4f}")
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    pd.DataFrame([{"model":"XGBoost", "target":TARGET_COLUMN, "train_records":len(train),
        "test_records":len(test), "MAE":mae, "RMSE":rmse, "R2":r2}]).to_csv(RESULTS_DIR/"xgboost_evaluation.csv", index=False)
    pd.DataFrame({"Timestamp":test["Timestamp"], "Actual AC Output":test[TARGET_COLUMN],
        "Predicted AC Output":pred, "Prediction Error":test[TARGET_COLUMN]-pred}).to_csv(RESULTS_DIR/"xgboost_predictions.csv", index=False)
    print(f"Saved model: {MODEL_FILE}")
    print("NOTE: This script does not establish the AC Output unit; confirm it from the original dataset documentation before converting to energy.")

if __name__ == "__main__":
    main()
