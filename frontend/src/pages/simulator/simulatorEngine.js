export const DEFAULT_SIMULATOR_INPUTS = {
  monthlyConsumption: 450,
  monthlyBill: 4200,
  systemCapacity: 5,
  panelType: "monofacial",
  tariff: 9.5,
  installationCost: 275000,
  batterySize: 5,
  lifetime: 25,
};

const PEAK_SUN_HOURS = 4.5;
const PERFORMANCE_RATIO = 0.78;
const BIFACIAL_GAIN = 1.08;
const BATTERY_EFFICIENCY = 0.90;
const EXPORT_RATE_FACTOR = 0.20;
const ANNUAL_DEGRADATION = 0.005;
const CO2_KG_PER_KWH = 0.708;
const BATTERY_COST_PER_KWH = 75000;

function n(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function calculateAnnualSavings({
  generation,
  annualConsumption,
  tariff,
  batterySize,
}) {
  // Direct solar use is counted once. A battery can only store surplus solar,
  // and delivered energy includes round-trip losses.
  const directSolarToHome = Math.min(
    generation * 0.70,
    annualConsumption
  );

  const remainingDemand = Math.max(
    annualConsumption - directSolarToHome,
    0
  );

  const solarSurplus = Math.max(
    generation - directSolarToHome,
    0
  );

  const maxAnnualBatteryCharge =
    Math.max(batterySize, 0) * 365 * 0.75;

  const solarToBattery = batterySize > 0
    ? Math.min(
        solarSurplus,
        maxAnnualBatteryCharge,
        remainingDemand / BATTERY_EFFICIENCY
      )
    : 0;

  const batteryToHome =
    solarToBattery * BATTERY_EFFICIENCY;

  const solarToGrid = Math.max(
    generation - directSolarToHome - solarToBattery,
    0
  );

  const usableEnergy = Math.min(
    directSolarToHome + batteryToHome,
    annualConsumption
  );

  const energySavings =
    usableEnergy * tariff;

  const exportSavings =
    solarToGrid * tariff * EXPORT_RATE_FACTOR;

  return {
    savings: Math.min(
      energySavings + exportSavings,
      annualConsumption * tariff
    ),

    selfConsumedEnergy: directSolarToHome,
    exportedEnergy: solarToGrid,
    batteryContribution: batteryToHome,
    solarToHome: directSolarToHome,
    solarToBattery,
    solarToGrid,
    batteryToHome,
  };
}

export function calculateSimulator(raw = {}) {
  const input = {
    monthlyConsumption: clamp(
      n(raw.monthlyConsumption, 450),
      50,
      100000
    ),

    monthlyBill: clamp(
      n(raw.monthlyBill, 4200),
      100,
      10000000
    ),

    systemCapacity: clamp(
      n(raw.systemCapacity, 5),
      0.5,
      1000
    ),

    panelType:
      raw.panelType === "bifacial"
        ? "bifacial"
        : "monofacial",

    tariff: clamp(
      n(raw.tariff, 9.5),
      1,
      100
    ),

    installationCost: clamp(
      n(raw.installationCost, 275000),
      10000,
      100000000
    ),

    batterySize: clamp(
      n(raw.batterySize, 5),
      0,
      1000
    ),

    lifetime: clamp(
      Math.round(n(raw.lifetime, 25)),
      1,
      40
    ),
  };

  const annualConsumption =
    input.monthlyConsumption * 12;

  const annualBill =
    input.monthlyBill * 12;

  const panelFactor =
    input.panelType === "bifacial"
      ? BIFACIAL_GAIN
      : 1;

  const engineeringAnnualGeneration =
    input.systemCapacity *
    PEAK_SUN_HOURS *
    365 *
    PERFORMANCE_RATIO *
    panelFactor;

  // Optional validated annual-generation override from the PVGIS ML API.
  // When absent or invalid, retain the original engineering calculation.
  const suppliedGeneration = Number(raw.annualGenerationOverride);
  const annualGeneration =
    Number.isFinite(suppliedGeneration) && suppliedGeneration > 0
      ? suppliedGeneration
      : engineeringAnnualGeneration;

  const monthlyGeneration =
    annualGeneration / 12;

  const noBatteryResult = calculateAnnualSavings({
    generation: annualGeneration,
    annualConsumption,
    tariff: input.tariff,
    batterySize: 0,
  });

  const batteryResult = calculateAnnualSavings({
    generation: annualGeneration,
    annualConsumption,
    tariff: input.tariff,
    batterySize: input.batterySize,
  });

  const savingsWithoutBattery = Math.min(
    noBatteryResult.savings,
    annualBill
  );

  const savingsWithBattery =
    input.batterySize > 0
      ? Math.min(
          batteryResult.savings,
          annualBill
        )
      : savingsWithoutBattery;

  const annualSavings =
    input.batterySize > 0
      ? savingsWithBattery
      : savingsWithoutBattery;

  const batteryAnnualBenefit = Math.max(
    savingsWithBattery - savingsWithoutBattery,
    0
  );

  const estimatedBatteryCost =
    input.batterySize * BATTERY_COST_PER_KWH;

  const totalInvestmentWithBattery =
    input.installationCost + estimatedBatteryCost;

  const paybackYears =
    annualSavings > 0
      ? input.installationCost / annualSavings
      : Infinity;

  const paybackWithBattery =
    savingsWithBattery > 0
      ? totalInvestmentWithBattery / savingsWithBattery
      : Infinity;

  const roi =
    input.installationCost > 0
      ? (annualSavings / input.installationCost) * 100
      : 0;

  const co2Reduction =
    annualGeneration * CO2_KG_PER_KWH;

  const solarShare = clamp(
    (
      Math.min(
        annualGeneration,
        annualConsumption
      ) /
      Math.max(annualConsumption, 1)
    ) * 100,
    0,
    100
  );

  const generationCoverage =
    annualConsumption > 0
      ? annualGeneration / annualConsumption
      : 0;

  const suitableCapacityLow =
    (
      annualConsumption /
      (
        PEAK_SUN_HOURS *
        365 *
        PERFORMANCE_RATIO *
        panelFactor
      )
    ) * 0.85;

  const suitableCapacityHigh =
    (
      annualConsumption /
      (
        PEAK_SUN_HOURS *
        365 *
        PERFORMANCE_RATIO *
        panelFactor
      )
    ) * 1.15;

  const oversized =
    input.systemCapacity > suitableCapacityHigh;

  const undersized =
    input.systemCapacity < suitableCapacityLow;

  let recommendation;

  if (undersized) {
    recommendation =
      `Your ${input.systemCapacity.toFixed(1)} kW system is likely undersized for the entered consumption. A system around ${Math.max(
        0.5,
        suitableCapacityLow
      ).toFixed(1)}–${Math.max(
        0.5,
        suitableCapacityHigh
      ).toFixed(1)} kW would better match the estimated annual demand.`;
  } else if (oversized) {
    recommendation =
      `The ${input.systemCapacity.toFixed(1)} kW system is estimated to generate about ${Math.round(
        annualGeneration
      ).toLocaleString("en-IN")} kWh per year, compared with your entered annual use of ${Math.round(
        annualConsumption
      ).toLocaleString("en-IN")} kWh. Consider a smaller system or confirm that export/net-metering arrangements make the additional generation useful.`;
  } else if (input.batterySize === 0) {
    recommendation =
      "The selected solar capacity is reasonably matched to the estimated consumption. A battery is optional and should mainly be considered for backup power or higher self-consumption.";
  } else if (
    batteryAnnualBenefit < estimatedBatteryCost * 0.12
  ) {
    recommendation =
      "The battery provides additional energy independence, but its additional financial return is relatively modest under the current assumptions. Consider it mainly if backup power or higher self-consumption is important.";
  } else {
    recommendation =
      "The selected solar and battery configuration is reasonably balanced for the entered consumption. Review the payback period and long-term savings before finalizing the system.";
  }

  /*
   * Calculate separate lifetime projections for solar-only and
   * solar + battery. This prevents battery cost/savings from
   * leaking into the solar-only result.
   */
  const buildProjection = (batterySize) => {
    let cumulativeSavings = 0;

    return Array.from(
      { length: input.lifetime },
      (_, index) => {
        const year = index + 1;

        const degradedGeneration =
          annualGeneration *
          Math.pow(1 - ANNUAL_DEGRADATION, index);

        const calculation = calculateAnnualSavings({
          generation: degradedGeneration,
          annualConsumption,
          tariff: input.tariff,
          batterySize,
        });

        const yearlySavings = Math.min(
          calculation.savings,
          annualBill
        );

        cumulativeSavings += yearlySavings;

        return {
          year,
          generation: degradedGeneration,
          savings: yearlySavings,
          cumulativeSavings,
        };
      }
    );
  };

  const yearlyProjection =
    buildProjection(input.batterySize);

  const solarOnlyProjection =
    buildProjection(0);

  const lifetimeGrossSavings =
    yearlyProjection.reduce(
      (sum, row) => sum + row.savings,
      0
    );

  const solarOnlyLifetimeGrossSavings =
    solarOnlyProjection.reduce(
      (sum, row) => sum + row.savings,
      0
    );

  /*
   * FIX: Public-facing net savings must not display a negative
   * "savings" figure. If lifetime bill savings do not recover
   * the investment, report ₹0 and explain the result in the UI.
   */
  const rawLongTermSavings =
    solarOnlyLifetimeGrossSavings -
    input.installationCost;

  const rawLongTermSavingsWithBattery =
    lifetimeGrossSavings -
    totalInvestmentWithBattery;

  const longTermSavings = Math.max(
    0,
    rawLongTermSavings
  );

  const longTermSavingsWithBattery = Math.max(
    0,
    input.batterySize > 0
      ? rawLongTermSavingsWithBattery
      : rawLongTermSavings
  );

  const batteryInvestmentNotRecovered =
    input.batterySize > 0 &&
    rawLongTermSavingsWithBattery < 0;

  const solarToHome =
    batteryResult.solarToHome;

  const solarToBattery =
    batteryResult.solarToBattery;

  const solarToGrid =
    batteryResult.solarToGrid;

  const batteryToHome =
    batteryResult.batteryToHome;

  return {
    input,

    assumptions: {
      peakSunHours: PEAK_SUN_HOURS,
      performanceRatio: PERFORMANCE_RATIO,
      bifacialGain: BIFACIAL_GAIN,
      co2KgPerKwh: CO2_KG_PER_KWH,
      degradation: ANNUAL_DEGRADATION,
      exportRateFactor: EXPORT_RATE_FACTOR,
      batteryCostPerKwh: BATTERY_COST_PER_KWH,
    },

    annualConsumption,
    annualBill,
    annualGeneration,
    engineeringAnnualGeneration,
    generationSource:
      Number.isFinite(suppliedGeneration) && suppliedGeneration > 0
        ? "PVGIS ML + engineering blend"
        : "Engineering estimate",
    monthlyGeneration,
    annualSavings,

    monthlySavings:
      annualSavings / 12,

    savingsWithoutBattery,
    savingsWithBattery,
    batteryAnnualBenefit,
    estimatedBatteryCost,
    totalInvestmentWithBattery,
    paybackYears,
    paybackWithBattery,
    roi,
    longTermSavings,
    longTermSavingsWithBattery,
    batteryInvestmentNotRecovered,
    lifetimeGrossSavings,
    co2Reduction,
    solarShare,
    generationCoverage,

    noBattery: {
      annualSavings: savingsWithoutBattery,

      investment:
        input.installationCost,

      payback:
        input.installationCost /
        Math.max(savingsWithoutBattery, 1),

      lifetimeNetSavings:
        longTermSavings,
    },

    withBattery: {
      annualSavings: savingsWithBattery,

      investment:
        totalInvestmentWithBattery,

      payback:
        paybackWithBattery,

      lifetimeNetSavings:
        longTermSavingsWithBattery,
    },

    energyFlow: {
      solarToHome,
      solarToBattery,
      solarToGrid,
      batteryToHome,
    },

    suitableCapacity: {
      low: Math.max(
        0.5,
        suitableCapacityLow
      ),

      high: Math.max(
        0.5,
        suitableCapacityHigh
      ),
    },

    flags: {
      oversized,
      undersized,
      batteryPresent: input.batterySize > 0,
    },

    recommendation,
    yearlyProjection,
  };
}

export function formatINR(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }
  ).format(Number(value));
}

export function formatNumber(
  value,
  digits = 0
) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }
  ).format(Number(value));
}