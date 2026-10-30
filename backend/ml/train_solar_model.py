"""
SolarIQ+ PVGIS multi-location hourly XGBoost training script.
Requires: pandas numpy scikit-learn xgboost joblib
Run: python train_solar_model.py <folder-containing-6-PVGIS-CSV-files>
"""
import sys, re
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, r2_score

LOCATIONS = {
    "28.614_77.209": (28.614, 77.209, 31, "Delhi"),
    "12.972_77.595": (12.972, 77.595, 17, "Bengaluru"),
    "26.912_75.787": (26.912, 75.787, 31, "Jaipur"),
    "18.520_73.857": (18.520, 73.857, 24, "Pune"),
    "19.076_72.878": (19.076, 72.878, 25, "Mumbai"),
    "19.876_75.343": (19.876, 75.343, 25, "Chhatrapati_Sambhajinagar"),
}
FEATURES = ["latitude","longitude","tilt_deg","hour","day_of_year","month",
            "Gb(i)","Gd(i)","Gr(i)","H_sun","T2m","WS10m"]

def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    output = source / "solariq_pvgis_training"
    output.mkdir(exist_ok=True)
    frames = []
    for path in source.glob("Timeseries_*2014_2020*.csv"):
        matched = next((k for k in LOCATIONS if k in path.name), None)
        if not matched:
            continue
        lat, lon, tilt, city = LOCATIONS[matched]
        # PVGIS metadata occupies the first 10 lines; hourly header follows.
        df = pd.read_csv(path, skiprows=10)
        df = df[df["time"].astype(str).str.match(r"^\\d{8}:\\d{4}$", na=False)].copy()
        df["time_dt"] = pd.to_datetime(df["time"], format="%Y%m%d:%H%M")
        for col in ["P","Gb(i)","Gd(i)","Gr(i)","H_sun","T2m","WS10m"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["latitude"], df["longitude"], df["tilt_deg"], df["city"] = lat, lon, tilt, city
        df["hour"] = df["time_dt"].dt.hour
        df["day_of_year"] = df["time_dt"].dt.dayofyear
        df["month"] = df["time_dt"].dt.month
        df["year"] = df["time_dt"].dt.year
        frames.append(df.dropna(subset=FEATURES + ["P"]))
    if not frames:
        raise RuntimeError("No matching PVGIS files found. Place the downloaded CSVs in this folder.")
    data = pd.concat(frames, ignore_index=True).drop_duplicates()
    data["P"] = data["P"].clip(lower=0)
    data.drop(columns=["time_dt"]).to_csv(output / "pvgis_india_hourly.csv", index=False)
    train, test = data[data.year <= 2019], data[data.year == 2020]
    model = XGBRegressor(n_estimators=350, max_depth=8, learning_rate=0.05,
        subsample=0.85, colsample_bytree=0.85, objective="reg:squarederror",
        n_jobs=-1, random_state=42)
    model.fit(train[FEATURES], train["P"])
    pred = np.maximum(model.predict(test[FEATURES]), 0)
    print("Rows:", len(data), "| train:", len(train), "| test:", len(test))
    print("MAE (W):", mean_absolute_error(test["P"], pred))
    print("R2:", r2_score(test["P"], pred))
    joblib.dump({"model": model, "features": FEATURES, "target": "P",
        "target_unit": "W for 1 kWp system", "training_years": "2014-2019",
        "validation_year": "2020", "source": "PVGIS-ERA5"},
        output / "solariq_pvgis_xgboost_hourly.joblib")
    print("Saved files to", output.resolve())

if __name__ == "__main__":
    main()
