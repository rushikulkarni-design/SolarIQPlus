// SolarIQ+ demonstration data.
// Every consumer of this module must clearly label these values as SAMPLE / DEMO data.

export const PROJECT = {
  name: "My Home Solar",
  location: "Ahmedabad, India",
  coords: "23.0225° N, 72.5714° E",
  consumerType: "Residential",
  capacityKw: 2.5,
  panelType: "TOPCon 550 W",
  panelCount: 5,
  layout: "3 × 2",
  status: "Installed",
  commissioned: "12 Feb 2025",
};

export const STATUS = {
  state: "NORMAL",
  todayGen: 18.4,
  expectedGen: 19.1,
  performance: 96.3,
};

// Generation trend datasets keyed by range.
export const genTrend = {
  today: Array.from({ length: 13 }, (_, i) => {
    const hour = 6 + i;
    const bell = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const expected = +(bell * 3.1).toFixed(2);
    const actual = +(Math.max(0, bell * 3.1 - (hour === 13 ? 0.6 : 0.1) * Math.random())).toFixed(2);
    return { label: `${hour}:00`, actual, expected };
  }),
  week: [
    { label: "Mon", actual: 17.2, expected: 18.0 },
    { label: "Tue", actual: 19.1, expected: 19.0 },
    { label: "Wed", actual: 12.4, expected: 15.8 },
    { label: "Thu", actual: 18.9, expected: 19.2 },
    { label: "Fri", actual: 18.4, expected: 19.1 },
    { label: "Sat", actual: 20.1, expected: 19.8 },
    { label: "Sun", actual: 16.7, expected: 18.4 },
  ],
  month: Array.from({ length: 30 }, (_, i) => {
    const base = 17 + Math.sin(i / 3) * 2.5;
    return {
      label: `${i + 1}`,
      expected: +(base + 0.8).toFixed(1),
      actual: +(base - (i % 7 === 3 ? 4 : 0) + (Math.random() - 0.5)).toFixed(1),
    };
  }),
  year: [
    { label: "Jan", actual: 402, expected: 430 },
    { label: "Feb", actual: 448, expected: 460 },
    { label: "Mar", actual: 520, expected: 540 },
    { label: "Apr", actual: 560, expected: 575 },
    { label: "May", actual: 590, expected: 610 },
    { label: "Jun", actual: 505, expected: 560 },
    { label: "Jul", actual: 430, expected: 500 },
    { label: "Aug", actual: 455, expected: 505 },
    { label: "Sep", actual: 512, expected: 530 },
    { label: "Oct", actual: 540, expected: 548 },
    { label: "Nov", actual: 470, expected: 485 },
    { label: "Dec", actual: 410, expected: 435 },
  ],
};

export const WEATHER = {
  temp: 31,
  condition: "Partly Cloudy",
  irradiance: 820,
  cloud: 12,
  humidity: 54,
  wind: 7,
};

export const WEATHER_IMPACT = [
  { feature: "Irradiance", influence: "Positive", weight: 0.82, dir: 1 },
  { feature: "Cloud Cover", influence: "Negative", weight: 0.41, dir: -1 },
  { feature: "Temperature", influence: "Moderate", weight: 0.23, dir: -1 },
  { feature: "Hour of Day", influence: "Positive", weight: 0.36, dir: 1 },
  { feature: "Humidity", influence: "Low", weight: 0.08, dir: -1 },
];

export const BILL_FIELDS = [
  { label: "Consumer Number", value: "GJ-4402-1187-33", confidence: "high" },
  { label: "Bill Number", value: "AHM/2025/0033412", confidence: "high" },
  { label: "Customer Name", value: "R. Mehta", confidence: "medium" },
  { label: "Bill Date", value: "01 May 2025", confidence: "high" },
  { label: "Due Date", value: "18 May 2025", confidence: "high" },
  { label: "Monthly Consumption", value: "300 kWh", confidence: "high" },
  { label: "Bill Amount", value: "₹2,940", confidence: "high" },
  { label: "Sanctioned Load", value: "3 kW", confidence: "medium" },
  { label: "Meter Status", value: "Live / Working", confidence: "low" },
  { label: "Consumer Type", value: "Residential", confidence: "high" },
];

export const ROOFTOP = {
  roofType: "Concrete Flat Roof",
  confidence: 97.71,
  usableArea: 85,
  suitability: "Excellent",
  objects: [
    { cls: "water tank", confidence: 0.91, box: { x: 62, y: 14, w: 16, h: 22 } },
    { cls: "vent pipe", confidence: 0.74, box: { x: 30, y: 55, w: 8, h: 12 } },
    { cls: "chimney", confidence: 0.63, box: { x: 12, y: 30, w: 12, h: 16 } },
  ],
};

export const RECOMMENDATION = {
  capacityKw: 2.5,
  panelWatt: 550,
  panelCount: 5,
  layout: "3 × 2",
  tech: "TOPCon",
  mounting: "Fixed Tilt",
  annualGen: 3750,
};

export const FINANCIALS = {
  installation: 137500,
  subsidy: 78000,
  finalCost: 59500,
  annualSavings: 30000,
  paybackYears: 2,
  carbonReduction: 3.08,
  breakdown: [
    { name: "Panels", value: 68000 },
    { name: "Inverter", value: 28000 },
    { name: "Structure & BOS", value: 26500 },
    { name: "Installation", value: 15000 },
  ],
  projection: Array.from({ length: 11 }, (_, i) => ({
    year: 2025 + i,
    cumulativeSavings: Math.round(i * 30000 - 59500),
  })),
};

export const PREDICTION = {
  historical: Array.from({ length: 8 }, (_, i) => ({
    label: `−${8 - i}h`,
    historical: +(2.4 + Math.sin(i / 2) * 0.6).toFixed(2),
  })),
  forecast: Array.from({ length: 6 }, (_, i) => {
    const base = 2.6 - i * 0.28;
    return {
      label: `+${i + 1}h`,
      predicted: +base.toFixed(2),
      low: +(base - 0.35).toFixed(2),
      high: +(base + 0.35).toFixed(2),
    };
  }),
};

export const SHAP_CONTRIB = [
  { feature: "Irradiance", value: 0.62, dir: 1 },
  { feature: "Hour", value: 0.28, dir: 1 },
  { feature: "Cloud Cover", value: -0.34, dir: -1 },
  { feature: "Temperature", value: -0.12, dir: -1 },
  { feature: "Humidity", value: -0.05, dir: -1 },
];

export const ANOMALY_SERIES = Array.from({ length: 30 }, (_, i) => {
  const base = 18 + Math.sin(i / 4) * 1.5;
  const isAnomaly = i === 11 || i === 22;
  return {
    label: `D${i + 1}`,
    value: isAnomaly ? +(base - 6).toFixed(1) : +(base + (Math.random() - 0.5)).toFixed(1),
    baseline: +base.toFixed(1),
    anomaly: isAnomaly,
  };
});

export const INSIGHTS = [
  {
    status: "NORMAL",
    title: "Generation within expected range",
    text: "Output is consistent with the current irradiance and temperature profile.",
    reason: "Actual generation is 96.3% of the model's expected value.",
    action: "No action required. Continue routine monitoring.",
  },
  {
    status: "WEATHER",
    title: "Reduced output tracks lower irradiance",
    text: "A drop in generation on 22 May aligns with heavier cloud cover.",
    reason: "Measured irradiance fell to 410 W/m² during peak hours.",
    action: "No maintenance needed. This is weather-driven variance.",
  },
  {
    status: "WARNING",
    title: "Output below expected range",
    text: "Generation is trending below the learned baseline for similar conditions.",
    reason: "Two consecutive days at ~82% of expected under clear skies.",
    action: "Continue monitoring. Inspect if the trend persists past 3 days.",
  },
  {
    status: "MAINTENANCE",
    title: "Persistent performance deviation",
    text: "A sustained deviation from the normal performance pattern was detected.",
    reason: "Isolation Forest flagged repeated low-output observations.",
    action: "On-site inspection recommended (panel soiling / string check).",
  },
];

export const MAINTENANCE = {
  health: "Good",
  status: "NORMAL",
  lastInspection: "08 Apr 2025",
  recommendations: [
    { task: "Panel cleaning", detail: "Recommended every 45–60 days in dusty regions.", due: "Due in 12 days" },
    { task: "Visual inspection", detail: "Check for shading, cracks and loose mounting.", due: "Scheduled" },
    { task: "Generation monitoring", detail: "Automated. Alerts raised on sustained deviation.", due: "Active" },
    { task: "Inverter check", detail: "Verify error logs and cooling.", due: "Due in 30 days" },
  ],
};

export const REPORTS = [
  {
    id: "install",
    title: "Installation Report",
    kind: "Planning",
    items: ["Bill analysis", "Rooftop analysis", "Solar recommendation", "Financial analysis"],
    updated: "12 Feb 2025",
  },
  {
    id: "perf",
    title: "Performance Report",
    kind: "Monitoring",
    items: ["Generation", "Expected vs actual", "Weather", "AI explanation", "Performance analysis"],
    updated: "May 2025",
  },
];

export const currency = (n) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
